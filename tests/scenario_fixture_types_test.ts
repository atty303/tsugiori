import {
  jsonValue,
  literal,
  toJSON,
  workflow,
} from "../src/github_actions/mod.ts";
import {
  type ResolvedStrategy,
  scenario,
  type TokenPermissions,
} from "../src/testing/mod.ts";

function verifyScenarioFixtureTypes(): void {
  const number = jsonValue({
    parse(value: unknown): number {
      if (typeof value !== "number") throw new TypeError();
      return value;
    },
  });
  const flow = workflow("types.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({
        matrix: { stage: ["dev", "prd"] },
      })
        .task({
          id: "read",
          name: "Read",
          inputs: () => ({
            text: { from: literal("text") },
            count: { from: toJSON(2), contract: number },
          }),
          outputs: { count: { contract: number, required: true } },
          run: () => {},
        }),
  );
  void scenario(flow, (t) => {
    t.tokenPermissions({
      defaults: { contents: "read", "id-token": "write" },
      restrictWrites: false,
    });
    t.tokenPermissions({
      // @ts-expect-error id-token cannot request read
      defaults: { "id-token": "read" },
      restrictWrites: false,
    });
    // @ts-expect-error write restrictions are explicit
    t.tokenPermissions({ defaults: {} });
    t.tokenPermissions({
      // @ts-expect-error permission scopes follow the fixed catalog
      defaults: { unknown: "read" },
      restrictWrites: false,
    });
    // @ts-expect-error full-field expression overrides are removed
    t.expression("concurrency.group", "ignored");
    t.job("build", (j) => {
      j.completionOrder([1, 0]);
      // @ts-expect-error completion indices are numbers
      j.completionOrder(["prd"]);
      // @ts-expect-error full-field job overrides are removed
      j.expression("strategy.matrix", {});
      j.eachMatrix(({ stage }, instance) => {
        const known: "dev" | "prd" = stage;
        void known;
        instance.step("read").replaceInherited().hashFiles(["deno.lock"], "")
          .fixture(({ inputs, matrix, strategy, tokenPermissions }) => {
            const text: string = inputs.text;
            const count: number = inputs.count;
            const typed: ResolvedStrategy = strategy;
            const index: number = strategy["job-index"];
            const current: "dev" | "prd" = matrix.stage;
            const permissions: TokenPermissions | undefined = tokenPermissions;
            void [text, count, typed, index, current, permissions];
            // @ts-expect-error strategy is readonly
            strategy["max-parallel"] = 1;
            // @ts-expect-error strategy uses native hyphenated properties
            strategy.max_parallel;
            // @ts-expect-error permission maps are readonly
            if (tokenPermissions) tokenPermissions.contents = "write";
            // @ts-expect-error scope-specific token levels are preserved
            const read: "read" = tokenPermissions!["id-token"];
            void read;
            // @ts-expect-error task inputs retain native number types
            const wrong: string = inputs.count;
            void wrong;
            return { outputs: { count: 2 } };
          });
        // @ts-expect-error hash argument tuples cannot be empty
        instance.step("read").hashFiles([], "empty");
        // @ts-expect-error hash results are strings
        instance.step("read").hashFiles(["deno.lock"], 1);
        // @ts-expect-error full-field step overrides are removed
        instance.step("read").expression("if", true);
        // @ts-expect-error step names retain inference
        instance.step("missing");
        // @ts-expect-error task outputs retain number contracts
        instance.step("read").fixture({ outputs: { count: "wrong" } });
      });
    });
  });
}
void verifyScenarioFixtureTypes;
