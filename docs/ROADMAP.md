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

## Future candidates

### GitHub Actions expressions

- Design a structured expression API for supported contexts, literals,
  property access, function calls, comparisons, and boolean operators.
- Preserve an explicit raw-expression escape hatch. Keep GitHub runtime
  evaluation distinct from host-language conditions and test their different
  effects on generated YAML.
- Derive context availability from the existing provider scope catalog where
  it applies. Do not require every GitHub expression to use a structured AST.

### Reusable workflows

- Model `workflow_call` inputs, secrets, and outputs as GitHub Actions-native
  contracts, with practical caller and callee validation.
- Emit native reusable-workflow YAML without hiding jobs and steps.

### Task execution

- Consider thin Deno `Deno.Command` helpers for logging, environment access,
  working directories, and exit status when concrete task use calls for them.
- Revisit standalone task registration only if a provider-specific handwritten
  workflow integration needs it.

### Further dogfooding and providers

- Exercise newly added syntax and task-runtime boundaries in repository CI,
  then document current migration or failure behavior in the live reference.
- Evaluate another provider, such as GitLab CI, after the GitHub Actions
  integration is proven. Its module, authoring API, validation, expressions,
  emitter, and artifact delivery must preserve that provider's native
  concepts. Extract shared delivery contracts only from concrete backends;
  do not introduce a provider-neutral pipeline model that erases their jobs
  and steps.
