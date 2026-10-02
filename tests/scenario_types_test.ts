import { scenario } from "../packages/testing/src/mod.ts";
import { jsonValue, pipeline, toJSON } from "../packages/core/src/mod.ts";

function assertScenarioTypes(): void {
  const numberValue = jsonValue({
    parse(value: unknown): number {
      if (typeof value !== "number") throw new TypeError();
      return value;
    },
  });
  const flow = pipeline("typed-scenario", {
    events: ["push"],
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
    // @ts-expect-error job IDs come from the pipeline
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
