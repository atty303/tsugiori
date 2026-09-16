# Repository Layout Proposal

This document describes the intended repository layout as implementation
progresses. The current slices use `packages/core`, `packages/compiler`,
`packages/task-runtime`, `packages/cli`, and top-level `tests`. Other proposed
directories should be created only when their implementation phase begins.

## Goals

- keep pipeline and task authoring imports pure, side-effect-free, and
  dependency-light
- separate authoring types and builders from compiler execution
- keep provider pipeline authoring and task authoring internally distinct
  without forcing separate packages before there is a practical benefit
- provide stable homes for source, tests, examples, generated fixtures, and
  future CLI entrypoints
- preserve the GitHub Actions-native backend direction described in the roadmap
  and ADRs

## Proposed Top-Level Shape

```text
packages/
  core/
  compiler/
  task-runtime/
  cli/
tests/
  fixtures/
examples/
```

The package split is intended to separate import-time authoring APIs from
compile-time execution. It is not intended to introduce independent release
units before the project needs them.

## `packages/core`

`packages/core` is the pure package that pipeline and task authors import from
definition files.

It should avoid filesystem access, process execution, network access, package
installation, YAML writing, and compiler side effects. Its job is to construct
structured data that compiler and task runtime packages can consume later.

The package may contain both provider pipeline modules and task modules, as long
as the module boundaries stay explicit:

```text
packages/core/
  src/
    github-actions/
    task/
```

The GitHub Actions modules should own provider-native authoring concepts such as
workflows, events, jobs, steps, runner labels, permissions, `uses` steps,
expression builders, `workflow_call`, and GitHub Actions workflow AST
construction.

The task modules currently own task function and task context types. A future
standalone task registry should remain pure at authoring time.

Authoring imports should use subpaths so the backend boundary remains visible:

```ts
import { pipeline } from "@tsugiori/core/github-actions";
import type { TaskFunction } from "@tsugiori/core/task";
```

The root `@tsugiori/core` export should stay small and should not re-export
every provider DSL by default.

## `packages/compiler`

`packages/compiler` is the execution package for turning authoring source into
generated provider configuration.

It should own:

- loading and evaluating pipeline authoring source
- converting pure authoring data into provider backend ASTs when needed
- deterministic GitHub Actions YAML emission
- implemented `tsugiori generate` behavior
- planned `tsugiori generate --check` stale-output behavior
- writing generated files when running in generation mode
- reporting stale generated files without mutating the tree when running in
  check mode

The compiler package may depend on `packages/core`. `packages/core` should not
depend on `packages/compiler`.

## `packages/task-runtime`

`packages/task-runtime` is the execution package for task artifact preparation
and task runtime dispatch.

It should own:

- loading registered task functions from pure authoring data
- validating task registry and task entrypoint names
- building or bundling task artifacts
- restoring and populating task artifacts through cache adapters
- reading and writing task artifact metadata or manifests when implementation
  defines their shape
- dispatching task runtime entrypoints inside CI provider steps

The task runtime package may depend on `packages/core`. `packages/core` should
not depend on `packages/task-runtime`. The task runtime package should
eventually be usable without pipeline generation so handwritten provider
configuration can invoke managed tasks.

## `packages/cli`

`packages/cli` should stay a thin command-line entrypoint over compiler and task
runtime capabilities.

Implemented commands include:

- `tsugiori generate`
- `tsugiori task prepare`

The planned `tsugiori generate --check` command remains unimplemented.

Command parsing, user-facing diagnostics, and process exit handling belong here.
GitHub Actions workflow AST modeling, YAML emission, and stale-check comparison
logic should remain in `packages/compiler`. Task artifact preparation, cache
adapter behavior, and task runtime dispatch should remain in
`packages/task-runtime`.

## Tests

Tests should be organized around behavior rather than package internals.

Tests currently cover:

- deterministic YAML emission for the minimal GitHub Actions AST subset
- stable ordering and formatting of emitted workflow files
- authoring-to-provider lowering for inline tasks
- compiled CLI generation, local cache miss and hit, corrupt-entry recovery,
  runtime dispatch, and diagnostic recording behavior

The current tests use Deno's committed snapshots for the backend emitter and a
temporary-repository E2E test for the compiled CLI and task artifact.
Stale-output tests remain deferred until `generate --check` is implemented.

Later tests should cover:

- GitHub Actions expression emission
- validation behavior
- task artifact cache adapter contract behavior

## Fixtures

`tests/fixtures` should hold small, explicit source and expected-output fixtures
when a test is clearer as a fixture than as a committed snapshot.

Generated workflow fixtures should be checked in only as test expectations or
illustrative examples. They should not be wired into this repository's own CI
until implementation reaches the dogfooding phase.

## Examples

`examples` should hold illustrative authoring source and generated YAML pairs
once implementation can produce them.

Examples should remain GitHub Actions-native for the initial provider backend.
They should not imply support for future provider backends, hosted services, or
provider-neutral portability before those features exist.

## Deferred Decisions

Later implementation phases still need to decide:

- public package names
- export maps for subpath imports
- whether packages become independent publishable units
- remote cache adapter module layout

Those decisions should be made when their consumers and toolchain requirements
are known.
