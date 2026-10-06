---
name: design-review
description: Review or plan changes against Tsugiori's current GitHub Actions architecture, task runtime boundary, and future roadmap. Use when modifying design docs, implementing compiler/runtime pieces, or reviewing a repository diff.
---

# Design Review

Use this skill to keep changes aligned with the project boundary.

## Context to read

Read only the relevant subset:

- `AGENTS.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- files touched by the task

## Review checks

Check for these issues:

- The change implies Tsugiori replaces GitHub Actions as the execution platform.
- The change introduces a provider-neutral CI model that erases native
  provider concepts or hides work inside one opaque Actions step.
- The change uses generic authoring terms instead of the selected provider's
  native terms (`workflow`, `job`, and `step` for GitHub Actions).
- The change treats GitHub runtime values such as `matrix`, `needs`, and
  `secrets` as host-language values during generation.
- The change claims an API or behavior exists before code and tests support it.
- The change treats the current inline task registration as a universal
  task-runtime contract or makes workflow generation require task steps.
- The change leaves live documentation or the roadmap inconsistent with the
  implementation or the new design boundary.
- The change adds dependencies, manifests, source files, generated workflows,
  or CI while the task is documentation-only.

## Output style

For reviews, lead with findings ordered by severity and include file
references. For planning, provide a small sequence of changes with
verification. If no issues are found, say so and mention any residual risk.
