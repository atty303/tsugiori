<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tsugiori-logo-dark-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/tsugiori-logo-light-transparent.png">
  <img alt="継織" src="docs/assets/tsugiori-logo-light-transparent.png" width="720">
</picture>

# Tsugiori

Tsugiori authors GitHub Actions workflows and composite actions in TypeScript
and emits ordinary workflow YAML and `action.yml` files. It can also compile
inline Deno task functions into one task artifact and invoke each task from a
separate, visible Actions step. GitHub Actions still runs the jobs and steps.

## Getting started

Install Deno and map a released package version in your workflow project's
`deno.json`. Run the commands from that project directory.

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@<released-version>"
  },
  "tasks": { "tsugiori": "deno run --frozen=true -A ./workflows.ts" }
}
```

Replace `<released-version>` with the version you want to use. Save this
`workflows.ts` beside the configuration:

```ts
import {
  defineProject,
  defineWorkflow,
  runProject,
} from "@atty303/tsugiori/github-actions";

const ci = defineWorkflow("workflows/ci.yml", {
  on: { push: {}, pull_request: {} },
  permissions: { contents: "read" },
}).job("test", ({ job }) =>
  job.runsOn("ubuntu-24.04").task({
    name: "Test",
    inputs: {},
    outputs: {},
    run: async () => {
      const result = await new Deno.Command("deno", {
        args: ["test", "-A"],
        stdout: "inherit",
        stderr: "inherit",
      }).output();
      if (!result.success) throw new Error(`Tests failed: ${result.code}`);
    },
  }));

const project = defineProject({
  cacheVersion: 1,
  workflows: [ci],
});
export default project;

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
```

Install dependencies and commit the Deno lockfile:

```sh
deno install
```

Generate and commit the workflow YAML:

```sh
deno task tsugiori generate
```

Check committed outputs for drift:

```sh
deno task tsugiori generate --check
```

Workflow paths are relative to this Deno project directory. GitHub Actions owns
job and step execution; top-level TypeScript constructs definitions, and task
bodies run on the prepared task runtime.

## API documentation

The [JSR API reference](https://jsr.io/@atty303/tsugiori/doc) contains detailed
usage, contracts, examples and supported limits:

- [Authoring](https://jsr.io/@atty303/tsugiori/doc/github-actions/authoring):
  workflow/job/step order, typed expressions, reusable workflows and composite
  output declaration, mapping and references.
- [Generation and CLI](https://jsr.io/@atty303/tsugiori/doc/github-actions/run):
  commands, paths, Action import mappings, task preparation and diagnostics.
- [Scenario testing](https://jsr.io/@atty303/tsugiori/doc/github-actions/testing):
  fixtures, expectations, reusable calls and verification limits.
- [Task contracts](https://jsr.io/@atty303/tsugiori/doc/task): native inputs,
  output writers, text/JSON validation and serialization.

The umbrella `/github-actions` entrypoint re-exports the primary authoring,
runner and scenario APIs. The package has no root export. Releases on
[JSR](https://jsr.io/@atty303/tsugiori) also have matching source archives on
GitHub Releases. [Specification coverage](docs/GITHUB_ACTIONS_SPEC.md) records
the frozen GitHub.com basis; it does not prove hosted execution or
authorization.
