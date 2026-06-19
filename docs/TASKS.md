# AI Work Queue

This file keeps future Codex tasks small and reviewable. It is not a commitment
to implement every item.

## Current Phase

Phase 0: documentation and design.

Do not start runtime implementation until the user explicitly asks for it.

## Ready Documentation Tasks

- [ ] Review terminology across docs and settle on consistent names for the
  authoring API, core workflow model, backend workflow AST, expression AST,
  step registry, runtime binary, runtime artifact manifest, and runtime cache
  adapter.
- [ ] Expand `docs/COMPARISONS.md` only where conceptual differences are still
  ambiguous.
- [ ] Add an ADR for the expression AST once the expression model is specific
  enough to choose durable syntax and validation boundaries.
- [ ] Define the exact stale generated YAML check behavior without adding CI
  configuration.
- [ ] Define acceptance criteria for Phase 1 without creating implementation
  files.
- [ ] Draft a future repository layout proposal for source, tests, examples,
  and generated fixtures.

## Future Phase 1 Candidate Tasks

These are intentionally blocked until implementation starts.

- [ ] Create the minimal project manifest only after the runtime/toolchain
  command strategy is selected.
- [ ] Add the smallest core workflow model and GitHub Actions backend AST
  representation.
- [ ] Add deterministic YAML emission for workflow name, events, one job, and
  basic steps.
- [ ] Add golden tests for generated YAML.
- [ ] Document the first real build/test commands in `AGENTS.md`.

## Future Phase 2 Candidate Tasks

- [ ] Design the step registry API.
- [ ] Decide how runtime subcommand names are generated and validated.
- [ ] Emit `forge-runtime <subcommand>` for registered logical steps.
- [ ] Add validation that every generated runtime invocation has a registered
  entrypoint.
- [ ] Design the runtime artifact manifest and content-addressed key inputs.
- [ ] Design the runtime cache adapter interface.
- [ ] Specify how cache miss builds populate the selected runtime artifact
  store.

## Future Phase 3 Candidate Tasks

- [ ] Draft the expression AST data model.
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
