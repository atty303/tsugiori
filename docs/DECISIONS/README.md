# Decision Records

This directory contains architectural decision records for Forge.

Use ADRs for durable decisions that shape future implementation or constrain
the project direction. Do not use ADRs for routine wording changes.

## Index

- `0001-project-direction.md`: Forge targets GitHub Actions-native YAML
  generation rather than replacing the CI execution platform.
- `0002-deno-as-initial-runtime.md`: Deno is the initial runtime choice for the
  task runtime.
- `0003-generated-workflows-and-task-artifacts.md`: generated workflow YAML
  is committed, while task artifacts are content-addressed artifacts delivered
  through cache adapters.
- `0004-pipelines-providers-and-task-runtime.md`: Forge uses provider-native
  pipeline authoring and keeps the task runtime independently usable.

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
