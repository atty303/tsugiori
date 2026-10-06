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

The checked-in [.github/tsugiori.ts](.github/tsugiori.ts) is the source for
[.github/workflows/ci.yml](.github/workflows/ci.yml). Its Deno project is
[.github/deno.json](.github/deno.json), which imports this repository's
provider entrypoint through the local workspace package. From `.github`, generate and
commit the resulting YAML:

```sh
deno task generate
```

Check the committed output without changing it:

```sh
deno task generate:check
```

Check mode reports missing, changed, and extra `.yml` files owned by this
config. Add `--output .github/workflows/ci.yml` to check one output. The
generated file's first line identifies its owning config. The repository CI
runs the check task before its task-backed test step.

## Author a workflow

An authoring file imports the GitHub Actions API and runner from the
`/github-actions` entrypoint. It exports the config and calls `runProject()`
when executed:

```ts
import { definePipeline, defineProject, runProject } from "@atty303/tsugiori/github-actions";

const ci = definePipeline("ci", {
  output: ".github/workflows/ci.yml",
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

const config = defineProject({ cacheVersion: 1, pipelines: [ci] });
export default config;

if (import.meta.main) {
  Deno.exitCode = await runProject({
    config,
    configUrl: import.meta.url,
    root: new URL("../", import.meta.url),
  });
}
```

Set the Deno project's `generate` and `generate:check` tasks as in
[.github/deno.json](.github/deno.json). The config supplies the repository root;
generated workflow paths and `.tsugiori/` storage are relative to that root.
The project directory supplies Deno imports and its lockfile. Top-level
authoring code should construct deterministic definitions; task work belongs
inside `.task()` callbacks.

An external repository can use the same config entrypoint. Its workflow
project's `deno.json` maps one package name to a released JSR version. Provider
and advanced subpath imports resolve through this single mapping:

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@<released-version>"
  },
  "tasks": {
    "generate": "deno run --frozen=true -A ./tsugiori.ts generate",
    "generate:check": "deno run --frozen=true -A ./tsugiori.ts generate --check"
  }
}
```

Replace `<released-version>` with a version that includes these exports and
commit the workflow project's Deno lockfile. For example, import the umbrella
from `@atty303/tsugiori/github-actions`, or import only
`@atty303/tsugiori/github-actions/authoring`,
`@atty303/tsugiori/github-actions/run`,
`@atty303/tsugiori/github-actions/testing`, or
`@atty303/tsugiori/task`. Changes to a JSR version or lockfile are outside the
automatic artifact key; increase `cacheVersion` when they change the task
binary.

Task-backed jobs include visible artifact-key, `actions/cache`, and preparation
steps before the task invocation. The generated cache step can restore a
matching artifact; on a successful cache miss, its post action can save it.
The prepared binary is invoked as `./.tsugiori/task-runtime
<pipeline-id>/<job-id>/task-<ordinal>`. The current binary is compiled with
Deno `-A` and targets POSIX invocation; Windows task artifacts are rejected.

The artifact key follows repository-local source modules, target platform,
artifact format, Tsugiori package identity, and `cacheVersion`. Increase
`cacheVersion` when an excluded input such as a remote module, lockfile, or
Deno setting changes the task binary. See [Architecture](docs/ARCHITECTURE.md)
for the exact boundary and [Roadmap](docs/ROADMAP.md) for unfinished work.

Run the repository checks with `mise run check` and `mise run test` from the
repository root.

## Test pipeline logic

Use `scenario()` inside `Deno.test` to check the lowered GitHub Actions
workflow without running authored steps or task bodies. Give referenced
external values with `github()`, `inputs()`, `vars()`, or `secrets()`. A reached
authored step needs an explicit ID and a fixture. Task fixtures return native
output values; Tsugiori validates and serializes them before passing them to
later steps and jobs. Action and run-step outputs are strings.

```ts
import { scenario } from "@atty303/tsugiori/github-actions";

Deno.test("deploy failure reaches completion", async () => {
  await scenario(deployPipeline, (test) => {
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
reached authored step and all required task outputs in a real pipeline. The
pipeline type supplies job and step IDs, task input and output values, and
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
definePipeline, job, matrix, step, and field, and distinguish missing or invalid
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
import { definePipeline, fromJSON, jsonValue, present, rawNode } from "@atty303/tsugiori/github-actions";

const stages = jsonValue({
  parse(value: unknown): readonly string[] {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      throw new TypeError("Expected stage names");
    }
    return value;
  },
});

const first = definePipeline("deploy", {
  output: ".github/workflows/deploy.yml",
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

Import a metadata contract from a hosted type service and pass it directly to
`job.uses(contract, options?)`. Replace `<host>` with the service's configured
host; this repository does not supply a deployed endpoint.

```ts
import checkout from "https://<host>/github/actions/actions/checkout@v4";

// In a pipeline job callback:
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
`with` may be omitted. `with` accepts an object or a callback receiving the
step input expression scope. Tsugiori leaves defaults to the action and emits
no `with` when it is omitted. Descriptions, default information, and
deprecation messages are available in editor documentation. Outputs remain
strings even when an action serializes JSON; a step `id` exposes declared
outputs to later steps. A string reference checks input values but has no
input-name contract or declared output names, and cannot specify `uses` again
in options.

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

Contracts are caller declarations; Tsugiori does not inspect the selected
action during workflow generation. Type checks enforce string expressions.
Runtime validation also rejects invalid primitive values and provably
non-string expression nodes. Raw expressions and `.as<T>()` remain caller
assertions without runtime value-type validation.

The import's original action and ref supply the default `uses`: importing
`@v4` emits `@v4`, even though the metadata was fetched at a particular SHA.
An explicit `uses` replaces the entire reference, including local actions or
forks. Tsugiori does not verify that the selected implementation matches the
contract, and locking the imported contract does **not** lock the executed
action. Pin `uses` to a SHA separately when that is desired.

The service accepts public GitHub.com repositories, including subdirectory
actions. The URL is `/github/actions/<owner/repo[/path]@ref>` without a `.ts`
suffix. Encode each owner/repository/path segment individually and the whole
ref with `encodeURIComponent`; for example,
`/github/actions/acme/tools/publish@release%2Fv3` specifies branch `release/v3`.
Tags, branches, and full commit SHAs use the same route. Local actions, private
repositories, GHES and Docker image references cannot be metadata sources.

The entry redirects to
`/_resolved/g1/<SHA>/github/actions/<original-uses>`. `g1` identifies the
immutable generator; `original-uses` uses the same encoding. The generated
module contains metadata except `runs`, plus the original `uses`, with no
Tsugiori import. YAML scalar defaults (including boolean, number, and null)
are retained as data; they do not change the string input type. Ref resolutions
are cached for five minutes, and immutable modules for up to one year. GitHub
availability and API rate limits still apply. A cache miss regenerates from
GitHub; deletion of upstream data can make old imports unavailable. Failed
fetches or invalid metadata produce errors rather than widened contracts or
expired ref resolutions.

Commit your Deno lockfile. Deno 2.9.5 records both the redirect and the resolved
module checksum; a cold fetch with `--frozen=true` uses that fixed URL. To
refresh a mutable ref deliberately, remove **that entry URL's mapping** from
`redirects` in the lockfile, then rerun your entrypoint with `--reload` and
`--frozen=false`, and review the resulting lockfile change. `--reload` alone
retains the locked redirect. An import ref change creates a new entry URL.

## Reusable workflows and the specification basis

Tsugiori emits native reusable workflow files and caller jobs. Include each
local callee in the same config. Calling a local pipeline checks input names,
primitive types and required values, explicit secrets and declared output
references. `secrets: "inherit"` forwards one hop; it cannot prove repository
secret availability or organization/enterprise eligibility.

```ts
import { definePipeline, defineProject } from "@atty303/tsugiori/github-actions";

const definition = definePipeline("build", {
  output: ".github/workflows/build.yml",
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

const ci = definePipeline("ci", {
  output: ".github/workflows/ci.yml",
  on: { push: { branches: ["main"], tags: ["v*"] } },
}).job("build", ({ job }) =>
  job.reusable().call(build, {
    with: { module: "app" },
    secrets: "inherit",
  }));

export default defineProject({ pipelines: [ci, build] });
```

`definePipeline()` takes a nonempty `on` object with supported event keys;
use `{}` for an event without settings. String and array trigger shorthands
are not accepted. Dispatch inputs belong in `on.workflow_dispatch.inputs`;
call inputs, secrets and outputs belong in `on.workflow_call`.

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
defines job env; workflow env belongs in pipeline options. Job `.defaultsRun()`
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
