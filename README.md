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

The current authoring API covers `push`, `pull_request`, and
`workflow_dispatch` events; jobs, dependencies, runners, permissions,
concurrency, environments, matrix strategy, conditions, outputs, and `uses`,
`run`, and task steps. A typed expression AST builds GitHub runtime expressions
in field callbacks. `rawNode<T>()` embeds a raw expression inside an AST;
`rawExpression()` remains an explicit whole-expression escape hatch. Other CI
provider backends are not implemented.

## Use the repository workflow

The checked-in [.github/tsugiori.ts](.github/tsugiori.ts) is the source for
[.github/workflows/ci.yml](.github/workflows/ci.yml). Its Deno project is
[.github/deno.json](.github/deno.json), which imports this repository's
root entrypoint through a local import mapping. From `.github`, generate and
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

An authoring file imports the GitHub Actions API and runner from the package
root. It exports the config and calls `runTsugiori()` when executed:

```ts
import { defineTsugiori, pipeline, runTsugiori } from "@atty303/tsugiori";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["push", "pull_request"],
  permissions: { contents: "read" },
}).job("test", ({ job }) =>
  job.runsOn("ubuntu-24.04").task({
    name: "Test",
    task: async () => {
      const result = await new Deno.Command("deno", {
        args: ["test", "-A"],
        stdout: "inherit",
        stderr: "inherit",
      }).output();
      if (!result.success) throw new Error(`Tests failed: ${result.code}`);
    },
  }));

const config = defineTsugiori({ cacheVersion: 1, pipelines: [ci] });
export default config;

if (import.meta.main) {
  Deno.exitCode = await runTsugiori({
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

An external repository can use the same config entrypoint without a workspace
package. Its workflow project's `deno.json` maps the package root to one
Tsugiori commit:

```json
{
  "imports": {
    "@atty303/tsugiori": "https://raw.githubusercontent.com/atty303/tsugiori/<full-commit-sha>/packages/core/src/mod.ts"
  },
  "tasks": {
    "generate": "deno run --frozen=true -A ./tsugiori.ts generate",
    "generate:check": "deno run --frozen=true -A ./tsugiori.ts generate --check"
  }
}
```

Use a full commit SHA and commit the workflow project's Deno
lockfile. Changes to remote source are outside the automatic artifact key;
increase `cacheVersion` when updating the pin changes the task binary.

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

## Expressions and outputs

Job fields are set in definition order. Configure a matrix before concurrency,
and define steps before job outputs. Each expression callback receives the
contexts available at its GitHub Actions field. Step callbacks see only earlier
step IDs; dependent jobs see only declared outputs from their dependencies.

```ts
import {
  defineTask, fromJSON, pipeline, rawNode,
} from "@atty303/tsugiori";

const prepare = defineTask({
  outputs: ["matrix"],
  run: async ({ outputs }) => {
    await outputs.set("matrix", '["dev", "stg"]');
  },
});

const first = pipeline("deploy", {
  output: ".github/workflows/deploy.yml",
  events: ["push"],
}).job("prepare", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .task({ id: "make", name: "Make matrix", task: prepare })
    .outputs(({ steps }) => ({ matrix: steps.make.outputs.matrix })));

const deploy = first.job("deploy", ({ job, jobs }) =>
  job.needs(jobs.prepare).runsOn("ubuntu-latest")
    .strategy(({ needs }) => ({
      matrix: {
        stage: fromJSON(needs.prepare.outputs.matrix).as<readonly string[]>(),
      },
    }))
    .concurrency({
      group: ({ matrix }) => matrix.stage,
      cancelInProgress: false,
    })
    .run({
      name: "Deploy",
      run: "./deploy.sh",
      if: ({ matrix }) => matrix.stage.ne("disabled")
        .and(rawNode<boolean>("custom_check()")),
    }));
```

Operators are methods (`.eq()`, `.and()`, `.not()`, and so on); GitHub built-in
functions are exported separately. Host TypeScript strings, including template
strings, are accepted as literal operands to AST methods. An expression field
requires an AST or `rawExpression()` and never interprets an ordinary string
as an expression. `fromJSON()` starts with an unknown result type; `.as<T>()`
asserts the expected shape for type checking and does not validate the runtime
JSON. `.and()` retains the falsy branch of its left operand in the result type,
while `.or()` retains the truthy branch; GitHub Actions performs the actual
comparison, truthiness, and logical operator evaluation. `defineTask()` output
values are strings, and a task may
omit any declared output.
