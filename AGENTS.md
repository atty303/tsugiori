# AGENTS.md

## Project boundary

Tsugiori authors CI definitions for a selected provider. Its implemented
provider backend is GitHub Actions. Preserve these constraints in changes:

- Compile to standard `.github/workflows/*.yml`; GitHub Actions owns
  orchestration and execution.
- Keep provider-native jobs and steps visible. Task-backed steps invoke the
  compiled task runtime through distinct normal Actions steps; task bodies
  stay out of generated YAML.
- Use provider-native authoring terms: `workflow`, `job`, and `step` for
  GitHub Actions. Preserve each provider's native concepts; do not introduce
  a provider-neutral CI model or one opaque command that hides the job graph.
- Commit generated workflow YAML and use `generate --check` as the CI stale
  output guard. Local hooks are a convenience.
- Keep the implemented task preparation lifecycle owned by the GitHub Actions
  backend. Its internal commands are not a public contract for handwritten
  workflows.
- Keep `cacheVersion` in task artifact identity for changes outside the
  automatically tracked source graph. Delivery remains visible through
  `actions/cache`; extract common delivery interfaces only when a concrete
  second backend needs them.
- Do not add a hosted CI control plane, scheduler, runner platform, or workflow
  marketplace under the GitHub Actions backend.

## Context

Read the smallest relevant set before editing:

- `README.md`: current usage and supported surface
- `docs/ARCHITECTURE.md`: current implementation and design boundaries
- `docs/ROADMAP.md`: unfinished follow-ups and future candidates
- `.agents/skills/design-review/SKILL.md`: repository design review checks

The current tree keeps live documentation and unfinished plans. Update those
files directly when behavior or direction changes; use Git history for old
versions and superseded decisions. Do not add historical decision records.

## Implementation

- Make focused changes and preserve unrelated user edits.
- Do not add future runtime code, generated workflows, or CI configuration
  unless the user explicitly requests that implementation work.
- Keep host-language conditions distinct from GitHub runtime expressions.
- Add focused compiler, expression, and validation tests when changing those
  capabilities.

## Verification

Use the repository-managed toolchain and standard task entrypoints:

```sh
mise install
```

```sh
mise run check
```

```sh
mise run fix
```

```sh
mise run test
```

`mise run check` and `mise run fix` accept optional file paths. Use
`mise exec -- deno task test:update` only when intentionally updating committed
snapshots, and review the snapshot diff before committing it.
