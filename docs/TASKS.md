# AI Work Queue

This file keeps future Codex tasks small and reviewable. It is not a commitment
to implement every item.

## Current Phase

Phase 2: initial task runtime integration.

The minimal provider backend, public authoring subset, source loading,
generation command, inline task lowering, local artifact preparation, and task
dispatch are implemented. Generated `actions/cache` delivery is implemented;
the public authoring subset uses immutable typestate facades and has an internal
GitHub expression scope catalog and stale-output check mode. Live remote-cache
validation remains incomplete.

## Ready Documentation Tasks

- [x] Review terminology across docs and settle on consistent names for the
  pipeline authoring API, provider backend AST, expression model, task function,
  task registry, task runtime, task artifact metadata or manifest, and task
  artifact delivery.
- [x] Expand `docs/COMPARISONS.md` only where conceptual differences are still
  ambiguous.
- [x] Clarify the initial task artifact lifecycle before implementation,
  including command boundaries, cache restore and population, and manifest
  ownership.
- [x] Define the exact stale generated YAML check behavior without adding CI
  configuration.
- [x] Define acceptance criteria for Phase 1 without creating implementation
  files.
- [x] Draft a future repository layout proposal for source, tests, examples,
  and generated fixtures.

## Phase 1 Tasks

- [x] Create the minimal project manifest after the provider backend and
  task runtime toolchain command strategy is selected.
- [x] Add the smallest GitHub Actions provider backend AST
  representation.
- [x] Add deterministic YAML emission for workflow name, events, jobs, and
  basic steps.
- [x] Add snapshot tests for generated YAML and focused validation tests.
- [x] Document the first real check/fix/test commands in `AGENTS.md`.
- [x] Add pipeline source loading and `generate` only after its input contract
  is selected.
- [x] Add stale-output checking and focused missing, extra, and changed output
  tests as the remaining generation check-mode slice.

## Phase 2 Tasks

- [x] Design the inline task registry API.
- [x] Decide how task runtime entrypoint names are generated and validated.
- [x] Emit task runtime invocations for task-backed provider steps.
- [x] Add validation that every generated task runtime invocation has a
  registered task entrypoint.
- [x] Design the task artifact metadata or manifest representation and
  content-addressed key inputs.
- [x] Exercise the initial artifact storage boundary with a repository-local
  cache.
- [x] Specify how cache miss builds populate the selected task artifact
  store.
- [ ] Decide whether handwritten workflow integration needs a provider-specific
  public interface.
- [ ] Replace the initial all-permissions task artifact with an explicit
  permission contract.
- [x] Add generated `actions/cache` restore and save steps with immutable cache
  recovery generations.
- [ ] Validate the `actions/cache` path on a GitHub-hosted runner.
- [ ] Define Windows task artifact invocation before emitting task-backed
  steps for Windows runners.

## Dogfooding Tasks

- [x] Validate the generated repository workflow on a GitHub-hosted
  `ubuntu-24.04` runner, including source bootstrap, a cold task artifact build,
  and task dispatch through `mise run test`.
- [x] Replace the temporary generate-and-diff stale guard after native
  stale-output check mode is implemented.

## Future Phase 3 Candidate Tasks

- [ ] Draft a structured expression model after the provider backend and task
  runtime boundaries have been exercised enough to justify detailed syntax and
  validation choices.
- [ ] Define the public raw expression escape hatch together with any
  structured expression API.
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
