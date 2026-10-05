import {
  defineAction,
  definePipeline,
  literal,
} from "../packages/core/src/github_actions/mod.ts";

const metadata = {
  uses: "acme/publish/sub@v3",
  name: "Publish",
  description: "Publish artifacts",
  inputs: {
    destination: { description: "Target", required: true },
    mode: { description: "Mode", required: true, default: "normal" },
    optional: { description: "Optional" },
    count: { description: "Count", required: true, default: 1 },
    empty: { description: "Empty", required: true, default: null },
  },
  outputs: { url: { description: "Published URL" } },
} as const;

function checkTypes() {
  const publish = defineAction({ contract: metadata });
  publish({ destination: "web" });
  publish({ destination: literal("web"), mode: literal("fast") });
  // @ts-expect-error required without default must be supplied
  publish({});
  // @ts-expect-error metadata inputs are strings
  publish({ destination: true });
  // @ts-expect-error metadata accepts only string expressions
  publish({ destination: literal(1) });
  // @ts-expect-error undeclared input
  publish({ destination: "web", missing: "value" });
  definePipeline("ci", { output: "ci.yml", on: { push: {} } }).job(
    "publish",
    ({ job }) => {
      const state = job.runsOn("ubuntu-latest").uses({
        id: "publish",
        name: "Publish",
        uses: ({ github }) => publish({ destination: github.sha }),
      });
      state.steps.publish.outputs.url;
      // @ts-expect-error only declared output names are visible
      state.steps.publish.outputs.missing;
      return state.run({
        name: "Consume",
        run: "true",
        env: {
          URL: ({ steps }) => {
            // @ts-expect-error callback also exposes only declared output names
            steps.publish.outputs.missing;
            return steps.publish.outputs.url;
          },
        },
      });
    },
  );
  const noIO = defineAction({
    contract: { uses: "acme/noop@v1", name: "Noop", description: "No I/O" },
  });
  noIO({});
  // @ts-expect-error actions without inputs accept no input names
  noIO({ missing: "value" });
}
void checkTypes;
Deno.test("metadata action type contracts compile", () => {});
