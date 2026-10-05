import {
  definePipeline,
  type Expression,
  fromJSON,
  jsonValue,
  present,
  rawNode,
  textValue,
} from "../packages/core/src/github_actions/mod.ts";

function assertTypedIO(): void {
  const contract = jsonValue({
    parse(value: unknown): readonly string[] {
      if (!Array.isArray(value)) throw new TypeError();
      return value as string[];
    },
  });
  const first = definePipeline("typed", {
    output: ".github/workflows/typed.yml",
    on: { push: {} },
  }).job("detect", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "find",
        name: "Find",
        inputs: {},
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
          outputs: {},
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => {
                // @ts-expect-error optional JSON reference has no inferred parsed type without a guard
                const parsed: Expression<readonly string[]> = fromJSON(
                  needs.detect.outputs.targets,
                );
                void parsed;
                return needs.detect.outputs.targets;
              },
            },
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
          outputs: {},
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
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
          outputs: {},
          if: ({ needs }) => present(needs.detect.outputs.targets).and(true),
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
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
          outputs: {},
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
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
          outputs: {},
          if: ({ needs }) => present(needs.detect.outputs.targets).or(true),
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
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
          outputs: {},
          if: rawNode<boolean>("needs.detect.outputs.targets != ''"),
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
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
          outputs: {},
          if: ({ needs }) => present(needs.detect.outputs.targets).not(),
          inputs: {
            targets: {
              contract,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
          run: ({ inputs }) => {
            // @ts-expect-error negation does not prove presence
            const targets: readonly string[] = inputs.targets;
            void targets;
          },
        }),
  );

  const conditional = definePipeline("conditional", {
    output: ".github/workflows/conditional.yml",
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
          outputs: {},
          inputs: {
            item: { contract, from: ({ needs }) => needs.produce.outputs.item },
          },
          run: ({ inputs }) => {
            // @ts-expect-error a skipped producer can omit a required output
            const item: readonly string[] = inputs.item;
            void item;
          },
        }),
  );

  const text = textValue();
  const textJob = definePipeline("text", {
    output: ".github/workflows/text.yml",
    on: { push: {} },
  })
    .job("produce", ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        id: "value",
        name: "Value",
        inputs: {},
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
          env: {
            ITEM: ({ needs }) => {
              // @ts-expect-error fromJSON does not infer a JSON value from a text contract
              const value: Expression<readonly string[]> = fromJSON(
                needs.produce.outputs.item,
              );
              void value;
              return needs.produce.outputs.item;
            },
          },
        }),
  );
}
void assertTypedIO;
