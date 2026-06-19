# Roadmap

This roadmap is provisional. It is intended to sequence risk, not to promise
dates.

## Phase 0: Documentation and Design

- define the project boundary
- document non-goals
- write comparison notes
- record early architectural decisions
- avoid runtime implementation until the compiler shape is clear

## Phase 1: Minimal AST and YAML Emitter

- define a small workflow AST
- support workflow name, events, jobs, and basic steps
- emit deterministic GitHub Actions YAML
- keep generated YAML reviewable
- define how committed generated YAML is checked for staleness
- add focused tests around YAML emission when implementation begins

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
