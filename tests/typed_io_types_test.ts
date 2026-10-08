import type { TaskContext } from "../src/task/mod.ts";
import {
  compositeAction,
  type Expression,
  format,
  fromJSON,
  jsonValue,
  literal,
  present,
  rawNode,
  type TaskStepDefinition,
  textValue,
  workflow,
} from "../src/github_actions/mod.ts";

function assertNamedTaskHandlers(): void {
  const files = jsonValue({
    parse(value: unknown): readonly string[] {
      if (!Array.isArray(value)) throw new TypeError();
      return value as string[];
    },
  });
  const consumeFiles = (_: { inputs: { files: readonly string[] } }) => {};
  const consumeOptional = (
    _: { inputs: { files: readonly string[] | null } },
  ) => {};
  const consumeText = (_: { inputs: { text: string } }) => {};
  const consumeExtra = (_: { inputs: { text: string; missing: string } }) => {};
  const consumeLiteral = (_: { inputs: { text: "literal" } }) => {};
  const produce = async (
    { outputs }: TaskContext<
      Record<never, never>,
      { files: { contract: typeof files; required: false } }
    >,
  ) => {
    await outputs.set("files", ["main.ts"]);
  };

  workflow("named.yml", { on: { push: {} } }).job("test", ({ job }) => {
    const first = job.runsOn("ubuntu-latest").task({
      name: "Text",
      inputs: ({ github }) => ({ text: { from: github.sha } }),
      run: consumeText,
    });
    first.task({
      name: "Subset",
      inputs: ({ github }) => ({
        text: { from: github.sha },
        ignored: { from: literal("value") },
      }),
      run: consumeText,
    });
    const phantomOutput = (
      _: TaskContext<Record<never, never>, { value: { required: true } }>,
    ) => {};
    first.task({
      id: "phantom",
      name: "Phantom output",
      run: phantomOutput,
    }).run({
      name: "Check declarations",
      run: "true",
      env: ({ steps }) => {
        // @ts-expect-error handler annotations cannot declare output references
        void steps.phantom.outputs.value;
        return {};
      },
    });
    const consumeUnknownMap = (_: { inputs: Record<string, unknown> }) => {};
    const consumeTextMap = (_: { inputs: Record<string, string> }) => {};
    const consumeOptionalText = (_: { inputs: { text?: string } }) => {};
    first.task({ name: "Empty map", run: consumeUnknownMap });
    first.task({ name: "Optional name", run: consumeOptionalText });
    first.task({
      name: "Unknown map",
      inputs: ({ github }) => ({ text: { from: github.sha } }),
      run: consumeUnknownMap,
    });
    first.task({
      name: "Text map",
      inputs: () => ({ text: { from: literal("text") } }),
      run: consumeTextMap,
    });
    const consumeExtraOptional = (
      _: { inputs: { text: string; extra?: string } },
    ) => {};
    const consumeIncorrectExtraOptional = (
      _: { inputs: { text: number; extra?: string } },
    ) => {};
    first.task({
      name: "Optional extra",
      inputs: () => ({ text: { from: literal("text") } }),
      run: consumeExtraOptional,
    });
    first.task({
      name: "Incorrect optional extra",
      // @ts-expect-error optional undeclared names cannot hide a mismatched native value type
      inputs: () => ({ text: { from: literal("text") } }),
      // @ts-expect-error native context is incompatible with the annotated handler
      run: consumeIncorrectExtraOptional,
    });
    const consumeCorrelated = (
      _: {
        inputs: { a: string; b: number; extra?: string } | {
          a: number;
          b: string;
          extra?: string;
        };
      },
    ) => {};
    const consumeCompatibleUnion = (
      _: {
        inputs: { a: string; b: string; extra?: string } | {
          a: number;
          b: number;
          extra?: string;
        };
      },
    ) => {};
    const consumeDifferentNames = (
      _: { inputs: { a: string } | { b: string } },
    ) => {};
    first.task({
      name: "Incompatible union",
      inputs: () => ({ a: { from: literal("a") }, b: { from: literal("b") } }),
      // @ts-expect-error property-wise unions do not prove whole-map compatibility
      run: consumeCorrelated,
    });
    first.task({
      name: "Compatible union",
      inputs: () => ({ a: { from: literal("a") }, b: { from: literal("b") } }),
      run: consumeCompatibleUnion,
    });
    first.task({
      name: "Different names",
      inputs: () => ({ a: { from: literal("a") } }),
      run: consumeDifferentNames,
    });
    const collected = first.task({
      id: "collect",
      name: "Collect",
      outputs: {
        files: { contract: files, required: false },
        text: { required: false },
      },
      run: produce,
    });
    collected.task({
      name: "Optional",
      inputs: ({ steps }) => ({ files: { from: steps.collect.outputs.files } }),
      run: consumeOptional,
    });
    collected.task({
      name: "Unguarded optional extra",
      // @ts-expect-error optional undeclared names cannot erase missing output values
      inputs: ({ steps }) => ({ text: { from: steps.collect.outputs.text } }),
      // @ts-expect-error the whole native context retains null
      run: consumeExtraOptional,
    });
    collected.task({
      name: "Incorrect map value",
      // @ts-expect-error JSON arrays are not values accepted by a text map
      inputs: ({ steps }) => ({ files: { from: steps.collect.outputs.files } }),
      // @ts-expect-error native arrays are incompatible with a text map
      run: consumeTextMap,
    });
    collected.task({
      name: "Unguarded",
      // @ts-expect-error binding values include absence without a presence proof
      inputs: ({ steps }) => ({ files: { from: steps.collect.outputs.files } }),
      // @ts-expect-error an array-only handler cannot accept a missing output
      run: consumeFiles,
    });
    first.task({
      name: "Extra",
      // @ts-expect-error handler annotations cannot add undeclared input names
      inputs: () => ({ text: { from: literal("value") } }),
      run: consumeExtra,
    });
    first.task({
      name: "Narrow",
      // @ts-expect-error the declared text contract does not produce a literal-only value
      inputs: () => ({ text: { from: literal("literal") } }),
      // @ts-expect-error text contracts cannot guarantee a literal value
      run: consumeLiteral,
    });
    return collected.task({
      id: "consume",
      name: "Consume",
      if: ({ steps }) => present(steps.collect.outputs.files),
      inputs: ({ steps }) => ({ files: { from: steps.collect.outputs.files } }),
      run: consumeFiles,
    });
  });
  compositeAction("actions/named/action.yml", {
    name: "Named",
    description: "Named task handlers",
  }).steps(({ step }) =>
    step.task({
      id: "collect",
      name: "Collect",
      outputs: { files: { contract: files, required: false } },
      run: produce,
    }).task({
      name: "Consume",
      if: ({ steps }) => present(steps.collect.outputs.files),
      inputs: ({ steps }) => ({ files: { from: steps.collect.outputs.files } }),
      run: consumeFiles,
    }).outputs(() => ({}))
  );
}
void assertNamedTaskHandlers;

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

function assertDefaultValueContracts(): void {
  const items = jsonValue({ parse: (value: unknown) => value as string[] });
  const widen = (source: Expression<string>): Expression<string> => source;
  const flow = workflow("defaults.yml", { on: { push: {} } })
    .job("produce", ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        id: "make",
        name: "Produce",
        if: undefined,
        outputs: {
          text: { required: true },
          items: { contract: items, required: false },
        },
        run: async ({ outputs }) => {
          await outputs.set("text", "hello");
          // @ts-expect-error default output values are strings
          await outputs.set("text", 1);
          // @ts-expect-error output names still follow declarations
          await outputs.set("unknown", "hello");
        },
      }).outputs(({ steps }) => ({
        text: steps.make.outputs.text,
        items: steps.make.outputs.items,
        widened: widen(steps.make.outputs.items),
      })))
    .job("consume", ({ job, jobs }) =>
      job.needs(jobs.produce)
        .runsOn("ubuntu-latest").task({
          id: "read",
          name: "Consume",
          inputs: ({ needs, github }) => ({
            text: { from: needs.produce.outputs.text },
            explicit: {
              contract: textValue(),
              from: needs.produce.outputs.text,
            },
            items: { from: needs.produce.outputs.at("items") },
            sha: { from: github.sha },
            widened: { from: widen(needs.produce.outputs.items) },
            passthrough: { from: needs.produce.outputs.widened },
            assertedContext: {
              from: needs.produce.outputs.as<{ items: string }>().at("items"),
            },
            property: {
              from: fromJSON(rawNode("'{}'")).as<{ version: string }>().at(
                "version",
              ),
            },
            mixed: {
              from: Math.random() > 0.5
                ? needs.produce.outputs.items
                : github.sha,
            },
            computed: { from: format("{0}", needs.produce.outputs.items) },
          }),
          run: ({ inputs }) => {
            const text: string = inputs.text;
            const explicit: string = inputs.explicit;
            const sha: string = inputs.sha;
            const computed: string = inputs.computed;
            const property: string = inputs.property;
            // @ts-expect-error job passthroughs retain possibly non-text contracts
            const passthrough: string = inputs.passthrough;
            // @ts-expect-error assertions cannot erase a context's runtime contracts
            const assertedContext: string = inputs.assertedContext;
            const optional: string[] | null = inputs.items;
            // @ts-expect-error widened reference contracts may parse non-text values
            const widened: string = inputs.widened;
            // @ts-expect-error a mixed reference source may parse a JSON value
            const mixed: string = inputs.mixed;
            // @ts-expect-error optional JSON inputs require a presence proof
            const required: string[] = inputs.items;
            // @ts-expect-error inherited JSON inputs are not text
            const wrong: string = inputs.items;
            void [
              text,
              explicit,
              sha,
              computed,
              property,
              passthrough,
              assertedContext,
              optional,
              widened,
              mixed,
              required,
              wrong,
            ];
          },
        }));
  // Presence proofs and inferred JSON decoding also work without explicit contracts.
  flow.job("guarded", ({ job, jobs }) =>
    job.needs(jobs.produce)
      .runsOn("ubuntu-latest").when(({ needs }) =>
        present(needs.produce.outputs.items)
      )
      .task({
        name: "Guarded",
        inputs: ({ needs }) => ({
          items: { from: needs.produce.outputs.at("items") },
        }),
        run: ({ inputs }) => {
          const required: string[] = inputs.items;
          void required;
        },
      }));
  compositeAction("defaults/action.yml", {
    name: "Default text",
    description: "Default task contracts",
  }).steps(({ step }) =>
    step.task({
      id: "make",
      name: "Make",
      if: undefined,
      outputs: { text: { required: true } },
      run: () => {},
    }).task({
      name: "Read",
      inputs: ({ steps }) => ({ text: { from: steps.make.outputs.text } }),
      run: ({ inputs }) => {
        const text: string = inputs.text;
        void text;
      },
    })
  );
  const phantomRun = (
    _: TaskContext<{ value: { from: Expression<string> } }>,
  ) => {};
  workflow("phantom-default.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      // @ts-expect-error callback annotations cannot invent default-contract inputs
      job.runsOn("ubuntu-latest").task({ name: "Phantom", run: phantomRun }),
  );
}
void assertDefaultValueContracts;

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
    // @ts-expect-error run annotations cannot introduce undeclared contracts
    execution.task({
      name: "Phantom",
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
    // @ts-expect-error run annotations cannot introduce undeclared contracts
    step.task({
      name: "Phantom",
      run: typedRun,
    });
    return step.task({ name: "Empty", run: () => {} }).outputs(() => ({}));
  });
}
void rejectPhantomTaskContracts;
