import {
  type ActionContract,
  definePipeline,
  defineTsugiori,
  rawNode,
  runTsugiori,
} from "@atty303/tsugiori";

const checkout = {
  name: "Checkout",
  description: "Checkout repository",
  uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  inputs: {
    "persist-credentials": { description: "Persist checkout credentials" },
    "fetch-depth": { description: "Number of commits to fetch" },
  },
  outputs: {},
} as const satisfies ActionContract;

const mise = {
  name: "mise",
  description: "Install toolchain",
  uses: "jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c",
  inputs: {},
  outputs: {},
} as const satisfies ActionContract;

const ci = definePipeline("ci", {
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

// Enable only after 0.1.0 is verified and the bootstrap definition is removed.
const releaseEnabled = false;
const releaseAction = {
  name: "Release",
  description: "Release repository",
  uses:
    "atty303/repository-template/.github/actions/release@124ee84f8b01ac242d16b352f2d1e37627124724",
  inputs: { versioning: { description: "Release versioning scheme" } },
  outputs: {},
} as const satisfies ActionContract;

const release = definePipeline("release", {
  output: ".github/workflows/release.yml",
  on: { push: { branches: ["main"] }, workflow_dispatch: {} },
  permissions: { contents: "read" },
  concurrency: { group: "tsugiori-release", cancelInProgress: false },
}).job("release", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .when(({ github }) =>
      github.ref.eq("refs/heads/main").and(
        rawNode<boolean>(releaseEnabled ? "true" : "false"),
      )
    )
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
    .uses(releaseAction, { name: "Release", with: { versioning: "semver" } }));

const initialRelease = definePipeline("release-initial", {
  output: ".github/workflows/release-initial.yml",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
  concurrency: { group: "tsugiori-release", cancelInProgress: false },
}).job("release", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .when(({ github }) => github.ref.eq("refs/heads/main"))
    .permissions({ contents: "write", "id-token": "write" })
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false", "fetch-depth": "0" },
    })
    .uses(mise, { name: "Install toolchain" })
    .run({
      name: "Check generated workflows",
      run: "deno task generate:check",
      workingDirectory: ".github",
    })
    .run({ name: "Run repository checks and tests", run: "mise run test" })
    .run({
      name: "Build 0.1.0 source archive",
      run:
        'mise run release:build 0.1.0 "$GITHUB_WORKSPACE/.release/artifacts"',
    })
    .run({
      name: "Reserve 0.1.0 tag",
      run: "deno run -A scripts/release/bootstrap.ts reserve",
      env: { GH_TOKEN: ({ github }) => github.token },
    })
    .run({
      name: "Publish 0.1.0 to JSR",
      run:
        'mise run release:publish 0.1.0 "$GITHUB_WORKSPACE/.release/artifacts"',
    })
    .run({
      name: "Complete 0.1.0 GitHub Release",
      run:
        'deno run -A scripts/release/bootstrap.ts finish "$GITHUB_WORKSPACE/.release/artifacts"',
      env: { GH_TOKEN: ({ github }) => github.token },
    }));

const config = defineTsugiori({
  cacheVersion: 1,
  pipelines: [ci, release, initialRelease],
});
export default config;

if (import.meta.main) {
  Deno.exitCode = await runTsugiori({
    config,
    configUrl: import.meta.url,
    root: new URL("../", import.meta.url),
  });
}
