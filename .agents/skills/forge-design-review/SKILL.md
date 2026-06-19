---
name: forge-design-review
description: Review or plan Forge changes against the GitHub Actions-native provider backend direction, task runtime boundary, non-goals, architecture, roadmap, and ADRs. Use when modifying Forge design docs, implementing compiler/runtime pieces, or reviewing a Forge diff.
---

# Forge Design Review

Use this skill to keep Forge changes aligned with the intended project
boundary.

## Context to Read

Read only the relevant subset:

- `AGENTS.md`
- `README.md`
- `docs/CONCEPT.md`
- `docs/ARCHITECTURE.md`
- `docs/NON_GOALS.md`
- `docs/ROADMAP.md`
- relevant files in `docs/DECISIONS/`
- files touched by the task

## Review Checks

Check for these issues:

- The change implies Forge replaces GitHub Actions as the execution platform.
- The change introduces a provider-neutral pipeline model that erases
  provider-native concepts.
- The change hides all work inside one opaque GitHub Actions step.
- The change treats GitHub runtime concepts such as `if`, `matrix`, `needs`,
  `secrets`, or outputs as host-language runtime values.
- The change claims an API, compiler, runtime, package, or CI behavior exists
  before implementation has been added.
- The change makes task functions require pipeline generation, or makes
  pipeline generation require task functions.
- The change skips ADR updates for durable architectural decisions.
- The change adds dependencies, manifests, source files, generated workflows, or
  CI while the task is documentation-only.

## Output Style

For reviews, lead with findings ordered by severity and include file
references.

For planning, produce a small sequence of implementation or documentation
slices, each with verification steps.

If no issues are found, say so clearly and mention any residual risk.
