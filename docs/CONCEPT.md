# Concept

Forge is proposed as a CI workflow compiler with language-native step
implementation. Its first target is GitHub Actions-native workflow generation.

The initial GitHub Actions backend has two linked goals:

- let authors describe GitHub Actions workflow structure in typed
  TypeScript/Deno code
- let authors implement logical step entrypoints in ordinary Deno code, then
  invoke those entrypoints from generated GitHub Actions steps

## Actions-Native Orchestration

Forge should not replace GitHub Actions as the execution platform.

The workflow graph should remain visible to GitHub Actions. Jobs, steps,
dependencies, matrices, permissions, environments, secrets, outputs, and
conditional execution should compile to normal GitHub Actions YAML.

This preserves several important properties:

- the GitHub web UI still shows meaningful job and step boundaries
- existing Actions features remain available without reimplementing them
- workflow failures can still be understood through ordinary GitHub logs
- repository settings, environments, secrets, and permissions keep their normal
  GitHub semantics
- generated YAML can be reviewed as a native artifact

Forge should compile to `.github/workflows/*.yml`, not to a separate CI
scheduler.

Generated workflow YAML is intended to be committed to the repository. The
authoring source remains the source of truth, but the emitted YAML should be a
reviewable artifact that GitHub Actions can load directly from the pushed
commit. A local git hook can compile the workflow source before commit, and CI
should eventually be able to fail when generated YAML is stale.

## Core Model and CI Backends

Forge should distinguish reusable core concepts from CI-specific workflow
semantics.

The core model should stay limited to concepts that can plausibly be shared by
multiple CI providers:

- workflow identity
- jobs and job dependencies
- logical steps that dispatch to registered runtime entrypoints
- runtime artifact manifests
- cache adapter contracts for prepared runtime binaries

Provider-specific concepts should be modeled in explicit backend layers. The
GitHub Actions backend owns Actions events, runner labels, `uses` steps,
permissions, environments, `workflow_call`, expression syntax, generated file
paths, and YAML emission. A future GitLab CI backend could reuse the core
runtime and logical step model, but it would need its own DSL surface and
compiler rules for GitLab-native jobs, stages, rules, variables, artifacts, and
cache behavior.

This keeps Forge from becoming either a GitHub-only runtime model or a
lowest-common-denominator CI abstraction. Users should select the backend they
are authoring for, and Forge should preserve that provider's native job and
step visibility.

## Language-Native Step Implementation

GitHub Actions YAML is useful for orchestration, but it is a limited medium for
non-trivial step logic. Shell fragments and inline scripts can become difficult
to type-check, share, refactor, and test.

Forge's proposed step model moves implementation bodies into Deno code while
keeping each logical step as a normal Actions step. The generated YAML should
invoke the same compiled runtime binary with different subcommands, for example:

```yaml
- name: Test
  run: ./.forge/runtime/forge-runtime test

- name: Build
  run: ./.forge/runtime/forge-runtime build
```

The runtime binary is responsible for dispatching to the registered step
entrypoint. GitHub Actions remains responsible for ordering, condition
evaluation, matrix expansion, secrets injection, environment protection, and
other workflow behavior.

The runtime binary should be prepared before logical Forge steps run. Once
prepared, each generated logical step should invoke the binary directly and
should not fetch or build Forge-managed step implementation code again. This
does not prevent a user-authored step from intentionally running commands that
perform their own network or dependency work.

Runtime binary storage and retrieval should be abstracted behind cache
adapters. The same compiler/runtime model should be able to use `actions/cache`,
GCR or another OCI registry, S3, or another compatible store without changing
the logical workflow shape.

## Boundary

Forge's core design boundary is:

- The selected CI provider owns orchestration.
- Forge owns authoring, validation, YAML emission, runtime artifact selection,
  and step implementation dispatch.
- The GitHub Actions backend must preserve GitHub Actions-native workflow
  semantics.

This boundary is intended to avoid both extremes:

- hand-maintained YAML for complex workflows
- one opaque CI command that hides the workflow graph from the CI provider
