import type { TaskContext } from "../src/task/mod.ts";
import {
  compositeAction,
  type Expression,
  fromJSON,
  jsonValue,
  present,
  rawNode,
  type TaskStepDefinition,
  textValue,
  workflow,
} from "../src/github_actions/mod.ts";

function assertTypedIO(): void {
  const contract = jsonValue({
    parse(value: unknown): readonly string[] {
      if (!Array.isArray(value)) throw new TypeError();
      return value as string[];
    },
  });
  const first = workflow(".github/workflows/typed.yml", {
    on: { push: {} },
  }).job("detect", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "find",
        name: "Find",
        outputs: { targets: { contract, required: false } },
        run: async ({ outputs }) => {
          await outputs.set("targets", ["dev"]);
          // @ts-expect-error output values follow the declared contract
          await outputs.set("targets", "dev");
        },
      })
      .outputs(({ steps }) => ({ targets: steps.find.outputs.targets })));

  first.job(
    "unguarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          inputs: ({ needs }) => {
            // @ts-expect-error optional JSON reference has no inferred parsed type without a guard
            const parsed: Expression<readonly string[]> = fromJSON(
              needs.detect.outputs.targets,
            );
            void parsed;
            return {
              targets: { contract, from: needs.detect.outputs.targets },
            };
          },
          run: ({ inputs }) => {
            // @ts-expect-error an optional source is nullable without a presence proof
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "guarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .when(({ needs }) => present(needs.detect.outputs.targets))
        .strategy(({ needs }) => ({
          matrix: { target: fromJSON(needs.detect.outputs.targets) },
        }))
        .task({
          name: "Consume",
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "step-guarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          if: ({ needs }) => present(needs.detect.outputs.targets).and(true),
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "replaced-guard",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .when(({ needs }) => present(needs.detect.outputs.targets))
        .when(({ github }) => github.ref.ne(""))
        .task({
          name: "Consume",
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            // @ts-expect-error the second when replaces the first proof
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "or-guarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          if: ({ needs }) => present(needs.detect.outputs.targets).or(true),
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            // @ts-expect-error OR does not prove presence
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "raw-guarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          if: rawNode<boolean>("needs.detect.outputs.targets != ''"),
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            // @ts-expect-error raw expressions do not prove presence
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  first.job(
    "not-guarded",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          if: ({ needs }) => present(needs.detect.outputs.targets).not(),
          inputs: ({ needs }) => ({
            targets: {
              contract,
              from: needs.detect.outputs.targets,
            },
          }),
          run: ({ inputs }) => {
            // @ts-expect-error negation does not prove presence
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  const conditional = workflow(".github/workflows/conditional.yml", {
    on: { push: {} },
  }).job("produce", ({ job }) =>
    job.runsOn("ubuntu-latest").task({
      id: "value",
      name: "Value",
      inputs: {},
      if: rawNode<boolean>("false"),
      outputs: { item: { contract, required: true } },
      run: async ({ outputs }) => {
        await outputs.set("item", []);
      },
    }).outputs(({ steps }) => ({ item: steps.value.outputs.item })));
  conditional.job(
    "consume",
    ({ job, jobs }) =>
      job.needs(jobs.produce).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          inputs: ({ needs }) => ({
            item: { contract, from: needs.produce.outputs.item },
          }),
          run: ({ inputs }) => {
            // @ts-expect-error a skipped producer can omit a required output
            const item: readonly string[] = inputs.item;
            void item;
          },
        }),
  );

  const text = textValue();
  const textJob = workflow(".github/workflows/text.yml", {
    on: { push: {} },
  })
    .job("produce", ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        id: "value",
        name: "Value",
        outputs: { item: { contract: text, required: true } },
        run: async ({ outputs }) => {
          await outputs.set("item", "hello");
        },
      }).outputs(({ steps }) => ({ item: steps.value.outputs.item })));
  textJob.job(
    "consume",
    ({ job, jobs }) =>
      job.needs(jobs.produce).runsOn("ubuntu-latest")
        .run({
          name: "Noop",
          run: "true",
          env: ({ needs }) => ({
            ITEM: (() => {
              // @ts-expect-error fromJSON does not infer a JSON value from a text contract
              const value: Expression<readonly string[]> = fromJSON(
                needs.produce.outputs.item,
              );
              void value;
              return needs.produce.outputs.item;
            })(),
          }),
        }),
  );
}
void assertTypedIO;

function assertOptionalTaskContracts(): void {
  workflow("optional.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .task({
          id: "empty",
          name: "Empty",
          run: ({ inputs, outputs }) => {
            // @ts-expect-error omitted inputs expose no names
            void inputs.missing;
            // @ts-expect-error omitted outputs accept no names
            void outputs.set("missing", "value");
          },
        })
        .task({
          id: "produce",
          name: "Produce",
          outputs: { value: { contract: textValue(), required: true } },
          run: async ({ inputs, outputs }) => {
            // @ts-expect-error omitted inputs expose no names
            void inputs.missing;
            await outputs.set("value", "value");
            // @ts-expect-error declared output retains its value type
            await outputs.set("value", 1);
          },
        })
        .task({
          id: "consume",
          name: "Consume",
          if: ({ steps }) => present(steps.produce.outputs.value),
          inputs: ({ steps }) => ({
            value: { contract: textValue(), from: steps.produce.outputs.value },
          }),
          run: ({ inputs, outputs }) => {
            const value: string = inputs.value;
            void value;
            // @ts-expect-error omitted outputs accept no names
            void outputs.set("missing", "value");
          },
        })
        .run({
          name: "Check references",
          run: "true",
          shell: "bash",
          env: ({ steps }) => {
            // @ts-expect-error empty task has no output names
            void steps.empty.outputs.missing;
            // @ts-expect-error input-only task has no output names
            void steps.consume.outputs.missing;
            return { VALUE: steps.produce.outputs.value };
          },
        }),
  );
  compositeAction("actions/optional/action.yml", {
    name: "Optional",
    description: "Optional contracts",
  }).steps(({ step }) =>
    step
      .task({
        id: "empty",
        name: "Empty",
        run: ({ inputs, outputs }) => {
          // @ts-expect-error omitted inputs expose no names
          void inputs.missing;
          // @ts-expect-error omitted outputs accept no names
          void outputs.set("missing", "value");
        },
      })
      .task({
        id: "produce",
        name: "Produce",
        outputs: { value: { contract: textValue(), required: true } },
        run: async ({ inputs, outputs }) => {
          // @ts-expect-error omitted inputs expose no names
          void inputs.missing;
          await outputs.set("value", "value");
          // @ts-expect-error declared output retains its value type
          await outputs.set("value", 1);
        },
      })
      .task({
        id: "consume",
        name: "Consume",
        if: ({ steps }) => present(steps.produce.outputs.value),
        inputs: ({ steps }) => ({
          value: { contract: textValue(), from: steps.produce.outputs.value },
        }),
        run: ({ inputs, outputs }) => {
          const value: string = inputs.value;
          void value;
          // @ts-expect-error omitted outputs accept no names
          void outputs.set("missing", "value");
        },
      })
      .run({
        name: "Check references",
        run: "true",
        shell: "bash",
        env: ({ steps }) => {
          // @ts-expect-error empty task has no output names
          void steps.empty.outputs.missing;
          // @ts-expect-error input-only task has no output names
          void steps.consume.outputs.missing;
          return { VALUE: steps.produce.outputs.value };
        },
      }).outputs(() => ({}))
  );
}
void assertOptionalTaskContracts;

function rejectPhantomTaskContracts(): void {
  type I = {
    value: { contract: ReturnType<typeof textValue>; from: Expression<string> };
  };
  type O = {
    value: { contract: ReturnType<typeof textValue>; required: true };
  };
  const typedRun = (_context: TaskContext<I, O>) => {};
  // @ts-expect-error annotated nonempty contracts require both declarations
  const phantom: TaskStepDefinition<undefined, I, O> = {
    name: "Phantom",
    run: typedRun,
  };
  void phantom;
  type Empty = Record<never, never>;
  const declared: TaskStepDefinition<
    undefined,
    I,
    O,
    Empty,
    Empty,
    Empty,
    string,
    string,
    Empty
  > = {
    name: "Declared",
    inputs: ({ github }) => ({
      value: { contract: textValue(), from: github.sha },
    }),
    outputs: { value: { contract: textValue(), required: true } },
    run: typedRun,
  };

  workflow("phantom.yml", { on: { push: {} } }).job("test", ({ job }) => {
    const execution = job.runsOn("ubuntu-latest");
    void declared;
    execution.task({
      name: "Phantom",
      // @ts-expect-error run annotations cannot introduce undeclared contracts
      run: typedRun,
    });
    // @ts-expect-error explicit nonempty input types require their declarations
    execution.task<undefined, I, Record<never, never>, undefined>({
      name: "Input phantom",
      run: () => {},
    });
    // @ts-expect-error explicit nonempty output types require their declarations
    execution.task<undefined, Record<never, never>, O, undefined>({
      name: "Output phantom",
      run: () => {},
    });
    execution.task<undefined, I, Record<never, never>, undefined>({
      name: "Undefined input",
      // @ts-expect-error nonempty input contracts cannot be undefined
      inputs: undefined,
      run: () => {},
    });
    execution.task<undefined, Record<never, never>, O, undefined>({
      name: "Undefined output",
      // @ts-expect-error nonempty output contracts cannot be undefined
      outputs: undefined,
      run: () => {},
    });
    return execution.task({ name: "Empty", run: () => {} });
  });
  compositeAction("actions/phantom/action.yml", {
    name: "Phantom",
    description: "Phantom contracts",
  }).steps(({ step }) => {
    step.task({
      name: "Phantom",
      // @ts-expect-error run annotations cannot introduce undeclared contracts
      run: typedRun,
    });
    return step.task({ name: "Empty", run: () => {} }).outputs(() => ({}));
  });
}
void rejectPhantomTaskContracts;
