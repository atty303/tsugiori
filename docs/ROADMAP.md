# Roadmap

This roadmap is provisional. It is intended to sequence risk, not to promise
dates.

## Phase 0: Documentation and Design

- define the project boundary
- document non-goals
- write comparison notes
- record early architectural decisions
- record the boundary between provider-native pipeline authoring and the task
  runtime
- clarify the task artifact lifecycle before detailed expression DSL design
- avoid provider backend or task runtime implementation until their design
  boundaries are clear

## Phase 1: Minimal GitHub Actions Provider Backend

Status: in progress. The internal AST, validation, deterministic emitter,
immutable typestate authoring, public authoring source loading, `generate`
command, and focused tests are implemented. A provider scope catalog records
future expression availability, but the public expression DSL remains
unimplemented. Stale-output checking is not implemented.

- define the initial GitHub Actions provider backend AST
- support workflow name, events, jobs, and basic steps
- emit deterministic GitHub Actions YAML
- keep generated YAML reviewable
- define how committed generated YAML is checked for staleness
- add focused tests around YAML emission

Acceptance criteria for Phase 1:

- the GitHub Actions provider backend AST can represent workflow name, events,
  jobs, runner selection, job dependencies, and basic provider-native steps
- basic steps in Phase 1 mean GitHub Actions `uses` and `run` steps represented
  directly in the provider backend AST
- the YAML emitter produces deterministic `.github/workflows/*.yml` output for
  that subset, with stable ordering and reviewable formatting
- generated YAML stale-check behavior is specified before implementation starts
- focused tests cover deterministic emission; stale-output detection tests are
  required with the future check-mode slice

Out of scope for Phase 1:

- task functions and the task registry
- generated task runtime invocations for task-backed provider steps
- task artifact metadata, manifest representation, and task artifact cache
  adapters
- GitHub Actions expression AST support beyond preserving literal scalar values
- `workflow_call` contracts and reusable workflow validation

## Phase 2: Task Runtime and Task-Backed Provider Steps

Status: initial vertical slice implemented. Inline task-backed steps, readable
runtime entrypoints, job-layout validation, one Deno binary artifact,
repository-local caching, generated `actions/cache` delivery, runtime-owned
manifests, and compiled-binary E2E coverage are implemented. Live validation
of the remote-cache path and handwritten workflow integration remain future
work.

- keep pipeline generation separate from the provider-owned runtime preparation
  lifecycle
- introduce a task registry for task functions
- define how task runtime entrypoint names are generated and validated
- emit normal Actions steps that invoke the task runtime for task-backed steps
- ensure generated provider configuration and task registry names stay aligned
- decide the exact task artifact key inputs and any metadata or manifest
  representation
- add explicit task artifact preparation steps before task-backed provider steps
- retain a repository-local content-addressed artifact entry
- emit generational `actions/cache` restore and save steps in the GitHub
  Actions backend
- validate the remote-cache path on a GitHub-hosted runner
- defer a common delivery abstraction until a second concrete backend such as
  an OCI registry or S3 integration requires one

## Phase 3: Expression DSL

- defer detailed expression AST design until the provider backend and task
  runtime boundaries have stabilized enough to justify durable syntax choices
- evaluate a structured GitHub Actions expression model without requiring it
  for every expression
- include an explicit raw expression escape hatch
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

## Phase 5: Task Command Execution Helpers

- provide Deno helpers for subprocess execution through `Deno.Command`
- define conventions for logging, environment access, working directories, and
  exit codes
- keep helpers thin enough that GitHub Actions remains the CI runtime authority

## Phase 6: Validation, Testing, and Dogfooding

Status: dogfooding of the implemented Phase 2 vertical slice has started before
the later expression and reusable-workflow phases. This intentionally validates
the current bootstrap, artifact preparation, and task dispatch boundaries on a
GitHub-hosted runner before expanding the workflow surface. The initial
`ubuntu-24.04` push and pull request runs completed successfully.

- extend validation to the provider-native structures added after the Phase 1
  subset
- extend snapshot or golden coverage as expressions, generation commands, and
  other provider-native structures are added
- add tests for expression emission
- dogfood the current vertical slice in this repository while keeping later
  workflow syntax out of the initial CI
- document migration and failure modes discovered through use

## Later: Additional CI Provider Backends

- evaluate another provider backend, such as GitLab CI, only after the
  GitHub Actions provider backend and task runtime integration are proven
- reuse task functions, the task registry, and task artifacts where they fit;
  extract delivery abstractions only from concrete provider implementations
- add provider-native DSL, validation, expression handling, and emitters
  instead of forcing new providers through GitHub Actions concepts or a
  provider-neutral pipeline model
- preserve native job and step visibility for the selected CI provider
