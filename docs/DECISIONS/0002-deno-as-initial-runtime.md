# 0002: Deno as Initial Runtime

## Status

Accepted as initial direction.

## Context

Forge needs an initial runtime for step implementation entrypoints. The runtime
should be practical enough for an MVP while keeping the main research focus on
the Actions compiler model.

The runtime needs to support:

- TypeScript authoring with low adoption friction
- subprocess execution for CI tasks
- a path to a single executable runtime artifact
- enough type safety to make workflow and step authoring useful
- a development model that does not dominate the project before the compiler
  model is proven

## Decision

Forge will initially target Deno for the compiled step runtime.

Deno is selected because:

- `deno compile` provides a practical path to a single binary
- `Deno.Command` provides subprocess support suitable for CI step helpers
- TypeScript lowers adoption friction for many GitHub Actions users
- the TypeScript ecosystem is broad enough for an MVP
- the type system is acceptable for the initial compiler and authoring API

## Consequences

The initial Forge runtime can be authored in TypeScript and compiled into a
binary that generated workflow steps invoke with subcommands such as
`forge-runtime test` and `forge-runtime build`.

This does not require Forge to commit permanently to Deno. It establishes a
pragmatic first runtime while the project validates its more important premise:
that typed authoring can produce useful, readable, Actions-native YAML.

## Alternatives

MoonBit remains an interesting future option. It may offer advantages for a
small native toolchain or stronger compile-time guarantees as the project
matures.

MoonBit is not selected initially because the core project risk is the GitHub
Actions compiler model, not proving a newer native toolchain. Choosing Deno
keeps the MVP closer to the existing TypeScript and GitHub Actions ecosystem.
