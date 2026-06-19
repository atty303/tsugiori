# AI Work Queue

This file keeps future Codex tasks small and reviewable. It is not a commitment
to implement every item.

## Current Phase

Phase 0: documentation and design.

Do not start task runtime or provider backend implementation until the user
explicitly asks for it.

## Ready Documentation Tasks

- [x] Review terminology across docs and settle on consistent names for the
  pipeline authoring API, provider backend AST, expression AST, task function,
  task registry, task runtime, task artifact manifest, and task artifact cache
  adapter.
- [x] Expand `docs/COMPARISONS.md` only where conceptual differences are still
  ambiguous.
- [ ] Clarify the task artifact lifecycle before implementation, including
  command boundaries, cache restore and population, manifest ownership, and how
  task runtime-only usage works without pipeline generation.
- [x] Define the exact stale generated YAML check behavior without adding CI
  configuration.
- [x] Define acceptance criteria for Phase 1 without creating implementation
  files.
- [x] Draft a future repository layout proposal for source, tests, examples,
  and generated fixtures.

## Future Phase 1 Candidate Tasks

These are intentionally blocked until implementation starts.

- [ ] Create the minimal project manifest only after the provider backend and
  task runtime toolchain command strategy is selected.
- [ ] Add the smallest GitHub Actions provider backend AST
  representation.
- [ ] Add deterministic YAML emission for workflow name, events, one job, and
  basic steps.
- [ ] Add golden tests for generated YAML.
- [ ] Document the first real build/test commands in `AGENTS.md`.

## Future Phase 2 Candidate Tasks

- [ ] Design the task registry API.
- [ ] Decide how task runtime entrypoint names are generated and validated.
- [ ] Emit task runtime invocations for task-backed provider steps.
- [ ] Add validation that every generated task runtime invocation has a
  registered task entrypoint.
- [ ] Design the task artifact manifest and content-addressed key inputs.
- [ ] Design the task artifact cache adapter interface.
- [ ] Specify how cache miss builds populate the selected task artifact
  store.

## Future Phase 3 Candidate Tasks

- [ ] Draft the expression AST data model after the provider backend and task
  runtime boundaries have been exercised enough to justify detailed syntax and
  validation choices.
- [ ] Add an ADR for the expression AST once the expression model is specific
  enough to choose durable syntax and validation boundaries.
- [ ] Add expression emission for contexts, literals, function calls, equality,
  boolean operators, and property access.
- [ ] Add tests showing the difference between host-language `if` and GitHub
  Actions `if:`.

## Backlog Hygiene

When Codex completes a task:

- mark only completed items
- add newly discovered follow-up tasks under the appropriate phase
- avoid turning speculative ideas into committed roadmap items without user
  confirmation
