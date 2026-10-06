<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/tsugiori-logo-dark-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/tsugiori-logo-light-transparent.png">
  <img alt="継織" src="docs/assets/tsugiori-logo-light-transparent.png" width="720">
</picture>

# Tsugiori

Tsugiori authors GitHub Actions workflows in TypeScript and emits ordinary
`.github/workflows/*.yml` files. It can also compile inline Deno task functions
into one task artifact and invoke each task from a separate, visible Actions
step. GitHub Actions still runs the jobs and steps.

The current authoring API covers `push`, `pull_request`, `pull_request_target`,
`workflow_dispatch`, and `workflow_call` events; jobs, dependencies, runners, permissions,
concurrency, environments, matrix strategy, conditions, outputs, and `uses`,
`run`, and task steps. A typed expression AST builds GitHub runtime expressions
in field callbacks. `rawNode<T>()` embeds a raw expression inside an AST;
`rawExpression()` remains an explicit whole-expression escape hatch. Other CI
provider backends are not implemented.

## Package releases

Releases distribute `@atty303/tsugiori` on
[JSR](https://jsr.io/@atty303/tsugiori) with a matching versioned source archive
on GitHub Releases. Releases follow
Conventional Commits and normal SemVer (`fix`: patch, `feat`: minor, breaking
change: major).

## Use the repository workflow

The checked-in [.github/workflows.ts](.github/workflows.ts) is the source for
[.github/workflows/ci.yml](.github/workflows/ci.yml). Its Deno project is
[.github/deno.json](.github/deno.json), which imports this repository's
provider entrypoint through the local workspace package. From `.github`, generate and
commit the resulting YAML:

```sh
deno task tsugiori generate
```

Check the committed output without changing it:

```sh
deno task tsugiori generate --check
```

Check mode reports missing or changed configured outputs. Unconfigured files
are ignored. Add `--output workflows/ci.yml` to check one output. The
generated file's first line identifies its owning entrypoint. The repository CI
runs the check task before its task-backed test step.

## Author a workflow

An authoring file imports the GitHub Actions API and runner from the
`/github-actions` entrypoint. It exports the project and calls `runProject()`
when executed:

```ts
import { defineWorkflow, defineProject, runProject } from "@atty303/tsugiori/github-actions";

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
  workingDirectory: ".github", cacheVersion: 1, workflows: [ci],
});
export default project;

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
```

Pass the executable `workflows.ts` module's `import.meta.url` as `entrypointUrl`,
including when the project value is imported from another module. This URL
identifies the generated YAML's source and the task artifact compilation
entrypoint; it does not determine the project directory.

Set the Deno project's `tsugiori` task as in
[.github/deno.json](.github/deno.json). Workflow paths are relative to the Deno
project directory, taken from `Deno.cwd()`. Deno tasks set that directory to
the task project; direct invocation must run from the same directory.
`workingDirectory` selects the project directory inside the preparation Action. Normal run steps and task bodies keep native job/step defaults.
The project directory supplies Deno imports and its lockfile. Top-level
authoring code should construct deterministic definitions; task work belongs
inside `.task()` callbacks.

An external repository can use the same project entrypoint. Its workflow
project's `deno.json` maps one package name to a released JSR version. Provider
and advanced subpath imports resolve through this single mapping:

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@<released-version>"
  },
  "tasks": {
    "tsugiori": "deno run --frozen=true -A ./workflows.ts"
  }
}
```

Replace `<released-version>` with a version that includes these exports, run
`deno install` to prepare the entrypoint dependencies, and commit the workflow
project's Deno lockfile. For example, import the umbrella
from `@atty303/tsugiori/github-actions`, or import only
`@atty303/tsugiori/github-actions/authoring`,
`@atty303/tsugiori/github-actions/run`,
`@atty303/tsugiori/github-actions/testing`, or
`@atty303/tsugiori/task`. Changes to a JSR version or lockfile are outside the
automatic artifact key; increase `cacheVersion` when they change the task
binary.

Task-backed jobs include two visible preparation steps: `actions/cache`, then
this release's composite preparation Action, pinned to its source commit SHA.
Generation uses `deno info` to compute a source key and embeds it in
YAML; the cache key also includes the runner's OS and architecture. Regenerate
and commit YAML after tracked source changes. `generate --check` detects stale
source keys even when the workflow structure is unchanged. Source and artifact
keys encode SHA-256 as 50 uppercase Base36 digits, prefixed with `S` and `A`
respectively.

A restored compiled artifact verifies its embedded local-module paths and hashes
against the checkout, plus its manifest, binary checksum, and platform. A valid
hit needs no external Deno or dependency download. Changed or missing tracked
source stops preparation as YAML drift: regenerate and commit the workflow YAML
before running tasks. This conservatively rejects source changes even if they
would leave the workflow structure unchanged. On a cache miss, restore failure,
damaged artifact, or startup failure, prepare falls back to source preparation
only when the current source key matches YAML. A different key stops before
building or publishing a runtime. YAML-only edits remain the responsibility of
`generate --check`. Task failures belong to the subsequent task steps and are
not retried by preparation.

Tsugiori source commands require Deno **2.6.0 or newer**, checked at the common
`runProject` entrypoint. Local commands report an insufficient version and do
not install Deno. Import or syntax failures on older runtimes can occur before
that check. CI fallback uses Deno on PATH unchanged; an insufficient version
fails at the same source entrypoint without automatic replacement. Only when
Deno is absent does it download the official ZIP at the Action's pinned version,
matching Tsugiori's tested development toolchain, into a temporary private directory. Preparation
uses that binary explicitly for all subprocesses, removes downloaded tools on
exit, and leaves application Deno settings, lockfiles, and later steps' PATH
alone. No Deno cache or runner tool-cache lookup is used.
A source checkout without release identity must explicitly set
`localTaskPrepareAction` to a checkout-relative path such as
`"./.github/actions/task-prepare"` to generate task-backed workflows. Released
packages select their Action automatically.

Runtime binaries are stored outside the repository in the platform cache's
`tsugiori/runtimes/` directory (`XDG_CACHE_HOME` overrides the base;
otherwise `~/Library/Caches` on macOS or `~/.cache` on Linux). The Actions
transport path lives under `runner.temp`. Each task receives an absolute
runtime path and uses `<workflow-path>/<job-id>/task-<ordinal>` as its entrypoint.
The binary is compiled with Deno `-A`; task artifacts support Linux and macOS
on X64 and ARM64. Windows task artifacts are rejected.

The source key follows all reachable local modules, including imports outside
the project, using project-relative paths, artifact format, Tsugiori package
identity, and `cacheVersion`. Remote modules, lockfiles, and Deno settings and
versions remain excluded. Increase `cacheVersion` when such changes require a
new binary. See [Architecture](docs/ARCHITECTURE.md) for these boundaries.

Preparation and task commands retain bounded local diagnostics under
`<platform-cache>/tsugiori/diagnostics/` (32 recent records, failures preferred).
Bootstrap stage records live under `runner.temp/tsugiori-diagnostics/` (32 runs).
Set `TSUGIORI_DIAGNOSTICS=0` to disable recording; `RUNNER_DEBUG=1` also displays
command records. Records omit task inputs, outputs, environment values, and
raw exception messages; no remote diagnostic export is configured. Delete these
directories to clear diagnostics.

## Test workflow logic

Use `scenario()` inside `Deno.test` to check the lowered GitHub Actions
workflow without running authored steps or task bodies. Give referenced
external values with `github()`, `inputs()`, `vars()`, or `secrets()`. A reached
authored step needs an explicit ID and a fixture. Task fixtures return native
output values; Tsugiori validates and serializes them before passing them to
later steps and jobs. Action and run-step outputs are strings.

```ts
import { scenario } from "@atty303/tsugiori/github-actions";

Deno.test("deploy failure reaches completion", async () => {
  await scenario(deployWorkflow, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/master", event: {} });
    test.job("detect", (job) => {
      job.step("plan").fixture({ outputs: { stages: ["dev", "prd"] } });
    });
    test.job("deploy", (job) => {
      job.expectMatrix([{ stage: "dev" }, { stage: "prd" }]);
      job.eachMatrix(({ stage }, instance) => {
        instance.step("run-deploy")
          .fixture({ outcome: stage === "prd" ? "failure" : "success" })
          .expectInputs({ stage });
      });
      job.expectResult("failure");
    });
    test.job("complete", (job) => {
      job.step("notify").fixture({}).expectInputs({ deployResult: "failure" });
    });
  });
});
```

The snippet shows the shape of a scenario; supply fixtures for every other
reached authored step and all required task outputs in a real workflow. The
workflow type supplies job and step IDs, task input and output values, and
matrix values to the editor and type checker. `fixture()` supplies values;
`expectRun()`, `expectSkip()`, `expectInputs()`, `expectOutputs()`, and
`expectResult()` check independent expectations. Expectations are optional.
`expectBefore()` checks a declared `needs` edge without asserting an order
between independent jobs. `expectAllReached()` provides an optional common
step conclusion expectation.

Typed expressions are evaluated by the interpreter. For an unsupported raw
expression or `hashFiles()`, give the value at its exact evaluation site, such
as `job.step("build").expression("if", true)` or
`job.expression("strategy.matrix", { stage: ["dev"] })`. An omitted value is
an error. Generated task preparation steps succeed by default and can be
overridden with `job.internal("prepare", "failure")`. Failures identify the
defineWorkflow, job, matrix, step, and field, and distinguish missing or invalid
fixtures, expression errors, and expectation mismatches.

This test covers trigger filters, conditions, matrix expansion, `needs`,
status, input and output wiring, and results. GitHub Actions still owns runner
execution, permissions, environment approvals, timeouts, concurrency, and
actual scheduling. Keep task unit tests for the task bodies themselves.

## Expressions and outputs

Job fields are set in definition order. Configure a matrix before concurrency,
and define steps before job outputs. Each expression callback receives the
contexts available at its GitHub Actions field. Step callbacks see only earlier
step IDs; dependent jobs see only declared outputs from their dependencies.

```ts
import { defineWorkflow, fromJSON, jsonValue, present, rawNode } from "@atty303/tsugiori/github-actions";

const stages = jsonValue({
  parse(value: unknown): readonly string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new TypeError("Expected stage names");
    }
    return value;
  },
});

const first = defineWorkflow(".github/workflows/deploy.yml", {
  on: { push: {} },
}).job("prepare", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .task({
      id: "make", name: "Make matrix", inputs: {},
      outputs: { matrix: { contract: stages, required: false } },
      run: async ({ outputs }) => {
        await outputs.set("matrix", ["dev", "stg"]);
      },
    })
    .outputs(({ steps }) => ({ matrix: steps.make.outputs.matrix })));

const deploy = first.job("deploy", ({ job, jobs }) =>
  job.needs(jobs.prepare).runsOn("ubuntu-latest")
    .when(({ needs }) => present(needs.prepare.outputs.matrix))
    .strategy(({ needs }) => ({
      matrix: {
        stage: fromJSON(needs.prepare.outputs.matrix),
      },
    }))
    .concurrency({
      group: ({ matrix }) => matrix.stage,
      cancelInProgress: false,
    })
    .task({
      name: "Deploy",
      inputs: {
        stages: { contract: stages, from: ({ needs }) => needs.prepare.outputs.matrix },
      },
      env: { DEPLOY_REGION: "ap-northeast-1" },
      outputs: {},
      if: ({ matrix }) => matrix.stage.ne("disabled")
        .and(rawNode<boolean>("custom_check()")),
      run: ({ inputs }) => { console.log(inputs.stages); },
    }));
```

Operators are methods (`.eq()`, `.and()`, `.not()`, and so on); GitHub built-in
functions are exported separately. Host TypeScript strings, including template
strings, are accepted as literal operands to AST methods. An expression field
requires an AST or `rawExpression()` and never interprets an ordinary string
as an expression. Task inputs declare a contract and source together; Tsugiori
generates their step environment variables and parses them before `run`.
`jsonValue()` accepts any parser with `parse(value: unknown): T`, including a
Zod schema supplied by the consumer project, and requires it to preserve the
JSON shape. `textValue()` handles non-empty text. Each output declares whether
it is required. An omitted output is logically `null` and has an empty wire
value; a task cannot write top-level `null` or an empty text value. JSON arrays
and nested `null` remain ordinary values. The producer validates before writing
and the consumer validates before `run`.
`required` is enforced when the task runs. A task skipped by `if`, or a task
with `continueOnError`, exposes its outputs as optional to later steps.

Direct task-output references and direct job-output passthroughs retain their
contract. A computed job-output expression does not. `present(ref)` renders a
GitHub empty-string check and proves an optional typed reference is present in
`when` or task `if` conditions; `and` preserves that proof. `or`, negation, and
raw expressions do not. `fromJSON(typedRef)` infers the JSON value type when
the reference is required or presence has been proved, and emits an ordinary
`fromJSON(ref)` call. For untyped references, `.as<T>()` remains a caller
assertion without runtime validation. `.and()` retains the falsy branch of its left operand in the result type,
while `.or()` retains the truthy branch; GitHub Actions performs the actual
comparison, truthiness, and logical operator evaluation.

## Action metadata contracts

The official type service is
[tsugiori.atty303.workers.dev](https://tsugiori.atty303.workers.dev). Map an
Action reference with the same `owner/repo[/path]@ref` used by GitHub Actions.
Run these steps from your workflow's Deno project directory:

1. Add the mapping before adding its import to `workflows.ts`:

   ```sh
   deno task tsugiori actions add actions/checkout@v4
   ```

2. Fetch and lock the mapped dependency with Deno:

   ```sh
   deno install
   ```

3. Write `import checkout from "#actions/actions/checkout";` in `workflows.ts`
   and pass the contract to `job.uses()` as below.
4. Generate the workflows:

   ```sh
   deno task tsugiori generate
   ```

5. Check committed workflow freshness:

   ```sh
   deno task tsugiori generate --check
   ```

The task loads `workflows.ts` and its existing imports before processing the
command, so its dependencies must already be installed. `actions add` edits only
inline `imports` in the task project directory's `deno.json` or `deno.jsonc`. It
preserves comments and unrelated settings, and never fetches metadata, updates
the lockfile, or writes source imports. An identical mapping succeeds without a
write; a conflicting alias fails without changing the file. Missing or ambiguous
configuration, external `importMap`, malformed JSONC, and duplicate root/import
keys fail explicitly. Other manually chosen aliases remain supported.

The example command adds this entry to your existing configuration:

```json
{
  "imports": {
    "#actions/actions/checkout": "https://tsugiori.atty303.workers.dev/github/actions/v1/actions/checkout@v4"
  }
}
```

Import the contract and pass it directly to `job.uses(contract, options?)`:

```ts
import checkout from "#actions/actions/checkout";

// In a workflow job callback:
job.runsOn("ubuntu-latest").uses(checkout, {
  id: "checkout",
  name: "Checkout",
  with: ({ github }) => ({ ref: github.sha }),
});
job.runsOn("ubuntu-latest").uses(checkout);
job.runsOn("ubuntu-latest").uses(checkout, {
  uses: "my-org/checkout@<ref>",
});
job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
  with: { "fetch-depth": "0" },
});
```

Contracts infer input names, requiredness, and output names. All action inputs
accept strings and `Expression<string>` values, including when no contract is
provided. Convert boolean or number expressions explicitly with `toJSON()` or
`format()`; static values use strings such as `"false"` or `"0"`. Reusable
workflow and dispatch inputs retain their declared primitive types.

Only `required: true` inputs without a default must be supplied. These require
the second argument, `with`, and the named input. Otherwise both options and
`with` may be omitted. `with` accepts an object or a callback receiving the step
input expression scope. Tsugiori leaves defaults to the action and emits no
`with` when it is omitted. Descriptions, default information, and deprecation
messages are available in editor documentation. Outputs remain strings even when
an action serializes JSON; a step `id` exposes declared outputs to later steps.
A string reference checks input values but has no input-name contract or
declared output names, and cannot specify `uses` again in options.

Handwritten contracts use the same metadata shape:

```ts
import type { ActionContract } from "@atty303/tsugiori/github-actions";

const checkout = {
  uses: "actions/checkout@v4",
  name: "Checkout",
  description: "Checkout the repository",
  inputs: {
    ref: { description: "Ref to checkout" },
    "fetch-depth": { description: "Number of commits to fetch", default: "1" },
  },
  outputs: { commit: { description: "Checked out commit SHA" } },
} as const satisfies ActionContract;
```

Contracts are caller declarations; Tsugiori does not inspect the selected action
during workflow generation. Type checks enforce string expressions. Runtime
validation also rejects invalid primitive values and provably non-string
expression nodes. Raw expressions and `.as<T>()` remain caller assertions
without runtime value-type validation.

Service contracts supply a SHA-pinned default `uses`, including when the
import URL selects a tag such as `@v4`. An
explicit `uses` replaces the entire reference, including local actions or forks.
Tsugiori does not verify that the selected implementation matches the contract.
An override that changes the execution target omits the original-ref
comment; the imported contract lock does not pin that override.

The recommended import alias is `#actions/<owner>/<repo>[/path]`; this is a
convention, not a requirement. Other aliases and direct URL imports also work.

The service accepts public GitHub.com repositories, including subdirectory
actions. The URL is `/github/actions/v1/<owner>/<repo>[/path]@<ref>` without a
`.ts` suffix. Encode each location segment individually and the whole ref with
`encodeURIComponent`; `acme/tools/publish@release%2Fv3` selects `release/v3`.
Local actions, private repositories, GHES and Docker references cannot be
sources.

Full 40-digit commit SHAs return a module directly, without ref resolution or
redirect. Tags, branches and abbreviated SHAs redirect to the resolved SHA:
`/github/actions/v1/actions/checkout@<SHA>?ref=v4`. The query retains the
original ref only as annotation. Metadata and the contract's `uses` refer to the
SHA; `originalRef` becomes a comment such as
`uses: actions/checkout@<SHA> # v4`. Direct SHA imports without this query have
no original-ref comment.

`v1` fixes the generator output and parser dependency. Future changes to those
bytes require another version. The module contains metadata except `runs`, a
SHA-pinned `uses` and optional `originalRef`, without a Tsugiori import. Scalar
defaults retain their data types without changing the string input type. Ref
redirects are cached for five minutes and SHA modules for up to one year. GitHub
availability and rate limits still apply; cache is not durable storage. A cold
miss regenerates from GitHub, so deleted upstream data can make imports
unavailable. Errors never return widened contracts or expired ref resolutions.
The unversioned and `/_resolved/g1/` routes are not supported by this contract.

Commit your Deno lockfile. Deno 2.9.5 records both the redirect and the resolved
module checksum; a cold fetch with `--frozen=true` uses that fixed URL. To
refresh a mutable ref deliberately, remove **that entry URL's mapping** from
`redirects` in the lockfile, then rerun your entrypoint with `--reload` and
`--frozen=false`, and review the resulting lockfile change. `--reload` alone
retains the locked redirect. An import ref change creates a new entry URL.

## Reusable workflows and the specification basis

Tsugiori emits native reusable workflow files and caller jobs. Include each
local callee in the same project. Calling a local workflow checks input names,
primitive types and required values, explicit secrets and declared output
references. `secrets: "inherit"` forwards one hop; it cannot prove repository
secret availability or organization/enterprise eligibility.

```ts
import { defineWorkflow, defineProject } from "@atty303/tsugiori/github-actions";

const definition = defineWorkflow(".github/workflows/build.yml", {
  on: {
    workflow_call: {
      inputs: { module: { type: "string", required: true } },
      secrets: { token: { required: true } },
    },
  },
});
const build = definition.job("build", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .defaultsRun({ shell: "bash", workingDirectory: "./modules" })
    .run({
      id: "build",
      name: "Build",
      run: 'echo "message=ok" >> "$GITHUB_OUTPUT"',
      env: { MODULE: definition.inputs.module },
      outputs: ["message"],
    })
    .outputs(({ steps }) => ({ message: steps.build.outputs.message })))
  .workflowOutputs(({ jobs }) => ({ message: jobs.build.outputs.message }));

const ci = defineWorkflow(".github/workflows/ci.yml", {
  on: { push: { branches: ["main"], tags: ["v*"] } },
}).job("build", ({ job }) =>
  job.reusable().call("./.github/workflows/build.yml", build, {
    with: { module: "app" },
    secrets: "inherit",
  }));

export default defineProject({ workflows: [ci, build] });
```

`defineWorkflow()` takes a nonempty `on` object with supported event keys;
use `{}` for an event without settings. String and array trigger shorthands
are not accepted. Dispatch inputs belong in `on.workflow_dispatch.inputs`;
call inputs, secrets and outputs belong in `on.workflow_call`.

Reusable calls use `job.reusable().call(uses, callee, args)`. The GitHub-native
`uses` reference is explicit; authors keep it consistent with the callee
definition used for typed inputs, secrets, outputs and scenarios.

`definition.inputs` and field callback `inputs` infer declared input names
and value types from both dispatch and call definitions. Dispatch `choice`
values are strings. When events declare different types, references use their
union; an event without that input contributes `""`, matching GitHub's
[missing property evaluation](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#available-contexts).
Event conditions do not narrow this union. Reusable call arguments and secrets
are checked against only the `workflow_call` contract. `.workflowOutputs()`
replaces the complete `on.workflow_call.outputs` map after jobs are defined. Workflow outputs use the callee's `jobs` context. Caller outputs become
the ordinary `needs.<job>.outputs` surface. Expressions/raw nodes are evaluated
by GitHub; runtime expression values cannot all be statically guaranteed.

Use
`job.reusable().rawCall("owner/repo/.github/workflows/build.yml@<ref>", args)`
for an external workflow. Its input/secret/output contracts are caller
assertions. Caller jobs support conditions, needs, matrix strategy, name,
permissions and concurrency; they do not contain runner execution fields.

A static platform matrix can use `strategy({ matrix: { include: rows } })`. Row
fields supply typed matrix references. Configure strategy before
`.runsOn(({ matrix }) => matrix.runner)` or other matrix-dependent fields.
`.runsOn(["self-hosted", "linux"])` emits conjunctive runner labels. `.env()`
defines job env; workflow env belongs in workflow options. Job `.defaultsRun()`
emits native defaults, and a run step's `shell` and `workingDirectory` override
them. Step `timeoutMinutes` accepts an integer or an expression callback.
PR/PR-target `types`, push tags, dispatch choice/options, `runName`, job
`.name()` and `actions`/`pull-requests` permissions are supported.

Pass `{ config }` as the third argument of `scenario()` when testing local
calls. Configure a caller instance with
`instance.call(callee, test => { ...callee job fixtures... })`, nesting this for
further calls. `expectCallInputs()` and `expectCallSecrets()` check the actual
propagated values. Child contexts come from the call and cannot be overridden by
child context fixtures. External calls use `callFixture()`; local calls
interpret their callee and reject external fixtures. Workflow env does not cross
a call. Results retain nested call results and workflow outputs. Optional
`{ observe }` sends bounded per-workflow stage events to a host-owned sink
without fixture values; sink errors do not change the scenario result.

[Specification coverage and limits](docs/GITHUB_ACTIONS_SPEC.md) identify the
fixed GitHub.com basis for this source/version. Normal generation, validation
and scenarios do not fetch specifications. Coverage is distinct from hosted
GitHub execution and effective authorization.
