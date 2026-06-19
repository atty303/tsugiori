# 0004: Core Model and CI Backends

## Status

Accepted as initial direction.

## Context

Forge starts with GitHub Actions, but some of its proposed concepts are not
inherently GitHub-specific. A workflow has jobs, jobs have dependencies, logical
steps can dispatch to implementation entrypoints, and those entrypoints can run
through a prepared binary artifact. A future GitLab CI backend could plausibly
reuse parts of that model.

At the same time, CI providers differ in important ways. GitHub Actions events,
`workflow_call`, `uses` steps, permissions, expression syntax, and file layout
are not the same as GitLab CI stages, `rules`, variables, cache behavior,
artifacts, and `.gitlab-ci.yml` structure.

The design needs to leave room for reuse without pretending every provider has
the same workflow semantics.

## Decision

Forge will keep a reusable core model underneath explicit CI backend layers.

The core model should be limited to concepts expected to survive across
backends:

- workflow identity
- jobs and job dependencies
- logical steps that reference registered runtime subcommands
- runtime artifact manifests
- cache adapter contracts for prepared runtime binaries

CI-specific layers own provider semantics. A backend should define its own DSL
entrypoints, workflow AST, validation rules, expression model, file layout,
runtime preparation shape, and emitter.

The initial backend remains GitHub Actions. It must continue to emit standard
`.github/workflows/*.yml`, preserve visible Actions jobs and steps, keep Actions
as the orchestration platform, and invoke the compiled runtime binary through
normal Actions steps with distinct subcommands.

A future GitLab CI backend should emit GitLab-native configuration and preserve
GitLab-native job visibility. It should reuse the core only where the concepts
fit naturally.

Users should choose the backend they are authoring for. Forge should not
promise transparent portability between CI providers.

## Consequences

Forge can avoid baking GitHub Actions into the runtime artifact and logical
step model more deeply than necessary.

The GitHub Actions backend can still model GitHub Actions precisely rather than
being constrained by a lowest-common-denominator CI API.

Future backend support becomes an additive compiler target rather than a
rewrite of the runtime dispatch model.

The architecture has an extra boundary to maintain. Implementation work needs
to keep the core small and move provider-specific concepts into backend
packages or modules when those packages exist.

## Trade-Offs

Forge will not start with a single provider-neutral workflow DSL. That makes
authoring less portable on day one, but it avoids erasing important provider
semantics.

Forge will not implement GitLab CI in the initial phases. Deferring it keeps
the first milestone focused on proving the GitHub Actions compiler and runtime
artifact model before expanding the design surface.
