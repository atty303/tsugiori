# Repository Layout Proposal

This document proposes a future repository layout for Forge implementation
work. It is not an implemented structure. Do not create these directories,
package manifests, generated workflows, fixtures, or CI configuration until the
corresponding implementation phase begins.

## Goals

- keep workflow authoring imports pure, side-effect-free, and dependency-light
- separate authoring types and builders from compiler execution
- keep provider-neutral core concepts distinct from provider-specific modules
  without forcing separate packages before there is a practical benefit
- provide stable homes for source, tests, examples, generated fixtures, and
  future CLI entrypoints
- preserve the GitHub Actions-native backend direction described in the
  roadmap and ADRs

## Proposed Top-Level Shape

```text
packages/
  core/
  compiler/
  cli/
tests/
  fixtures/
examples/
```

The package split is intended to separate import-time authoring APIs from
compile-time execution. It is not intended to introduce independent release
units before the project needs them.

## `packages/core`

`packages/core` is the pure package that workflow authors import from workflow
definition files.

It should avoid filesystem access, process execution, network access, package
installation, YAML writing, and compiler side effects. Its job is to construct
structured data that compiler packages can consume later.

The package may contain both provider-neutral modules and backend-specific
modules, as long as the module boundaries stay explicit:

```text
packages/core/
  src/
    core/
    github-actions/
```

The provider-neutral modules should hold only concepts that can plausibly be
shared across CI backends, such as workflow identity, job graph shape, logical
step references, runtime artifact contracts, and cache adapter contracts.

The GitHub Actions modules should own Actions-specific authoring concepts such
as events, runner labels, permissions, `uses` steps, expression builders,
`workflow_call`, and GitHub Actions workflow AST construction.

Authoring imports should use subpaths so the backend boundary remains visible:

```ts
import { workflow, expr } from "@forge/core/github-actions";
import type { Workflow } from "@forge/core";
```

The root `@forge/core` export should stay small and should not re-export every
backend DSL by default.

## `packages/compiler`

`packages/compiler` is the execution package for turning authoring source into
generated artifacts.

It should own:

- loading and evaluating workflow authoring source
- converting pure authoring data into backend ASTs when needed
- deterministic GitHub Actions YAML emission
- planned `forge generate` behavior
- planned `forge generate --check` stale-output behavior
- writing generated files when running in generation mode
- reporting stale generated files without mutating the tree when running in
  check mode

The compiler package may depend on `packages/core`. `packages/core` should not
depend on `packages/compiler`.

## `packages/cli`

`packages/cli` should stay a thin command-line entrypoint over compiler
capabilities.

The planned initial commands are:

- `forge generate`
- `forge generate --check`

Command parsing, user-facing diagnostics, and process exit handling belong
here. Workflow modeling, YAML emission, and stale-check comparison logic should
remain in `packages/compiler`.

## Tests

Tests should be organized around behavior rather than package internals.

Initial Phase 1 tests should focus on:

- deterministic YAML emission for the minimal GitHub Actions AST subset
- stable ordering and formatting of emitted workflow files
- stale-output detection behavior for missing, extra, and changed generated
  files

Later tests should cover:

- GitHub Actions expression emission
- validation behavior
- step registry and runtime subcommand alignment
- runtime artifact manifest generation
- cache adapter contract behavior

## Fixtures

`tests/fixtures` should hold small, explicit source and expected-output
fixtures used by tests.

Generated workflow fixtures should be checked in only as test expectations or
illustrative examples. They should not be wired into this repository's own CI
until implementation reaches the dogfooding phase.

## Examples

`examples` should hold illustrative Forge authoring source and generated YAML
pairs once implementation can produce them.

Examples should remain GitHub Actions-native for the initial backend. They
should not imply that Forge has implemented future backends, hosted services,
or provider-neutral portability before those features exist.

## Deferred Decisions

The implementation phase still needs to decide:

- the exact Deno workspace or package manifest shape
- public package names
- export maps for subpath imports
- test runner commands
- formatting and linting commands
- fixture update workflow
- whether packages become independent publishable units

Those decisions should be made when implementation begins and the toolchain
commands are known.
