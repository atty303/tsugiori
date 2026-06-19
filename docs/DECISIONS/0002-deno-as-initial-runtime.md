# 0002: Deno as Initial Runtime

## Status

Accepted as initial direction.

## Context

The project needs an initial runtime for task function entrypoints. The runtime
should be practical enough for an MVP while keeping the main research focus on
the GitHub Actions provider backend and task model.

The runtime needs to support:

- TypeScript authoring with low adoption friction
- subprocess execution for CI tasks
- a path to a prepared task artifact
- enough type safety to make pipeline and task authoring useful
- a development model that does not dominate the project before the compiler
  model is proven

## Decision

The task runtime will initially target Deno.

Deno is selected because:

- `deno compile` provides a practical initial path to a single binary task
  artifact
- `Deno.Command` provides subprocess support suitable for CI task helpers
- TypeScript lowers adoption friction for many GitHub Actions users
- the TypeScript ecosystem is broad enough for an MVP
- the type system is acceptable for the initial provider backend and authoring
  API

## Consequences

The initial task runtime can be authored in TypeScript and compiled into
a binary task artifact that provider steps invoke with entrypoints such as
`test` and `build`.

Task artifact delivery and cache adapter boundaries are addressed separately in
ADR 0003.

This does not require the project to commit permanently to Deno. It establishes a
pragmatic first runtime while the project validates its more important premise:
that language-native authoring can produce useful, readable, Actions-native
YAML and task functions can be prepared automatically.

## Alternatives

MoonBit remains an interesting future option. It may offer advantages for a
small native toolchain or stronger compile-time guarantees as the project
matures.

MoonBit is not selected initially because the core project risk is the
GitHub Actions provider backend and task runtime model, not proving a newer
native toolchain. Choosing Deno keeps the MVP closer to the existing TypeScript
and GitHub Actions ecosystem.
