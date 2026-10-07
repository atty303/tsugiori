import {
  type ActionContract,
  literal,
  workflow,
} from "../src/github_actions/mod.ts";

const metadata = {
  uses: "acme/publish/sub@v3",
  name: "Publish",
  description: "Publish artifacts",
  inputs: {
    destination: { description: "Target", required: true },
    mode: { description: "Mode", required: true, default: "normal" },
    optional: { description: "Optional" },
    count: { description: "Count", required: true, default: 0 },
    empty: { description: "Empty", required: true, default: null },
    flag: { description: "Flag", required: true, default: false },
  },
  outputs: { url: { description: "Published URL" } },
} as const satisfies ActionContract;

function checkTypes() {
  workflow("ci.yml", { on: { push: {} } }).job(
    "publish",
    ({ job }) => {
      const start = job.runsOn("ubuntu-latest");
      start.uses(metadata, { with: { destination: "web" } });
      start.uses(metadata, {
        with: { destination: literal("web"), mode: literal("fast") },
      });
      // @ts-expect-error second argument required
      start.uses(metadata);
      // @ts-expect-error with required
      start.uses(metadata, {});
      // @ts-expect-error required input missing
      start.uses(metadata, { with: {} });
      // @ts-expect-error metadata inputs are strings
      start.uses(metadata, { with: { destination: true } });
      // @ts-expect-error metadata accepts only string expressions
      start.uses(metadata, { with: { destination: literal(1) } });
      // @ts-expect-error undeclared input
      start.uses(metadata, { with: { destination: "web", missing: "value" } });
      // @ts-expect-error undeclared callback input
      start.uses(metadata, {
        with: ({ github }) => ({ destination: github.sha, missing: "value" }),
      });
      const supplied = { destination: "web", missing: "value" };
      // @ts-expect-error variable inputs retain unknown-key checks
      start.uses(metadata, { with: supplied });
      // @ts-expect-error old single-object API removed
      start.uses({ uses: "acme/action@v1", name: "Old" });
      start.uses("acme/action@v1");
      start.uses("acme/action@v1", { with: { unknown: "value" } });
      // @ts-expect-error no override for a string reference
      start.uses("acme/action@v1", { uses: "acme/other@v1" });
      // @ts-expect-error untyped inputs also accept only strings
      start.uses("acme/action@v1", { with: { count: 1 } });
      // @ts-expect-error boolean expressions must be explicitly converted
      start.uses("acme/action@v1", { with: { flag: literal(false) } });
      const raw = start.uses("acme/action@v1", { id: "raw" });
      // @ts-expect-error raw actions expose no output names
      raw.steps.raw.outputs.missing;
      const noIO = {
        uses: "acme/noop@v1",
        name: "Noop",
        description: "No I/O",
      } as const satisfies ActionContract;
      start.uses(noIO);
      start.uses(noIO, {});
      start.uses(noIO, { uses: "./local/action" });
      // @ts-expect-error actions without inputs accept no input names
      start.uses(noIO, { with: { missing: "value" } });
      const defaults = {
        ...noIO,
        inputs: {
          flag: { description: "Flag", required: true, default: false },
        },
      } as const;
      start.uses(defaults);
      const state = start.uses(metadata, {
        id: "publish",
        with: ({ github }) => ({ destination: github.sha }),
      });
      state.steps.publish.outputs.url;
      // @ts-expect-error duplicate step IDs remain unavailable
      state.uses(noIO, { id: "publish" });
      // @ts-expect-error only declared output names are visible
      state.steps.publish.outputs.missing;
      return state.run({
        name: "Consume",
        run: "true",
        env: ({ steps }) => ({
          URL: (() => {
            // @ts-expect-error callback also exposes only declared output names
            steps.publish.outputs.missing;
            return steps.publish.outputs.url;
          })(),
        }),
      });
    },
  );
}
void checkTypes;
Deno.test("metadata action type contracts compile", () => {});
