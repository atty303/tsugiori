# AGENTS.md

## Repository State

Forge is currently in design phase.

Do not add runtime code, source directories, package manifests, dependency
files, generated GitHub workflows, or CI configuration unless the user
explicitly asks for implementation work.

## Project Direction

Forge is a proposed CI workflow compiler and typed runtime authoring tool.
Its first compiler target is GitHub Actions.

Preserve these constraints in every change:

- The GitHub Actions backend compiles to standard `.github/workflows/*.yml`.
- GitHub Actions remains the orchestration and execution platform for the
  GitHub Actions backend.
- Jobs and steps must remain visible as normal GitHub Actions concepts in the
  GitHub Actions backend.
- Step bodies should not be inlined into generated CI configuration.
- In the GitHub Actions backend, each logical Forge step should compile to a
  normal Actions step that invokes a compiled Deno runtime binary with a
  distinct subcommand.
- Generated GitHub Actions workflow YAML is intended to be committed to the
  repository, with local hooks as a convenience and CI checks as the durable
  stale-output guard.
- The compiled runtime binary is intended to be a content-addressed artifact
  that can be restored or populated through a pluggable cache adapter.
- Forge must not become a Dagger/Earthly-style opaque external CI runtime where
  the selected CI provider only calls one command.
- Keep reusable core concepts separate from CI-specific DSL and compiler
  layers. Future backends such as GitLab CI should be explicit backend layers
  over the core model, not a lowest-common-denominator API that erases each CI
  provider's native workflow concepts.

## Context Map

Read the smallest relevant set before editing:

- `README.md`: project summary, status, and illustrative examples
- `docs/CONCEPT.md`: core product concept and boundary
- `docs/ARCHITECTURE.md`: proposed components and compile-time/runtime-time
  distinction
- `docs/NON_GOALS.md`: boundaries that should not drift
- `docs/COMPARISONS.md`: conceptual comparisons with adjacent tools
- `docs/ROADMAP.md`: implementation sequence and risk ordering
- `docs/EXAMPLE.md`: illustrative authoring and generated YAML shape
- `docs/REPOSITORY_LAYOUT.md`: proposed future source, package, test,
  fixture, and example layout
- `docs/DECISIONS/`: accepted architectural decisions
- `docs/CODEX_WORKFLOW.md`: how to run Codex-driven work in this repository
- `docs/TASKS.md`: current AI-friendly work queue
- `docs/PROMPTS.md`: reusable prompts for planning, implementation, and review

## Documentation Rules

- Use precise, sober language.
- Avoid hype and marketing claims.
- Do not claim implementation exists unless code has actually been added.
- Prefer "intended", "proposed", "initial direction", and "illustrative" for
  unimplemented behavior.
- Update or add an ADR when changing a durable architectural decision.
- Keep comparisons conceptual, not promotional.

## Future Implementation Rules

When implementation begins:

- Follow the phase order in `docs/ROADMAP.md` unless the user explicitly
  changes it.
- Start with the smallest core model, GitHub Actions AST, and YAML emitter
  slice that can be tested.
- Keep GitHub Actions expressions as an expression AST; do not model GitHub
  runtime `if:` with host-language conditionals.
- Add tests for compiler output, expression emission, and validation behavior.
- Update this file with real build, test, lint, and format commands once they
  exist.

## Verification

Current repository verification is documentation-only:

```bash
find . -maxdepth 4 -type f | sort
```

Before finishing a documentation change, confirm that no implementation files
or dependency manifests were added unintentionally.

When code is introduced, replace this section with the actual commands required
to validate the project.

## Codex Working Expectations

- Make focused, reviewable changes.
- Read existing documents before inventing new structure.
- Work with existing user changes; do not revert unrelated edits.
- If a task is architectural, record the decision or explain why an ADR is not
  needed.
- If the same guidance becomes useful repeatedly, update this file so future
  Codex sessions inherit it.
