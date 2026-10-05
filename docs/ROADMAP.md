# Roadmap

This file contains unfinished work. It gives an order for evaluating risk,
not release dates or a commitment to implement every candidate. Current
behavior is documented in the [README](../README.md) and
[architecture](ARCHITECTURE.md).

## Known follow-ups

- Replace the task artifact's current Deno `-A` compilation with an explicit
  permission contract before claiming narrower task permissions.
- Define and verify a Windows invocation contract before emitting task-backed
  steps for Windows runners.
- Decide whether handwritten GitHub Actions workflows need a provider-specific
  public task-runtime interface. The generated preparation commands do not
  currently serve as that interface.
- Extend validation and tests when new provider-native fields or expression
  forms are added. Preserve a readable, reviewable generated workflow.

- Before deploying the type service, verify Cloudflare runtime behavior and
  public GitHub API rate limits/authentication with the authorized deployment
  environment; no public endpoint is currently provided.

## Future candidates

### Task execution

- Consider thin Deno `Deno.Command` helpers for logging, environment access,
  working directories, and exit status when concrete task use calls for them.
- Revisit standalone task registration only if a provider-specific handwritten
  workflow integration needs it.

### Type service resources

- Evaluate external reusable workflow contracts under `/github/workflows/`
  when requested. Share hosting, ref retrieval, and caching with actions;
  workflow generation is not currently implemented.

### Further dogfooding and providers

- Apply the scenario DSL to glaze-ops after its commit-pinned Tsugiori source
  includes the testing API. Keep its task unit tests alongside pipeline logic
  scenarios and verify generated workflow changes from explicit step IDs.
- Exercise typed task I/O across a real consumer's detect, matrix, deploy, and
  completion jobs. Local compiler and runner tests cover the contract, but an
  Actions run is still needed to verify the generated environment transport.
- Evaluate another provider, such as GitLab CI, after the GitHub Actions
  integration is proven. Its module, authoring API, validation, expressions,
  emitter, and artifact delivery must preserve that provider's native
  concepts. Extract shared delivery contracts only from concrete backends;
  do not introduce a provider-neutral pipeline model that erases their jobs
  and steps.
