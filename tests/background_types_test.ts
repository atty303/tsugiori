import { compositeAction, workflow } from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";

function verifyTypes() {
  const action = {
    name: "Action",
    description: "Action",
    uses: "owner/action@v1",
    outputs: { version: { description: "Version" } },
  } as const;
  const enabled = Boolean(Deno.env.get("BACKGROUND"));
  workflow("dynamic.yml", { on: { push: {} } }).job("dynamic", ({ job }) => {
    const state = job.runsOn("ubuntu-latest").run({
      id: "maybe",
      name: "Maybe",
      run: "true",
      outputs: ["value"],
      background: enabled,
    });
    // @ts-expect-error a widened boolean may launch asynchronously
    state.steps.maybe.outputs.value;
    // @ts-expect-error an uncertain producer may actually be synchronous
    state.wait(state.steps.maybe);
    // @ts-expect-error cancel likewise requires a definite background producer
    state.cancel(state.steps.maybe);
    state.run({
      name: "Early",
      run: "true",
      env: ({ steps }) => ({
        // @ts-expect-error callback contexts also exclude uncertain producers
        VALUE: steps.maybe.outputs.value,
      }),
    });
    const joined = state.waitAll();
    joined.steps.maybe.outputs.value;
    joined.run({
      name: "Joined",
      run: "true",
      env: ({ steps }) => ({ VALUE: steps.maybe.outputs.value }),
    });
    state.outputs(({ steps }) => ({ value: steps.maybe.outputs.value }));
    return joined;
  });
  const optional: {
    id: "optional";
    name: string;
    run: string;
    outputs: readonly ["value"];
    background?: boolean;
  } = {
    id: "optional",
    name: "Optional",
    run: "true",
    outputs: ["value"],
    background: true,
  };
  workflow("optional.yml", { on: { push: {} } }).job("build", ({ job }) => {
    const state = job.runsOn("ubuntu-latest").run(optional);
    // @ts-expect-error optional background may be true, so outputs are hidden
    state.steps.optional.outputs.value;
    // @ts-expect-error optional background may be absent, so selective wait is unsafe
    state.wait(state.steps.optional);
    state.run({
      name: "Early",
      run: "true",
      env: ({ steps }) => ({
        // @ts-expect-error optional background is also excluded from callbacks
        VALUE: steps.optional.outputs.value,
      }),
    });
    const joined = state.waitAll();
    joined.steps.optional.outputs.value;
    joined.run({
      name: "Joined",
      run: "true",
      env: ({ steps }) => ({ VALUE: steps.optional.outputs.value }),
    });
    return state.outputs(({ steps }) => ({
      value: steps.optional.outputs.value,
    }));
  });
  const ci = workflow("background.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) => {
      const started = job.runsOn("ubuntu-latest")
        .run({
          id: "shell",
          name: "Shell",
          run: "true",
          outputs: ["version"],
          background: true,
        })
        .uses(action, { id: "action", background: true })
        .task({
          id: "task",
          name: "Task",
          background: true,
          outputs: { version: { required: true } },
          run: () => {},
        });
      // @ts-expect-error asynchronous shell output is hidden
      started.steps.shell.outputs.version;
      // @ts-expect-error asynchronous Action output is hidden
      started.steps.action.outputs.version;
      // @ts-expect-error asynchronous task output is hidden
      started.steps.task.outputs.version;
      started.run({
        name: "Early",
        run: "true",
        env: ({ steps }) => ({
          // @ts-expect-error field contexts omit unsynchronized producers
          VERSION: steps.task.outputs.version,
        }),
      });
      const joined = started.wait(started.steps.shell, started.steps.action);
      joined.steps.shell.outputs.version;
      joined.steps.action.outputs.version;
      // @ts-expect-error selective wait does not join task
      joined.steps.task.outputs.version;
      // @ts-expect-error old immutable state is still unsynchronized
      started.steps.shell.outputs.version;
      const stopped = joined.cancel(joined.steps.task);
      // @ts-expect-error cancel does not expose outputs
      stopped.steps.task.outputs.version;
      stopped.parallel((group) => {
        const child = group.run({
          id: "child",
          name: "Child",
          run: "true",
          outputs: ["value"],
        });
        // @ts-expect-error independent branches do not expose sibling outputs
        child.steps.child.outputs.value;
        // @ts-expect-error independent branches cannot append sequential work
        child.run({ name: "Extra", run: "true" });
        // @ts-expect-error parallel children have implicit background semantics
        group.run({ name: "Extra", run: "true", background: true });
        return [child];
      });
      const grouped = stopped.parallel((group) => [
        group.run({
          id: "frontend",
          name: "Frontend",
          run: "true",
          outputs: ["value"],
        }),
        group.task({
          id: "backend",
          name: "Backend",
          outputs: { value: { required: true } },
          run: () => {},
        }),
        group.run({
          id: "independent",
          name: "Independent",
          run: "true",
          env: ({ steps }) => ({
            // @ts-expect-error sibling outputs are unavailable
            VALUE: steps.frontend.outputs.value,
          }),
        }),
      ]);
      grouped.steps.frontend.outputs.value;
      grouped.steps.backend.outputs.value;
      // @ts-expect-error parallel does not join unrelated pending work
      grouped.steps.task.outputs.version;
      // @ts-expect-error unknown step is not introduced by parallel
      grouped.steps.missing;
      // @ts-expect-error normal step is not a control reference
      grouped.wait(grouped.steps.frontend);
      // @ts-expect-error controls do not accept strings
      grouped.wait("task");
      // @ts-expect-error empty wait is not accepted
      grouped.wait();
      const all = grouped.waitAll();
      all.steps.task.outputs.version;
      return grouped.outputs(({ steps }) => ({
        version: steps.task.outputs.version,
      }));
    },
  );
  const other = workflow("other.yml", { on: { push: {} } }).job(
    "other",
    ({ job }) => {
      const state = job.runsOn("ubuntu-latest").run({
        id: "elsewhere",
        name: "Elsewhere",
        run: "true",
        background: true,
      });
      ci.job("next", ({ job }) => {
        const local = job.runsOn("ubuntu-latest").run({
          id: "local",
          name: "Local",
          run: "true",
          background: true,
        });
        // @ts-expect-error foreign owner
        local.wait(state.steps.elsewhere);
        return local;
      });
      return state;
    },
  );
  void other;
  void scenario(ci, (test) => {
    test.job("build", (job) => {
      job.step("task").fixture({ outputs: { version: "1" } });
      job.step("backend").fixture({ outputs: { value: "2" } });
      // @ts-expect-error native task fixture shape survived async and group authoring
      job.step("backend").fixture({ outputs: { value: 2 } });
      // @ts-expect-error no fictional fixture IDs
      job.step("missing");
    });
  });
  compositeAction("action.yml", { name: "Composite", description: "Composite" })
    .steps(({ step }) => {
      // @ts-expect-error composite background run is forbidden
      step.run({ name: "Run", run: "true", shell: "bash", background: true });
      // @ts-expect-error composite background Action is forbidden
      step.uses(action, { background: true });
      // @ts-expect-error composite background task is forbidden
      step.task({ name: "Task", background: true, run: () => {} });
      // @ts-expect-error composite parallel is unavailable
      step.parallel(() => []);
      return step.run({ name: "Run", run: "true", shell: "bash" });
    });
}
void verifyTypes;
