import {
  defineProject,
  defineWorkflow,
  runProject,
} from "@atty303/tsugiori/github-actions";

import checkout from "actions/checkout";
import mise from "jdx/mise-action";
import releaseAction from "atty303/repository-template/release";

const ci = defineWorkflow("ci", {
  output: ".github/workflows/ci.yml",
  on: { pull_request: {}, push: {} },
  permissions: { contents: "read" },
}).job("test", ({ job }) =>
  job
    .runsOn("ubuntu-24.04")
    .when(({ github }) =>
      github.event_name.eq("push").or(github.event_name.eq("pull_request"))
    )
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .uses(mise, {
      name: "Install toolchain",
    })
    .run({
      name: "Check generated workflow",
      run: "deno task generate:check",
      workingDirectory: ".github",
    })
    .task({
      name: "Run repository checks and tests",
      inputs: {},
      outputs: {},
      run: async () => {
        const result = await new Deno.Command("mise", {
          args: ["run", "test"],
          stdout: "inherit",
          stderr: "inherit",
        }).output();
        if (!result.success) {
          throw new Error(`Repository checks failed with ${result.code}.`);
        }
      },
    }));

const release = defineWorkflow("release", {
  output: ".github/workflows/release.yml",
  on: { push: { branches: ["main"] }, workflow_dispatch: {} },
  permissions: { contents: "read" },
  concurrency: { group: "tsugiori-release", cancelInProgress: false },
}).job("release", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .when(({ github }) => github.ref.eq("refs/heads/main"))
    .permissions({ contents: "write", "id-token": "write" })
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .uses(mise, { name: "Install toolchain" })
    .run({
      name: "Check generated workflows",
      run: "deno task generate:check",
      workingDirectory: ".github",
    })
    .run({ name: "Run repository checks and tests", run: "mise run test" })
    .uses(releaseAction, {
      name: "Release",
      with: { versioning: "semver" },
      env: { FNOX_AGE_KEY: ({ secrets }) => secrets.FNOX_AGE_KEY },
    }));

const config = defineProject({
  cacheVersion: 2,
  workflows: [ci, release],
});
export default config;

if (import.meta.main) {
  Deno.exitCode = await runProject({
    config,
    configUrl: import.meta.url,
    root: new URL("../", import.meta.url),
  });
}
