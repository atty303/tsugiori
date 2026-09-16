# Decision Records

This directory contains architectural decision records.

Use ADRs for durable decisions that shape future implementation or constrain
the project direction. Do not use ADRs for routine wording changes.

## Index

- `0001-project-direction.md`: the first provider backend targets GitHub
  Actions-native YAML generation rather than replacing the CI execution
  platform.
- `0002-deno-as-initial-runtime.md`: Deno is the initial runtime choice for the
  task runtime.
- `0003-generated-workflows-and-task-artifacts.md`: generated workflow YAML
  is committed, while task artifacts are content-addressed artifacts delivered
  through cache adapters.
- `0004-pipelines-providers-and-task-runtime.md`: the project uses provider-native
  pipeline authoring and keeps the task runtime independently usable.
- `0005-task-artifact-lifecycle.md`: pipeline generation and task artifact
  preparation are separate responsibilities, task-owned artifact metadata is
  not required to be a separate manifest artifact, and cache misses build and
  populate the selected adapter.
- `0006-inline-task-runtime-slice.md`: inline task-backed steps lower to visible
  provider steps, use job-layout fingerprints, and execute through one
  content-addressed Deno binary with a repository-local cache adapter.
- `0007-debug-diagnostics.md`: structured diagnostics are emitted as one JSON
  line to standard error only when the GitHub Actions runner debug mode is
  enabled; diagnostic files are not retained.

## Format

New ADRs should use this structure:

```md
# 0000: Title

## Status

Proposed, accepted, superseded, or rejected.

## Context

What problem or decision pressure exists?

## Decision

What direction is chosen?

## Consequences

What becomes easier, harder, or constrained?

## Trade-Offs

What alternatives were considered and why were they not selected?
```

Prefer short ADRs. Link to longer design documents when needed.
