import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  compositeAction,
  literal,
  project,
  rawExpression,
  workflow,
} from "../src/github_actions/mod.ts";
import {
  lowerProject,
  taskEntrypointSuffixes,
} from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { validateWorkflow } from "../src/compiler/github_actions/validation.ts";
import { parse } from "../src/deps.ts";
import {
  scenario,
  ScenarioError,
  type ScenarioObservation,
} from "../src/testing/mod.ts";

Deno.test("native parallel/task lowering prepares once outside groups and keeps IDs and action annotations", () => {
  const action = compositeAction("actions/value/action.yml", {
    name: "Value",
    description: "Value",
    outputs: { value: { description: "Value" } },
  })
    .steps(({ step }) =>
      step.run({ name: "Value", shell: "bash", run: "true" }).outputs(() => ({
        value: literal("constant"),
      }))
    );
  const ci = workflow("ci.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) => {
      const grouped = job.runsOn("ubuntu-latest").parallel((group) => [
        group.task({ name: "Anonymous", run: () => {} }),
        group.task({ id: "task-1", name: "Named", run: () => {} }),
        group.uses(action, { id: "action" }),
        group.uses({
          uses: "org/action@sha",
          originalRef: "v1",
          name: "Action",
          description: "Action",
        }, {}),
      ]);
      const started = grouped.task({
        id: "bg",
        name: "Background",
        background: true,
        outputs: { value: { required: true } },
        run: () => {},
      });
      return started.cancel(started.steps.bg).wait(started.steps.bg).waitAll()
        .outputs(({ steps }) => ({ value: steps.bg.outputs.value }));
    },
  );
  const config = project({ workflows: [ci] });
  const lowered = lowerProject(config, "./entry.ts");
  assertEquals(lowered.actions.length, 1);
  assertEquals(taskEntrypointSuffixes(config.workflows[0].jobs[0].steps), [
    "task-2",
    "task-1",
    "bg",
  ]);
  assertEquals(lowered.tasks.map((task) => task.entrypoint), [
    "ci.yml/build/task-2",
    "ci.yml/build/task-1",
    "ci.yml/build/bg",
  ]);
  const emitted = emitWorkflow(lowered.workflows[0].workflow);
  assert(emitted.includes("# v1"));
  const yaml = parse(emitted) as {
    jobs: { build: { steps: Record<string, unknown>[] } };
  };
  const steps = yaml.jobs.build.steps;
  const groupIndex = steps.findIndex((step) => "parallel" in step);
  assert(groupIndex >= 2);
  assertEquals(
    steps.filter((step) => step.name === "Prepare task artifact").length,
    1,
  );
  assertEquals(steps[groupIndex - 1].name, "Prepare task artifact");
  assertEquals(steps[groupIndex - 1].background, undefined);
  assertEquals(
    (steps[groupIndex].parallel as Record<string, unknown>[]).map((step) =>
      step.id
    ),
    [undefined, "task-1", "action", undefined],
  );
  assertEquals(
    steps.slice(groupIndex + 1).map((step) =>
      step.background ?? step.cancel ?? step.wait ??
        ("wait-all" in step ? "all" : undefined)
    ),
    [true, "bg", "bg", "all"],
  );
});

Deno.test("selective synchronization publishes outputs and environment only at joins; cancel retains supplied outcome", async () => {
  const ci = workflow("sync.yml", {
    on: { push: {} },
    env: { FLAG: "initial" },
  }).job("build", ({ job }) => {
    const started = job.runsOn("ubuntu-latest")
      .run({
        id: "one",
        name: "One",
        run: "true",
        outputs: ["value"],
        background: true,
      })
      .run({
        id: "two",
        name: "Two",
        run: "true",
        outputs: ["value"],
        background: true,
      })
      .run({
        id: "early",
        name: "Early",
        run: "true",
        env: () => ({
          VALUE: rawExpression("steps.one.outputs.value"),
          FLAG: rawExpression("env.FLAG"),
        }),
      });
    const joined = started.wait(started.steps.one).run({
      id: "middle",
      name: "Middle",
      run: "true",
      env: ({ steps }) => ({
        VALUE: steps.one.outputs.value,
        OTHER: rawExpression("steps.two.outputs.value"),
        FLAG: rawExpression("env.FLAG"),
      }),
    });
    return joined.cancel(joined.steps.two).run({
      id: "late",
      name: "Late",
      run: "true",
      env: () => ({ OTHER: rawExpression("steps.two.outputs.value") }),
    })
      .outputs(({ steps }) => ({ two: steps.two.outputs.value }));
  });
  const observations: ScenarioObservation[] = [];
  const result = await scenario(
    ci,
    (test) =>
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
        .job("build", (job) => {
          job.step("one").fixture({
            outputs: { value: "one" },
            environmentChanges: { FLAG: "ready" },
          });
          job.step("two").fixture({ outputs: { value: "two" } });
          job.step("early").fixture(({ env }) => {
            assertEquals(env, { VALUE: "", FLAG: "initial" });
            return {};
          });
          job.step("middle").fixture(({ env }) => {
            assertEquals(env, { VALUE: "one", OTHER: "", FLAG: "ready" });
            return {};
          });
          job.step("late").fixture(({ env }) => {
            assertEquals(env, { FLAG: "ready", OTHER: "" });
            return {};
          });
          job.expectStepOrder("one", "two", "early", "middle", "late");
          job.expectOutputs({ two: "two" });
        }),
    { observe: (event) => observations.push(event) },
  );
  assertEquals(
    result.jobs.build.instances[0].steps.two.cancellationRequested,
    true,
  );
  assertEquals(result.jobs.build.instances[0].steps.two.outcome, "success");
  assert(observations.some((event) => event.stage === "background-cancel"));
  assert(!JSON.stringify(observations).includes("ready"));
  const launches = observations.filter((event) =>
    event.stage === "background-start" && event.status === "start"
  );
  assertEquals(launches.length, 2);
  for (
    const start of observations.filter((event) => event.status === "start")
  ) {
    const completion = observations.filter((event) =>
      event.operationId === start.operationId && event.status !== "start"
    );
    assertEquals(completion.length, 1);
    assertEquals(completion[0].stage, start.stage);
  }
  const cancel = observations.find((event) =>
    event.stage === "background-cancel"
  );
  assertEquals(cancel?.links, [launches[1].operationId]);
  assert(
    observations.some((event) =>
      event.stage === "background-join" &&
      event.links?.includes(launches[0].operationId)
    ),
  );
  const withoutSink = await scenario(
    ci,
    (test) =>
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
        .job("build", (job) => {
          for (
            const id of ["one", "two", "early", "middle", "late"] as const
          ) job.step(id).fixture({});
        }),
    {
      observe: () => {
        throw new Error("sink failure");
      },
    },
  );
  assertEquals(withoutSink.result, "success");
});

Deno.test("background failure is deferred until wait, with producer tolerance and unconditional controls", async () => {
  for (const tolerated of [false, true]) {
    const ci = workflow("failure.yml", { on: { push: {} } }).job(
      "build",
      ({ job }) => {
        const started = job.runsOn("ubuntu-latest").run({
          id: "bad",
          name: "Bad",
          run: "false",
          background: true,
          continueOnError: tolerated,
        })
          .run({ id: "before", name: "Before", run: "true" });
        return started.wait(started.steps.bad).run({
          id: "after",
          name: "After",
          run: "true",
        }).waitAll();
      },
    );
    await scenario(
      ci,
      (test) =>
        test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
          .job("build", (job) => {
            job.step("bad").fixture({ outcome: "failure" });
            job.step("before").fixture({}).expectRun();
            if (tolerated) job.step("after").fixture({}).expectRun();
            else job.step("after").expectSkip();
            job.expectResult(tolerated ? "success" : "failure");
          }),
    );
  }
});

Deno.test("parallel siblings share pre-group inputs and group failure does not prevent siblings", async () => {
  const ci = workflow("parallel.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .parallel((group) => [
          group.run({
            id: "one",
            name: "One",
            run: "false",
            outputs: ["value"],
          }),
          group.task({
            id: "two",
            name: "Two",
            outputs: { value: { required: true } },
            env: () => ({ SIBLING: rawExpression("steps.one.outputs.value") }),
            run: () => {
              throw new Error("must not execute");
            },
          }),
        ]).run({ id: "after", name: "After", run: "true" }),
  );
  await scenario(
    ci,
    (test) =>
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
        .job("build", (job) => {
          job.step("one").fixture({ outcome: "failure" });
          job.step("two").fixture(({ env }) => {
            assertEquals(env.SIBLING, "");
            return { outputs: { value: "two" } };
          }).expectRun();
          job.step("after").expectSkip();
          job.expectResult("failure");
        }),
  );
});

Deno.test("skipped background work and cancellation outcomes retain their fixture boundaries", async () => {
  const ci = workflow("skip.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) => {
      const started = job.runsOn("ubuntu-latest").run({
        id: "skip",
        name: "Skip",
        run: "true",
        if: () => rawExpression("false"),
        background: true,
      })
        .run({
          id: "cancelled",
          name: "Cancelled",
          run: "true",
          background: true,
        });
      return started.cancel(started.steps.cancelled).wait(
        started.steps.skip,
        started.steps.cancelled,
      ).run({ id: "after", name: "After", run: "true" });
    },
  );
  await scenario(
    ci,
    (test) =>
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
        .job("build", (job) => {
          job.step("skip").expectSkip();
          job.step("cancelled").fixture({ outcome: "cancelled" });
          job.step("after").expectSkip();
          job.expectResult("cancelled");
        }),
  );
});

Deno.test("ambiguous parallel environment writes fail without assuming completion order", async () => {
  const ci = workflow("env.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").parallel((group) => [
        group.run({ id: "one", name: "One", run: "true" }),
        group.run({ id: "two", name: "Two", run: "true" }),
      ]),
  );
  await assertRejects(
    () =>
      scenario(
        ci,
        (test) =>
          test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
            .job("build", (job) => {
              job.step("one").fixture({ environmentChanges: { FLAG: "one" } });
              job.step("two").fixture({ environmentChanges: { FLAG: "two" } });
            }),
      ),
    ScenarioError,
    "Conflicting asynchronous environment writes",
  );
});

Deno.test("native validation rejects malformed controls, groups and duplicate child IDs", () => {
  const base = lowerProject(
    project({
      workflows: [
        workflow("ci.yml", { on: { push: {} } }).job(
          "build",
          ({ job }) =>
            job.runsOn("ubuntu-latest").run({
              id: "one",
              name: "One",
              run: "true",
              background: true,
            }),
        ),
      ],
    }),
    "./entry.ts",
  ).workflows[0].workflow;
  const badGroups: unknown[] = [
    { type: "wait", targets: ["missing"] },
    { type: "cancel", targets: ["one", "one"] },
    { type: "wait-all", targets: [], if: "false" },
    { type: "parallel", steps: [] },
    { type: "parallel", steps: [{ type: "run", id: "one", run: "true" }] },
    {
      type: "parallel",
      steps: [{ type: "run", run: "true", background: true }],
    },
  ];
  for (const bad of badGroups) {
    const result = validateWorkflow(
      {
        ...base,
        jobs: [{ ...base.jobs[0], steps: [...base.jobs[0].steps, bad] }],
      } as typeof base,
    );
    assertEquals(result.ok, false);
  }
  assertThrows(
    () =>
      workflow("ci.yml", { on: { push: {} } }).job(
        "build",
        ({ job }) =>
          job.runsOn("ubuntu-latest").parallel(
            (group) => [
              group.run({ id: "same", name: "One", run: "true" }),
              group.run({ id: "same", name: "Two", run: "true" }),
            ],
          ),
      ),
    TypeError,
    "duplicated",
  );
});

Deno.test("parallel task outputs preserve native contracts through joined inputs and final job outputs", async () => {
  const ci = workflow("io.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .parallel((group) => [
          group.task({
            id: "producer",
            name: "Producer",
            outputs: { value: { required: true } },
            run: () => {
              throw new Error("fixture only");
            },
          }),
          group.run({ id: "shell", name: "Shell", run: "true" }),
        ]).task({
          id: "consumer",
          name: "Consumer",
          inputs: ({ steps }) => ({
            value: { from: steps.producer.outputs.value },
          }),
          run: () => {
            throw new Error("fixture only");
          },
        })
        .outputs(({ steps }) => ({ value: steps.producer.outputs.value })),
  );
  await scenario(
    ci,
    (test) =>
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
        .job("build", (job) => {
          job.step("producer").fixture({ outputs: { value: "value" } });
          job.step("shell").fixture({});
          job.step("consumer").fixture({}).expectInputs({ value: "value" });
          job.expectOutputs({ value: "value" });
        }),
  );
});

Deno.test("uncertain background settings synchronize both runtime branches with wait-all", async () => {
  for (const enabled of [false, true]) {
    const ci = workflow("uncertain.yml", { on: { push: {} } }).job(
      "build",
      ({ job }) => {
        const definition: {
          id: "producer";
          name: string;
          run: string;
          outputs: readonly ["value"];
          background?: boolean;
        } = {
          id: "producer",
          name: "Producer",
          run: "true",
          outputs: ["value"],
          background: enabled,
        };
        const joined = job.runsOn("ubuntu-latest").run(definition).waitAll();
        return joined.outputs(({ steps }) => ({
          value: steps.producer.outputs.value,
        }));
      },
    );
    const result = await scenario(
      ci,
      (test) =>
        test.github({ event_name: "push", ref: "refs/heads/main", event: {} })
          .job("build", (job) => {
            job.step("producer").fixture({ outputs: { value: "ready" } });
            job.expectOutputs({ value: "ready" });
          }),
    );
    assertEquals(result.jobs.build.outputs, { value: "ready" });
  }
});
