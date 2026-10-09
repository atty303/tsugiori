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

## When Tsugiori is worth it

Consider a CI workflow that finds changed files and runs checks only for the
affected parts of a repository. The file list must reach later steps, the
condition needs both run and skip cases, and the collection code may outgrow a
short shell command. Tsugiori lets you check those references and data contracts
with TypeScript, test the collection function directly, and test the workflow's
decisions locally without a GitHub Actions runner. The file-list workflow later
in this guide is a smaller learning example: it collects tracked TypeScript
files rather than detecting changes.

Any one of these pressures—passing structured values, maintaining conditions
and job dependencies, or growing shell steps—can make Tsugiori worth trying. For
a straightforward workflow with a few steps, plain GitHub Actions YAML is
usually enough. The main changes are authoring the workflow in TypeScript and
using Deno. Commit the generated YAML and Deno's lockfile; you do not maintain
a second, handwritten workflow definition.

## How Tsugiori helps

- **Catch wiring mistakes while authoring.** Typed job and step builders,
  Action contracts, GitHub expressions, and task inputs and outputs let
  TypeScript reject invalid references before CI runs.

- **Test task code as TypeScript.** Write a Deno task body as a named function
  that you can call directly from a standard `Deno.test`. Keep task code and
  workflow definitions in the same Deno project without a separate task build
  and packaging pipeline.

- **Test workflow decisions locally.** `scenario()` uses fixtures to check
  typed conditions and value flow, including run and skip paths, without
  executing Actions, shell steps, or task bodies.

- **Keep GitHub Actions in control.** Generated YAML retains native jobs and
  steps. Put tasks between existing `uses` and `run` steps, and keep using
  matrices, job dependencies, permissions, environments, and reusable workflows.
  Each task remains a separate step with its own logs and outputs.

- **Let Tsugiori prepare tasks when you need them.** A workflow can contain no
  Deno tasks, or adopt them one step at a time. For task-backed steps, Tsugiori
  compiles and prepares a shared executable artifact and reuses validated
  artifacts through `actions/cache`. Commit the generated YAML for review and
  use `generate --check` to detect stale output.

## Getting started

Follow the guide from a runnable workflow through typed authoring, existing
Actions, Deno tasks, and testing. Each chapter has an independent, complete
project in [`examples/`](examples/). The nested `.github` directories are
examples; copy one to your repository root to make its workflows active on
GitHub.

### 1. Initialize a workflow

From your repository root, run the initializer. Replace `<released-version>`
with a released Tsugiori version.

```sh
mkdir -p .github
cd .github
mise use deno
# Generate Tsugiori's Deno project and sample workflow.
deno run --no-config --no-lock -A jsr:@atty303/tsugiori@<released-version>/init
```

The initializer creates `.github/deno.json`:

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

It also creates `.github/workflows.ts`, a complete workflow with one shell
step:

```ts
// Import the project runner and typed workflow builder.
import {
  project,
  runProject,
  workflow,
} from "@atty303/tsugiori/github-actions";

// Write this workflow to the selected GitHub Actions YAML path.
const sample = workflow("workflows/tsugiori.yml", {
  // Set the name shown in GitHub Actions.
  name: "Tsugiori sample",
  // Allow a manual workflow dispatch.
  on: { workflow_dispatch: {} },
  // Give the workflow read access to repository contents.
  permissions: { contents: "read" },
})
  // Register the hello job; the callback receives its typed builder.
  .job("hello", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Add a native shell step to the job.
      .run({
        // Name this step in the generated workflow and Actions UI.
        name: "Say hello",
        // Use this shell command as the step body.
        run: "echo 'Hello from Tsugiori!'",
      }));

if (import.meta.main) {
  // Route CLI commands such as generate through this project.
  Deno.exitCode = await runProject({
    // Register the workflow in a project rooted at .github.
    project: project({
      // Resolve generated paths from this directory.
      workingDirectory: ".github",
      // Generate every registered workflow.
      workflows: [sample],
    }),
    // Let the runner locate this entrypoint.
    entrypointUrl: import.meta.url,
  });
}
```

`.job("hello", ...)` registers `hello` as a GitHub Actions job. Tsugiori passes
that job's typed builder as the callback's `job` parameter: `runsOn()` chooses
its runner, then `run()` adds a native shell step. In the step, `name` labels it
in the generated workflow and `run` supplies its shell command.

From `.github`, install dependencies and generate the workflow:

```sh
deno install -P
# Compile the registered workflow into GitHub Actions YAML.
deno task tsugiori generate
```

The generated `workflows/tsugiori.yml` is a normal GitHub Actions workflow:

```yaml
# Generated by Tsugiori from workflows.ts
name: Tsugiori sample
on:
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  hello:
    runs-on: ubuntu-24.04
    steps:
      - name: Say hello
        run: echo 'Hello from Tsugiori!'
```

See the [complete initialization example](examples/01-init/.github/workflows.ts),
its [Deno configuration](examples/01-init/.github/deno.json), and its
[generated YAML](examples/01-init/.github/workflows/tsugiori.yml).

### 2. Add typed jobs, steps, and conditions

Beyond the initial sample, keep each workflow in its own source file and
import it from the project entrypoint. This CI workflow adds a second job and
typed runtime expressions.

The `hello` job gives a shell step an `id` for later references. Its declared
`outputs` make `message` available as `steps.greet.outputs.message`:

```ts
// Give this step an ID so later expressions can read its output.
.run({
  // Give this step an ID for later references.
  id: "greet",
  // Set the displayed name.
  name: "Say hello",
  // Set this native step’s shell command.
  run: 'echo "message=Hello from Tsugiori!" >> "$GITHUB_OUTPUT"',
  // Declare the output name exposed by this shell step.
  outputs: ["message"],
})
```

Another step uses a typed GitHub expression for its `if` condition. The ref
is evaluated by GitHub Actions when the workflow runs, not while TypeScript
defines it:

```javascript
// Build the condition from typed runtime values.
if: ({ github }) => github.ref.eq("refs/heads/main"),
```

Typed operators such as `eq()` emit GitHub expressions. Their results follow
[GitHub's operator rules](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators):
equality between different types uses GitHub's numeric coercion, not
TypeScript's comparison rules.

The `hello` job then promotes the step output to a job output:

```javascript
// Promote the step output to an output of the hello job.
.outputs(({ steps }) => ({ message: steps.greet.outputs.message })))
```

In `follow-up`, the callback's `jobs` parameter contains the earlier
`hello` job. `needs()` creates the dependency:

```javascript
// needs adds the hello dependency before choosing the runner.
job.needs(jobs.hello).runsOn("ubuntu-24.04")
```

The later step reads the promoted output from its typed `needs` context:

```javascript
// Resolve an output through the typed step or job context.
env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.message }),
```

These typed expressions can also be evaluated by `scenario()` without a
runner in Chapter 6.

The DSL rejects invalid references while TypeScript checks the source. For
example, `hello` exports `message`, so reading `greeting` in `follow-up` fails:

```ts
env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.greeting }),
```

```text
TS2339 [ERROR]: Property 'greeting' does not exist on type 'Ref<Readonly<{ message: string; }>, "needs.hello.outputs">'.
```

IDE completion follows the same state-specific types:

| At the cursor after | Offered | Unavailable |
| --- | --- | --- |
| `job.` in a new job | `runsOn` | `run`, `task`, `uses` |
| `job.runsOn(...).` | `run`, `task`, `uses` | `needs` |
| `jobs.` in `follow-up` | `hello` | `follow-up` (the current job) |
| `needs.hello.outputs.` in `follow-up` | `message` | `greeting` |

See the [complete workflow source](examples/02-typed-dsl/.github/workflows/src/ci.ts),
its [project entrypoint](examples/02-typed-dsl/.github/workflows.ts), and the
[generated YAML](examples/02-typed-dsl/.github/workflows/ci.yml) with two visible
jobs, a `needs` edge, a job output, and a step `if`.

### 3. Add an existing Action

In `.github`, add checkout's Action contract before importing it:

```sh
# Add a typed contract for the existing checkout Action.
deno task tsugiori actions add actions/checkout@v7
deno install -P
```

`actions add` writes this mapping in `.github/deno.json`'s `imports`:

```json
"#actions/actions/checkout": "https://tsugiori.atty303.workers.dev/github/actions/v1/actions/checkout@v7"
```

When `deno install -P` resolves that import, Tsugiori's official type service
redirects the `v7` tag to its current commit SHA, reads the Action's
`action.yml` or `action.yaml` at that commit, and provides a TypeScript contract
for its inputs and outputs. Deno records the redirect and module checksum in
`deno.lock`, fixing the resolved Action version. With a tag like `v7`, use Deno's
usual lockfile workflow: commit `deno.json` and `deno.lock` together, and
refresh the locked resolution when you intend to pick up a moved tag. You can
instead give `actions add` a full 40-character commit SHA to select that
revision explicitly in `deno.json`. Both routes give `uses()` a SHA-pinned
default.

Import the contract under the alias added to `deno.json`:

```ts
// Import the generated contract for checkout.
import checkout from "#actions/actions/checkout";
```

Pass it to `uses()`. The contract checks the names and types in `with`:

```javascript
// Pass the checkout contract to a native uses step.
.uses(checkout, {
  // Set the displayed name.
  name: "Checkout",
  // The contract checks valid input names and values.
  with: { "persist-credentials": "false" },
})
```

The [complete example](examples/03-actions-add/.github/workflows/src/ci.ts)
and its [generated YAML](examples/03-actions-add/.github/workflows/ci.yml)
show the typed `with` map and the resulting ordinary checkout step. Commit the
source and generated YAML alongside the Deno configuration and lockfile.

### 4. Run a Deno task

A `task()` lets you write a workflow step as an ordinary Deno/TypeScript
function, using Deno APIs and libraries alongside other GitHub Actions steps.
Tsugiori packages the function and generates the steps that prepare and invoke
it on the runner; you only define the task in the workflow source. It caches the
prepared task artifact, so a later run with unchanged task sources can reuse it
without fetching Deno or task dependencies again when the cache hits. The
generated `actions/cache` step restores that artifact.

This workflow adds a `workflow_dispatch` text input named `format`, defaulting
to `%h %s`.
Task inputs and outputs default to non-empty plain text, so their `contract`
can be omitted: use `{ from }` for inputs and `{ required }` for outputs.
The next chapter introduces `jsonValue()` as an opt-in for structured data.
The task runs Git and writes the result:

```ts
// Pass the dispatch format as one Git argument.
const summary = await $`git log -1 --format=${inputs.format} HEAD`
  .text();
// Publish the result as the declared step output.
await outputs.set("summary", summary);
```

The following step reads that output through the typed `steps` context:

```javascript
// Read the task's declared summary output from the steps context.
env: ({ steps }) => ({ SUMMARY: steps.commit.outputs.summary }),
```

With [dax](https://jsr.io/@david/dax), the command stays about as short as a
shell step without the longer `Deno.Command` setup. The task keeps that brevity
while adding TypeScript's type checks and typed input/output contracts, making
it a safer way to write the step than a handwritten shell script.

See the [complete workflow source](examples/04-task/.github/workflows/src/ci.ts)
and [generated YAML](examples/04-task/.github/workflows/ci.yml), which shows the
authored checkout and display steps alongside separate task preparation and
invocation steps.

### 5. Pass typed data between tasks

`jsonValue()` defines a typed, runtime-validated contract for JSON values
passed between tasks. It accepts a shape-preserving `parse(value: unknown)`
adapter from any JSON schema or serde library, or one you write yourself.
Tsugiori handles the JSON encoding across GitHub Actions' string channels.

[Zod](https://zod.dev/) is this example's choice, not a Tsugiori requirement.
Here it defines the shared array of TypeScript paths:

```ts
// Validate a JSON array at task boundaries with Zod.
const files = jsonValue(z.array(z.string()));
```

The first task declares the array output:

```javascript
// Declare a required JSON output with the shared files contract.
outputs: { files: { contract: files, required: true } },
```

It writes the array through the shared contract:

```javascript
// Write a string array through the declared output contract.
await outputs.set("files", ["src/main.ts", "src/helpers.ts"]);
```

The next task inherits the contract from the typed output reference:

```javascript
// Bind the collector's output as the next task's typed input.
inputs: ({ steps }) => ({
  // Inherit the collector's JSON contract.
  files: { from: steps.collect.outputs.files },
})
```

For a direct typed output reference, the input can omit `contract` and inherit
it from the source. Computed expressions do not retain that contract and
default to text when `contract` is omitted.

Inside the task body, `inputs.files` is already parsed and typed as `string[]`:

```typescript
// Use the array parsed by the task input contract.
const files: string[] = inputs.files;
```

Tsugiori validates the JSON at the task boundary, so the task does not call
`parse()` itself.

The first task also sets the `hasFiles` flag. The second runs only when files
are present, reads each file, and reports file and line counts. Both task
bodies are inline lambdas, so the full value flow is visible in one file.
The [complete workflow source](examples/05-typed-io/.github/workflows/src/ci.ts)
and [generated YAML](examples/05-typed-io/.github/workflows/ci.yml) show JSON
passing through ordinary step outputs and environment values; the task runtime
parses and validates it at both ends.

### 6. Test task code and workflow logic

This chapter moves Chapter 5's inline task bodies into exported functions in
`tasks.ts`. The workflow passes those function objects to the DSL's `run`. For
the first task, it passes `collectFiles`:

```javascript
// Pass a function object that Deno.test also calls directly.
run: collectFiles,
```

A standard `Deno.test` calls that same function and checks its outputs without
running a workflow. The complete test sets up the Git fixture and output
recorder; the essential call and assertion are:

```typescript
Deno.test("collectFiles writes a typed list and its presence flag", async () => {
  // Call the function used by the workflow with a local output writer.
  await collectFiles({ cwd, outputs });
  // Check the values captured through the output contract.
  assert.deepEqual(Object.fromEntries(written), {
    files: ["one.ts"],
    hasFiles: "true",
  });
});
```

Workflow logic can be tested locally without a GitHub Actions runner. The
consumer's condition is a typed expression that `scenario()` can evaluate:

```javascript
// Use a typed expression so scenario can evaluate the condition.
if: ({ steps }) =>
  steps.collect.outputs.hasFiles.eq("true").and(
    present(steps.collect.outputs.files),
  ),
```

The scenario supplies the collector's outputs as a fixture, then checks that
the consumer runs and receives the file array:

```javascript
// Select the collector step without running its task body.
job.step("collect")
  // Supply the outputs that the task would write.
  .fixture({
    outputs: {
      files: ["one.ts"],
      hasFiles: "true",
    },
  });
// Select the consumer step.
job.step("count")
  // Supply its step result without running countLines.
  .fixture({})
  // Assert that the condition lets it run.
  .expectRun()
  // Assert that the file array reaches its typed input.
  .expectInputs({ files: ["one.ts"] });
```

With no files, the same condition skips the consumer:

```javascript
// Select the collector step.
job.step("collect")
  // Supply an empty file list and its presence flag.
  .fixture({
    outputs: {
      files: [],
      hasFiles: "false",
    },
  });
// Select the consumer step.
job.step("count")
  // Assert that the typed condition skips it.
  .expectSkip();
```

Scenarios interpret workflow logic; they do not run Actions, shell steps, or
task bodies. Both typed DSL expressions and native `rawExpression()` expressions
are evaluated with the supplied contexts and fixtures. Invalid expressions fail.
Run both kinds of tests from this chapter's `.github` directory:

```sh
deno test -A workflows/src/
```

See the [task functions](examples/06-testing/.github/workflows/src/tasks.ts),
[unit tests](examples/06-testing/.github/workflows/src/tasks_test.ts),
[scenario tests](examples/06-testing/.github/workflows/src/ci_test.ts), and
[workflow source](examples/06-testing/.github/workflows/src/ci.ts).

### Appendix: Share a local composite Action

Define one composite Action containing a Deno task, then call it from two
workflows in the same repository. Each caller checks out the repository so the
local Action is available. Tsugiori generates its `action.yml`, task payload,
and both workflow YAML files. See the [Action source](examples/07-local-action/.github/actions/greet/src/mod.ts),
[project entrypoint](examples/07-local-action/.github/workflows.ts),
[first](examples/07-local-action/.github/workflows/src/first.ts) and
[second](examples/07-local-action/.github/workflows/src/second.ts) workflow
sources, [generated `action.yml`](examples/07-local-action/.github/actions/greet/action.yml),
and [first](examples/07-local-action/.github/workflows/first.yml) and
[second](examples/07-local-action/.github/workflows/second.yml) workflow YAML.
See the [authoring API](https://jsr.io/@atty303/tsugiori/doc/github-actions/authoring)
for Action metadata and output mapping details.

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
