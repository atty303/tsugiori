# Roadmap

This roadmap is provisional. It is intended to sequence risk, not to promise
dates.

## Phase 0: Documentation and Design

- define the project boundary
- document non-goals
- write comparison notes
- record early architectural decisions
- record the boundary between reusable core concepts and CI-specific backend
  layers
- avoid runtime implementation until the compiler shape is clear

## Phase 1: Minimal AST and YAML Emitter

- define a small core workflow model
- define the initial GitHub Actions backend AST
- support workflow name, events, jobs, and basic steps
- emit deterministic GitHub Actions YAML
- keep generated YAML reviewable
- define how committed generated YAML is checked for staleness
- add focused tests around YAML emission when implementation begins

Acceptance criteria for Phase 1:

- the core workflow model is limited to workflow identity, jobs, job
  dependencies, and the minimal backend handoff needed by the GitHub Actions
  emitter
- the GitHub Actions backend AST can represent workflow name, events, jobs,
  runner selection, job dependencies, and basic provider-native steps
- basic steps in Phase 1 mean GitHub Actions `uses` and `run` steps represented
  directly in the backend AST
- the YAML emitter produces deterministic `.github/workflows/*.yml` output for
  that subset, with stable ordering and reviewable formatting
- generated YAML stale-check behavior is specified before implementation starts
- focused tests are planned for deterministic emission and stale-output
  detection when implementation begins

Out of scope for Phase 1:

- the Forge step registry
- generated `forge-runtime <subcommand>` invocations for logical Forge steps
- runtime artifact manifests and runtime cache adapters
- GitHub Actions expression AST support beyond preserving literal scalar values
- `workflow_call` contracts and reusable workflow validation

## Phase 2: Step Registry and Generated Runtime Invocation

- introduce a registry for logical step entrypoints
- emit normal Actions steps that call `forge-runtime <subcommand>`
- ensure generated YAML and runtime dispatch names stay aligned
- decide the runtime artifact key and manifest shape
- add explicit runtime preparation steps before logical Forge steps
- define the initial runtime cache adapter, likely starting with
  `actions/cache`
- keep later adapters such as OCI registries and S3 behind the same artifact
  contract

## Phase 3: Expression DSL

- model GitHub Actions expressions as an expression AST
- support contexts such as `github`, `matrix`, `needs`, `inputs`, `secrets`,
  and `steps`
- emit `${{ ... }}` syntax safely
- distinguish compile-time host control flow from GitHub runtime `if:`

## Phase 4: `workflow_call` Contracts

- model reusable workflow inputs
- model reusable workflow secrets
- model outputs
- validate caller and callee contracts where practical
- emit native `workflow_call` YAML

## Phase 5: Runtime Command Execution Helpers

- provide Deno helpers for subprocess execution through `Deno.Command`
- define conventions for logging, environment access, working directories, and
  exit codes
- keep helpers thin enough that GitHub Actions remains the runtime authority

## Phase 6: Validation, Testing, and Dogfooding

- validate workflow structure before emission
- add snapshot or golden tests for generated YAML
- add tests for expression emission
- dogfood Forge on its own repository only after the generated workflow shape is
  stable
- document migration and failure modes discovered through use

## Later: Additional CI Backends

- evaluate another backend, such as GitLab CI, only after the GitHub Actions
  backend proves the core compiler and runtime artifact model
- reuse the core workflow model, step registry, runtime artifact manifest, and
  cache adapter contract where they fit
- add backend-specific DSL, validation, expression handling, and emitters
  instead of forcing new providers through GitHub Actions concepts
- preserve native job and step visibility for the selected CI provider
