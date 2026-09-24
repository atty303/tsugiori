# Concept

Tsugiori is proposed as a CI pipeline authoring tool with an optional task
runtime. Its first CI provider target is GitHub Actions-native workflow
generation.

The project has two related but independent goals:

- let authors describe provider-native CI pipeline structure in
  TypeScript/Deno code
- let authors implement task functions in ordinary Deno code, prepare them as
  task artifacts, and invoke them from CI provider steps

These goals work well together, but neither should require the other. A
repository may use the compiler to generate GitHub Actions workflow YAML without task
functions. Another repository may keep handwritten workflow YAML and still use
the task runtime for richer task implementations.

## Actions-Native Orchestration

The tool should not replace GitHub Actions as the execution platform.

The GitHub Actions workflow graph should remain visible to GitHub Actions. Jobs, steps,
dependencies, matrices, permissions, environments, secrets, outputs, and
conditional execution should compile to normal GitHub Actions YAML.

This preserves several important properties:

- the GitHub web UI still shows meaningful job and step boundaries
- existing Actions features remain available without reimplementing them
- workflow failures can still be understood through ordinary GitHub logs
- repository settings, environments, secrets, and permissions keep their normal
  GitHub semantics
- generated YAML can be reviewed as a native artifact

It should compile to `.github/workflows/*.yml`, not to a separate CI
scheduler.

Generated workflow YAML is intended to be committed to the repository. The
authoring source remains the source of truth, but the emitted YAML should be a
reviewable artifact that GitHub Actions can load directly from the pushed
commit. A local git hook can compile the pipeline source before commit, and CI
should eventually be able to fail when generated YAML is stale.

## Pipelines and CI Providers

`pipeline` is the general term for authored CI definitions. CI provider-native
terms remain provider-specific. For GitHub Actions, the native output concept
is still a workflow, and generated files still live under
`.github/workflows/*.yml`.

The project should not define a provider-neutral pipeline model with shared jobs,
steps, matrices, dependencies, and expressions. CI providers differ in their
native concepts, and a portable pipeline model would erase too much provider
expressiveness.

Users should choose the CI provider they are authoring for. Each provider
backend should expose provider-native authoring modules, define
provider-native intermediate representations, validate provider-native
concepts, and emit provider-native configuration.

The GitHub Actions provider backend owns Actions events, workflows, jobs,
steps, runner labels, `uses` steps, permissions, environments, `workflow_call`,
expression syntax, generated file paths, and YAML emission. A future GitLab CI
provider backend would need its own DSL surface and compiler rules for
GitLab-native pipelines, stages, rules, variables, artifacts, and cache
behavior.

This keeps the project from becoming either a GitHub-only runtime model or a
lowest-common-denominator CI abstraction. Users should select the CI provider
they are authoring for, and provider backends should preserve native job
and step visibility.

## Task Functions and Task Runtime

GitHub Actions YAML is useful for orchestration, but it is a limited medium for
non-trivial CI work. Shell fragments, inline scripts, and committed JavaScript
bundles can become difficult to type-check, share, refactor, and test.

The proposed task model moves task implementation bodies into Deno code
while keeping provider steps visible. A GitHub Actions provider backend may
emit normal Actions steps that invoke the task runtime with different
entrypoints, for example:

```yaml
- name: Test
  run: ./.tsugiori/task-runtime ci/test/task-1

- name: Build
  run: ./.tsugiori/task-runtime ci/build/task-1
```

The task runtime is responsible for dispatching to registered task functions.
GitHub Actions remains responsible for ordering, condition evaluation, matrix
expansion, secrets injection, environment protection, and other workflow
behavior.

The task artifact should be prepared before task-backed provider steps run.
Once prepared, each task-backed provider step should invoke the task runtime
directly and should not fetch or build managed task code again. This does
not prevent a user-authored task from intentionally running commands that
perform their own network or dependency work.

The task artifact may take different prepared runtime forms. An OCI image may
itself be the task artifact; the design should not require an additional
project-specific artifact beside it.

Task artifact delivery belongs to the provider integration. The implemented
GitHub Actions backend emits a visible `actions/cache` step.
Future OCI registry, S3, or provider integrations should start with their
native delivery model; a shared abstraction should be extracted only from
concrete common requirements.

## Boundary

The core design boundary is:

- The selected CI provider owns orchestration.
- The project owns pipeline authoring, validation, provider-native configuration
  emission, task artifact selection, and task runtime dispatch.
- The GitHub Actions provider backend must preserve GitHub Actions-native workflow
  semantics.

This boundary is intended to avoid both extremes:

- hand-maintained YAML for complex workflows
- one opaque CI command that hides the workflow graph from the CI provider
