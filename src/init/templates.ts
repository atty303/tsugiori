import { TSUGIORI_PACKAGE_VERSION } from "../package_identity.ts";

export const configuration = JSON.stringify(
  {
    imports: {
      "@atty303/tsugiori": `jsr:@atty303/tsugiori@^${TSUGIORI_PACKAGE_VERSION}`,
    },
    permissions: {
      default: {
        import: ["jsr.io:443", "tsugiori.atty303.workers.dev:443"],
      },
    },
    tasks: { tsugiori: "deno run --frozen=true -A ./workflows.ts" },
  },
  null,
  2,
) + "\n";

export const workflows = `import {
  defineProject,
  defineWorkflow,
  runProject,
} from "@atty303/tsugiori/github-actions";

const sample = defineWorkflow("workflows/tsugiori.yml", {
  name: "Tsugiori sample",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("hello", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .task({
      name: "Say hello",
      inputs: {},
      outputs: {},
      run: () => {
        console.log("Hello from Tsugiori!");
      },
    }));

const project = defineProject({
  cacheVersion: 1,
  workingDirectory: ".github",
  workflows: [sample],
});
export default project;

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
`;
