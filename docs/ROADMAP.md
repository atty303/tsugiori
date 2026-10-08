# Roadmap

This file contains unfinished work. It gives an order for evaluating risk, not
release dates or a commitment to implement every candidate. Current behavior is
documented in the [README](../README.md) and [architecture](ARCHITECTURE.md).

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

- Verify effective Cloudflare account permissions and public GitHub API rate
  limits in the deployed type-service environment; local workerd and dry-run
  checks do not establish those operational limits.

## Remaining GitHub specification work

The frozen [coverage inventory](../src/github_actions/github_spec.json) records
`assessment` separately from status. Trigger declarations, payload typing,
activity guards and fixture-based filtering are implemented and verified; the
next feature groups are:

- Add snapshot/cache-mode and the native background/parallel step family where
  applicable to the frozen GitHub.com basis.
- Complete context fields and native expression interpretation currently
  requiring explicit scenario overrides; enforce the reusable unique-workflow
  limit where local graphs allow it.

YAML anchors/aliases are represented by TypeScript reuse. Workflow templates,
template metadata, distribution and marketplace are outside this product.
Reference headings and availability catalog rows are not additional unsupported
features. GitHub owns event delivery, branch eligibility, webhook recursion
suppression, release draft suppression, access, effective permissions,
scheduling and runner behavior; these remain execution boundaries rather than
requests to add a local CI platform.

## Future candidates

### Task execution

- Consider thin Deno `Deno.Command` helpers for logging, environment access,
  working directories, and exit status when concrete task use calls for them.
- Revisit standalone task registration only if a provider-specific handwritten
  workflow integration needs it.

### Action authoring

- Verify generated task composites on GitHub runners, including nested calls,
  repeated invocation and cache post-action behavior. Local relocation and
  runtime tests do not establish hosted runner behavior.
- Consider JavaScript or Docker authoring only when concrete consumers need it;
  retain execution-independent metadata contracts and kind-specific execution.
- Evaluate explicit runtime-resource distribution when module-graph-only
  packaging is insufficient for an Action.

### Type service resources

- Evaluate external reusable workflow contracts under `/github/workflows/` when
  requested. Share hosting, ref retrieval, and caching with actions; workflow
  generation is not currently implemented.

### Further dogfooding and providers

- Apply the scenario DSL to glaze-ops after its commit-pinned Tsugiori source
  includes the testing API. Keep its task unit tests alongside workflow logic
  scenarios and verify generated workflow changes from explicit step IDs.
- Exercise typed task I/O across a real consumer's detect, matrix, deploy, and
  completion jobs. Local compiler and runner tests cover the contract, but an
  Actions run is still needed to verify the generated environment transport.
- Evaluate another provider, such as GitLab CI, after the GitHub Actions
  integration is proven. Its module, authoring API, validation, expressions,
  emitter, and artifact delivery must preserve that provider's native concepts.
  Extract shared delivery contracts only from concrete backends; do not
  introduce a provider-neutral pipeline model that erases their jobs and steps.
