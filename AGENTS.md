# AGENTS.md

## Repository State

The project has an initial Phase 2 vertical slice. The repository contains a
public minimal GitHub Actions authoring API, source loading, deterministic YAML
generation, inline task lowering, a compiled Deno task runtime, a
repository-local artifact cache, generated `actions/cache` delivery steps, and
compiled-binary E2E coverage. It does not contain native stale-output check
mode, a public expression DSL, or a second artifact delivery backend. The repository CI is authored in `.github/tsugiori.ts`, emitted to
`.github/workflows/ci.yml`, and uses generation followed by `git diff` as its
initial stale-output guard.

Do not add later-phase runtime code, generated GitHub workflows, or CI
configuration unless the user explicitly asks for that implementation work.

## Project Direction

Tsugiori is a proposed CI pipeline authoring tool and task runtime.
Its first CI provider target is GitHub Actions.

Preserve these constraints in every change:

- The GitHub Actions provider backend compiles to standard
  `.github/workflows/*.yml`.
- GitHub Actions remains the orchestration and execution platform for the
  GitHub Actions provider backend.
- Jobs and steps must remain visible as normal GitHub Actions concepts in the
  GitHub Actions provider backend.
- The project should not define a provider-neutral pipeline model that erases
  provider-native concepts.
- Use `pipeline` as the general CI definition term, while preserving
  GitHub Actions `workflow`, `job`, and `step` as provider-native terms.
- The implemented task preparation lifecycle is owned by the GitHub Actions
  provider backend. Handwritten workflow integration remains a future
  provider-specific decision rather than a shared prepare-command contract.
- Task function bodies should not be inlined into generated CI configuration.
- In the GitHub Actions provider backend, a task-backed provider step should
  compile to a normal Actions step that invokes the task runtime with a
  distinct entrypoint.
- Generated GitHub Actions workflow YAML is intended to be committed to the
  repository, with local hooks as a convenience and CI checks as the durable
  stale-output guard.
- The task artifact is content-addressed. The GitHub Actions provider backend
  restores and saves it through visible `actions/cache` steps; common delivery
  abstractions should be extracted only after another backend requires them.
- The project must not become a Dagger/Earthly-style opaque external CI runtime where
  the selected CI provider only calls one command.
- Future provider backends such as GitLab CI should be explicit provider-native
  modules and compiler layers, not a lowest-common-denominator API that erases
  each CI provider's native concepts.

## Context Map

Read the smallest relevant set before editing:

- `README.md`: project summary, status, and illustrative examples
- `docs/CONCEPT.md`: core product concept and boundary
- `docs/ARCHITECTURE.md`: proposed components and compile-time/runtime-time
  distinction
- `docs/NON_GOALS.md`: boundaries that should not drift
- `docs/COMPARISONS.md`: conceptual comparisons with adjacent tools
- `docs/GLOSSARY.md`: current design vocabulary for pipelines, providers,
  tasks, and artifacts
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

## Implementation Rules

- Follow the phase order in `docs/ROADMAP.md` unless the user explicitly
  changes it.
- Start with the smallest GitHub Actions provider backend AST and YAML emitter
  slice that can be tested.
- Keep GitHub runtime expressions distinct from host-language conditionals.
  Compiler-owned generated steps may emit raw expressions. A future public
  expression DSL should include an explicit escape hatch rather than requiring
  every expression to use an AST.
- Add tests for compiler output, expression emission, and validation behavior
  as those capabilities are implemented.

## Verification

Use the repository-managed toolchain and standard task entrypoints:

```bash
mise install
```

```bash
mise run check
```

```bash
mise run fix
```

```bash
mise run test
```

`mise run check` and `mise run fix` accept optional file paths. Use
`mise exec -- deno task test:update` only when intentionally updating committed
snapshots, and review the snapshot diff before committing it.

## Codex Working Expectations

- Make focused, reviewable changes.
- Read existing documents before inventing new structure.
- Work with existing user changes; do not revert unrelated edits.
- If a task is architectural, record the decision or explain why an ADR is not
  needed.
- If the same guidance becomes useful repeatedly, update this file so future
  Codex sessions inherit it.
