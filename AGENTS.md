# AGENTS.md

## Project boundary

Tsugiori authors CI definitions for a selected provider. Its implemented
provider backend is GitHub Actions. Preserve these constraints in changes:

- Compile to standard `.github/workflows/*.yml`; GitHub Actions owns
  orchestration and execution.
- Keep provider-native jobs and steps visible. Task-backed steps invoke the
  compiled task runtime through distinct normal Actions steps; task bodies stay
  out of generated YAML.
- Use provider-native authoring terms: `workflow`, `job`, and `step` for GitHub
  Actions. Preserve each provider's native concepts; do not introduce a
  provider-neutral CI model or one opaque command that hides the job graph.
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

## DSL type design

- Keep inferred LSP type displays compact when consumers omit type annotations.
  Do not expect consumers to understand behavior by decoding type names.
- Give principal public types appropriate names. Prefer short names meaningful
  within Tsugiori for intermediate states and helper types.
- Choose aliases, interfaces, grouped type parameters and flat reference maps
  while preserving inference, completion, state-specific operations, readonly
  information, scenario types and runtime contracts.
- Verify representative DSL code through actual LSP hover and signature displays.
  Adding an alias alone does not demonstrate shorter inferred displays, and
  compiler truncation does not count as an improvement.
- Preserve type information and complete public JSDoc when shortening displays.
  These criteria do not independently authorize public API compatibility changes.

## Public API documentation

- Treat JSDoc as the detailed JSR public documentation. Every API reachable from
  deno.json exports, including functions, methods, types and properties, must
  have JSDoc; add or update it in the same change as a new or changed API.
- Explain how consumers use the API without decoding complex types:
  prerequisites, immutable state order, callback context and return value,
  evaluation timing, contracts, defaults, effects, errors and validation limits
  where relevant.
- Functions and methods require local call examples. Properties accepting
  callbacks or expressions require setting examples. Simple literal properties
  need accurate descriptions, not mandatory examples. State setup prerequisites
  in prose and links instead of making each example independently executable.
- Center GitHub DSL docs on Tsugiori usage. Distinguish host authoring
  callbacks, GitHub runtime expressions/settings and task/scenario contracts;
  retain fixed GitHub specification sources, relevant semantics and attribution.
- Collect shared concepts in module or owning API docs and link related APIs so
  the JSR documentation is coherent. README owns getting started and navigation;
  API docs own detailed usage/specification. Do not optimize for short IDE
  hovers at the expense of public documentation completeness.
- Write the README for developers who are unfamiliar with Tsugiori and
  interested in evaluating it. Prioritize what they can author, what Tsugiori
  generates, and how to try it. Keep complete examples when their overall
  structure helps understanding; brevity alone is not the goal. Do not turn
  Getting started into a GitHub Actions or Deno specification guide or an
  exhaustive Tsugiori API reference.
- Typecheck the actual published TypeScript code blocks, supplying prerequisites
  only in the verification harness. Do not verify separate copied examples or
  disable type checking to accommodate documentation.

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
