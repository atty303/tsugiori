<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tsugiori-logo-dark-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/tsugiori-logo-light-transparent.png">
  <img alt="継織" src="docs/assets/tsugiori-logo-light-transparent.png" width="720">
</picture>

# Tsugiori

**Write workflows and tasks together in Deno TypeScript. Keep your GitHub
Actions jobs, steps, and existing Actions.**

Tsugiori brings task code directly into your GitHub Actions definitions. Combine
existing Actions, shell commands, and inline Deno tasks in the step order you
choose. Tsugiori generates standard YAML and manages task compilation, runtime
preparation, and artifact caching; GitHub Actions runs each job and step.

## Why Tsugiori?

- **Define the workflow and the work together.** Write Deno task bodies
  alongside their triggers, conditions, inputs, and outputs. Reuse functions and
  libraries through the same Deno project and lockfile, without maintaining a
  separate task build and packaging pipeline.

- **Keep every task visible as a GitHub Actions step.** Each task runs in its
  own native step, preserving the boundaries you authored for ordering,
  conditions, failures, outputs, and logs. GitHub Actions owns orchestration.

- **Build on the Actions you already use.** Place tasks between existing `uses`
  and `run` steps. Continue using GitHub Actions features such as matrices, job
  dependencies, permissions, environments, and reusable workflows.

- **Let Tsugiori prepare the task runtime.** Tsugiori compiles Deno tasks into a
  shared executable artifact, prepares it on the runner, and reuses validated
  artifacts through `actions/cache`. You write the task; Tsugiori handles how it
  reaches the runner.

- **Adopt tasks incrementally.** Workflows can use existing Actions and shell
  commands without any Deno tasks. Once a workflow is authored in Tsugiori,
  replace individual shell steps with tasks as needed.

- **Check definitions before CI runs.** Typed Action contracts, expressions, and
  task inputs and outputs help catch mistakes during authoring. Commit the
  generated YAML for review and use `generate --check` to detect stale output.

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

## How it compares

Several OSS tools let you describe automation in a programming language.
Tsugiori focuses on keeping GitHub Actions jobs and steps explicit while
integrating Deno task code and its execution preparation.

| Approach                                                                                 | Standard model                                                                                                                                                                           | What Tsugiori addresses                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow generators                                                                      | Define workflow configuration in code; task bodies commonly remain in shell commands, scripts, or separately packaged Actions.                                                           | Write workflow definitions and Deno task bodies together, without maintaining a separate task build and packaging pipeline.                                                                                                     |
| [github-workflows-kt](https://github.com/typesafegithub/github-workflows-kt)             | Supports experimental inline Kotlin logic in separate native steps, executed through Kotlin/JVM scripting.                                                                               | Provides a compiled Deno task artifact lifecycle, including runner preparation, validation, and caching, rather than executing the authoring script for each task.                                                              |
| [NUKE](https://nuke.build/docs/cicd/github-actions/) / [Fallout](https://fallout.build/) | Define C# targets and CI configuration together; generated steps invoke a build runner that manages target dependencies.                                                                 | Keep task ordering and dependencies in native GitHub Actions jobs and steps. Each authored task has its own step, where it can be placed between existing Actions.                                                              |
| [Zuke](https://zuke.build/docs/concepts/)                                                | Define Deno TypeScript targets and CI configuration together. Normally run a target graph inside a step, or generate one job per target; custom pipelines can invoke individual targets. | Define each task directly at its intended step position, without separately maintaining target invocation commands or deriving job boundaries from the target graph. Also manages compiled runtime artifact delivery and reuse. |
| [Dagger](https://docs.dagger.io/reference/cli/)                                          | Execute pipeline functions through the Dagger engine, which can be invoked from GitHub Actions.                                                                                          | Integrate task code while leaving orchestration with GitHub Actions. Existing Actions and tasks share the same native step sequence without introducing another pipeline engine.                                                |

**Tsugiori combines workflow and Deno task authoring, explicit native job and
step boundaries, and managed task execution preparation.** Existing Actions and
shell steps remain usable alongside tasks, so adoption can proceed one step at a
time.

These comparisons describe the tools' standard models; custom integrations can
narrow the differences. github-workflows-kt's logic steps are the closest match
in execution structure. The comparison concerns execution architecture and
preparation, rather than benchmarked performance.

Task artifacts currently support Linux and macOS runners. See
[specification coverage](docs/GITHUB_ACTIONS_SPEC.md) for the supported GitHub
Actions authoring surface.

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
