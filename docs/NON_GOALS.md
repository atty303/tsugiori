# Non-Goals

Forge's initial direction is intentionally narrow.

## Not a Replacement for GitHub Actions

Forge should compile to standard GitHub Actions workflows. It should not replace
GitHub Actions as the scheduler, runner model, permissions system, secret
provider, environment gate, or UI.

## Not a Generic CI Platform

Forge is not initially intended to become a general CI platform with its own
hosted control plane or cross-provider abstraction.

The first target is GitHub Actions YAML generation.

## Not a Dagger Clone

Dagger provides a programmable CI and build runtime with its own execution
model. Forge's initial direction is different: keep GitHub Actions orchestration
native and visible, while moving step implementation bodies into compiled Deno
entrypoints.

## Not One Opaque Step

Forge should not hide all work inside a single generated step such as:

```yaml
- name: Run CI
  run: forge-runtime ci
```

That shape would remove useful job and step boundaries from the GitHub Actions
UI. Forge should preserve meaningful logical steps as normal Actions steps.

## Not Initially Targeting Other Orchestrators

Forge is not initially targeting Kubernetes, Tekton, Argo, Buildkite, or
self-hosted orchestration.

Those systems may be useful comparison points, but supporting them would expand
the design surface before the GitHub Actions compiler model has been proven.

## Not a Workflow Marketplace

Forge is not initially intended to provide a marketplace, hosted registry, or
remote catalog of workflow modules.

Cache adapters for compiled runtime binaries are artifact delivery mechanisms,
not a hosted workflow marketplace. Supporting an OCI registry, S3, or another
store for runtime artifacts should not imply a remote catalog of workflow
modules or a Forge-hosted control plane.

## Not a Full Actions Reimplementation

Forge should not reimplement GitHub's expression evaluator, matrix executor,
permissions model, environment protection, secret handling, or job scheduler.
It should model those concepts enough to emit correct YAML and validate common
authoring mistakes.
