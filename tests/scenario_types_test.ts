import { scenario } from "../src/testing/mod.ts";
import {
  defineWorkflow,
  fromJSON,
  jsonValue,
  present,
  toJSON,
} from "../src/github_actions.ts";

function assertScenarioTypes(): void {
  const numberValue = jsonValue({
    parse(value: unknown): number {
      if (typeof value !== "number") throw new TypeError();
      return value;
    },
  });
  const flow = defineWorkflow("typed-scenario", {
    on: { push: {} },
    output: ".github/workflows/typed-scenario.yml",
  }).job("count", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .strategy({ matrix: { stage: ["dev", "prd"] as const } })
      .task({
        id: "produce",
        name: "Produce",
        inputs: { value: { contract: numberValue, from: () => toJSON(1) } },
        outputs: { value: { contract: numberValue, required: true } },
        run: () => {},
      }));
  void scenario(flow, (test) => {
    // @ts-expect-error job IDs come from the workflow
    test.job("unknown", () => {});
    test.job("count", (job) => {
      // @ts-expect-error matrix keys come from the strategy
      job.expectMatrix([{ wrong: "dev" }]);
      job.eachMatrix(({ stage }, run) => {
        const value: "dev" | "prd" = stage;
        void value;
        // @ts-expect-error step IDs come from the job
        run.step("unknown");
        run.step("produce")
          .fixture({ outputs: { value: 1 } })
          .expectInputs({ value: 1 });
        // @ts-expect-error task fixture outputs follow the output contract
        run.step("produce").fixture({ outputs: { value: "1" } });
        // @ts-expect-error task input expectations follow the input contract
        run.step("produce").expectInputs({ value: "1" });
      });
    });
  });
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
  const detected = defineWorkflow("matrix-output", {
    on: { push: {} },
    output: ".github/workflows/matrix-output.yml",
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
