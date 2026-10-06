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

Install Deno and create a separate workflow project inside `.github`,
independent of your application's Deno configuration. From your repository root:

```sh
mkdir -p .github
```

```sh
cd .github
```

```sh
deno run --no-config --no-lock -A jsr:@atty303/tsugiori@<released-version>/init
```

Replace `<released-version>` with a released version that provides `/init`.
`--no-config --no-lock` prevents bootstrap from loading application settings or
creating a lockfile. `-A` permits file creation and local diagnostic recording.
The command creates only `deno.json` and `workflows.ts` in the current
directory; it does not install dependencies or generate YAML. If `deno.json`,
`deno.jsonc`, `deno.lock` or `workflows.ts` already exists, it stops without
writing files.

The generated `deno.json` is shown in full below. In the actual file,
`<released-version>` is replaced with the init package's own version; the `^`
range permits compatible updates, and `deno.lock` records the resolved version.

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@^<released-version>"
  },
  "permissions": {
    "default": {
      "import": [
        "jsr.io:443",
        "tsugiori.atty303.workers.dev:443"
      ]
    }
  },
  "tasks": {
    "tsugiori": "deno run --frozen=true -A ./workflows.ts"
  }
}
```

The generated `workflows.ts` is:

```ts
import {
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
```

The sample checks out the repository and runs one Deno task that prints a
message. It generates `workflows/tsugiori.yml` and runs only through GitHub's
manual workflow dispatch. Commit it to the default branch to make it available
in the Actions UI. Replace the sample with your own workflow and tasks.
`workingDirectory: ".github"` selects the workflow project's checkout-relative
location for task preparation; edit it if you place the project elsewhere.
Continue running the following commands from the workflow project directory.

Install dependencies with the configured permission set and commit the Deno
lockfile. `-P` explicitly loads `permissions.default`; configuring it alone does
not grant access. The import list replaces Deno's default hosts, so it includes
both JSR and the Tsugiori type service used by typed Action imports.

```sh
deno install -P
```

Generate the workflow YAML:

```sh
deno task tsugiori generate
```

Commit `.github/deno.json`, `.github/deno.lock`, `.github/workflows.ts` and
`.github/workflows/tsugiori.yml` from the repository root. Check committed
outputs for drift from `.github`:

```sh
deno task tsugiori generate --check
```

Workflow paths are relative to this Deno project directory. GitHub Actions owns
job and step execution; top-level TypeScript constructs definitions, and task
bodies run on the prepared task runtime. Task `inputs` and `outputs` can each be
omitted when empty; the task context still provides `inputs` and the output
writer.

Composite Actions use a metadata file path:
`defineCompositeAction("actions/greet/action.yml", metadata).steps(...)`. Both
`action.yml` and `action.yaml`, including files at the project root, are
supported. Replace directory arguments with the metadata file path. Generation
collects internal Actions referenced by workflows and other Actions recursively.
Use `defineProject({ actions: [...] })` to generate additional unreferenced
Actions or an Action-only project. Identical definitions generate once; distinct
definitions cannot share an Action directory.

## API documentation

The [JSR API reference](https://jsr.io/@atty303/tsugiori/doc) contains detailed
usage, contracts, examples and supported limits:

- [Initialization](https://jsr.io/@atty303/tsugiori/doc/init): bootstrap,
  conflict handling, next steps and local diagnostics.
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
