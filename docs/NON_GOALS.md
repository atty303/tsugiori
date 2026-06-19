# Non-Goals

Forge's initial direction is intentionally narrow.

## Not a Replacement for GitHub Actions

Forge should compile to standard GitHub Actions workflows. It should not replace
GitHub Actions as the scheduler, runner model, permissions system, secret
provider, environment gate, or UI.

## Not a Generic CI Platform

Forge is not intended to become a general CI platform with its own hosted
control plane, scheduler, runner abstraction, or provider-neutral runtime.

The first target is GitHub Actions YAML generation.

Forge may keep shared task runtime contracts and authoring utilities, but it
should not define a provider-neutral pipeline model that hides each provider's
native workflow or pipeline semantics.

## Not a Dagger Clone

Dagger provides a programmable CI and build runtime with its own execution
model. Forge's initial direction is different: keep GitHub Actions orchestration
native and visible, while moving step implementation bodies into compiled Deno
entrypoints.

## Not One Opaque Step

Forge should not hide all work inside a single generated step such as:

```yaml
- name: Run CI
  run: forge ci
```

That shape would remove useful job and step boundaries from the CI provider's
UI. In the GitHub Actions provider backend, Forge should preserve meaningful
provider steps as normal Actions steps.

## Not Initially Implementing Other Backends

Forge is not initially implementing GitLab CI, Kubernetes, Tekton, Argo,
Buildkite, or self-hosted orchestration.

Those systems may be useful comparison points or future provider backends, but
supporting them would expand the design surface before the GitHub Actions
provider backend has been proven. Future provider backend support should add
provider-native DSLs and emitters rather than generalizing away
provider-specific concepts too early.

## Not a Workflow Marketplace

Forge is not initially intended to provide a marketplace, hosted registry, or
remote catalog of workflow modules.

Cache adapters for task artifacts are artifact delivery mechanisms, not a
hosted workflow marketplace. Supporting an OCI registry, S3, or another store
for task artifacts should not imply a remote catalog of workflow modules or a
Forge-hosted control plane.

## Not a Full Actions Reimplementation

Forge should not reimplement GitHub's expression evaluator, matrix executor,
permissions model, environment protection, secret handling, or job scheduler.
It should model those concepts enough to emit correct YAML and validate common
authoring mistakes.
