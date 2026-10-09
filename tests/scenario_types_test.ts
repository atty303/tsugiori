import { scenario } from "../src/testing/mod.ts";
import {
  fromJSON,
  jsonValue,
  literal,
  present,
  toJSON,
  workflow,
} from "../src/github_actions.ts";

async function assertNamedHandlerScenarioInputs(): Promise<void> {
  const consume = (_: { inputs: Record<string, unknown> }) => {};
  const flow = workflow("named-map.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        id: "consume",
        name: "Consume",
        inputs: () => ({ text: { from: literal("text") } }),
        run: consume,
      }),
  );
  const result = await scenario(flow, (test) => {
    test.job("test", (job) => job.step("consume").fixture({}));
  });
  const step = result.jobs.test!.instances[0].steps.consume!;
  const text: string | null | undefined = step.inputs.text;
  void text;
  // @ts-expect-error declared text inputs are not numbers
  const number: number = step.inputs.text;
  void number;
  // @ts-expect-error named input maps do not expose arbitrary names
  void step.inputs.missing;
}
void assertNamedHandlerScenarioInputs;

async function assertScenarioTypes(): Promise<void> {
  const numberValue = jsonValue({
    parse(value: unknown): number {
      if (typeof value !== "number") throw new TypeError();
      return value;
    },
  });
  const flow = workflow(".github/workflows/typed-scenario.yml", {
    on: { push: {} },
  }).job("count", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .strategy({ matrix: { stage: ["dev", "prd"] as const } })
      .task({
        id: "produce",
        name: "Produce",
        inputs: () => ({ value: { contract: numberValue, from: toJSON(1) } }),
        outputs: { value: { contract: numberValue, required: true } },
        run: () => {},
      }));
  const result = await scenario(flow, (test) => {
    // @ts-expect-error job IDs come from the workflow
    test.job("unknown", () => {});
    test.job("count", (job) => {
      job.eachMatrix(({ stage }, run) => {
        const value: "dev" | "prd" = stage;
        void value;
        // @ts-expect-error step IDs come from the job
        run.step("unknown");
        run.step("produce")
          .fixture({ outputs: { value: 1 } });
        // @ts-expect-error task fixture outputs follow the output contract
        run.step("produce").fixture({ outputs: { value: "1" } });
      });
    });
  });
  const step = result.jobs.count!.instances[0].steps.produce!;
  const count: number | undefined = step.typedOutputs.value;
  void count;
  // @ts-expect-error task output is a number, not a wire string
  const wire: string = step.typedOutputs.value;
  void wire;
  // @ts-expect-error step IDs are inferred on results
  void result.jobs.count!.instances[0].steps.unknown;
  // @ts-expect-error output keys are inferred on results
  void step.typedOutputs.unknown;
  // @ts-expect-error output properties are readonly
  step.typedOutputs.value = 2;
}
void assertScenarioTypes;

function assertTypedMatrixFromOutput(): void {
  const stages = jsonValue({
    parse(value: unknown): ("dev" | "prd")[] {
      if (!Array.isArray(value)) throw new TypeError();
      return value.map((item: unknown) => {
        if (item === "dev" || item === "prd") return item;
        throw new TypeError();
      });
    },
  });
  const detected = workflow(".github/workflows/matrix-output.yml", {
    on: { push: {} },
  }).job("detect", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "plan",
        name: "Plan",
        inputs: {},
        outputs: { stages: { contract: stages, required: false } },
        run: () => {},
      }).outputs(({ steps }) => ({ stages: steps.plan.outputs.stages })));
  const flow = detected.job("deploy", ({ job, jobs }) =>
    job.needs(jobs.detect)
      .runsOn("ubuntu-latest")
      .when(({ needs }) => present(needs.detect.outputs.stages))
      .strategy(({ needs }) => ({
        matrix: { stage: fromJSON(needs.detect.outputs.stages) },
      }))
      .run({ id: "execute", name: "Execute", run: "true" }));
  void scenario(flow, (test) =>
    test.job("deploy", (job) => {
      job.eachMatrix(({ stage }) => {
        const value: "dev" | "prd" = stage;
        void value;
        // @ts-expect-error stage comes from the typed output schema
        const invalid: "stg" = stage;
        void invalid;
      });
    }));
}
void assertTypedMatrixFromOutput;
