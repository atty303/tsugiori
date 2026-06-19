# 0004: Pipelines, CI Providers, and Task Runtime

## Status

Accepted as initial direction.

## Context

The project has two related but independent concerns:

- authoring and compiling provider-native CI pipeline definitions
- authoring task functions and preparing task artifacts that CI provider steps
  can execute

Those concerns work well together, but neither should require the other. A
repository with simple CI configuration may still benefit from task functions
and the task runtime without using the pipeline authoring API.
Conversely, a repository may use the compiler to generate provider-native CI
configuration without using task functions.

The project also needs precise language for CI systems. GitHub Actions,
GitLab CI, Buildkite, and similar systems are CI providers. The project may implement
a provider backend for a CI provider, but the backend is the compiler and
emitter layer, not the provider itself.

CI providers differ in important ways. GitHub Actions workflows, jobs, steps,
events, `workflow_call`, `uses` steps, permissions, expression syntax, and file
layout are not the same as GitLab CI pipelines, stages, `rules`, variables,
cache behavior, artifacts, and `.gitlab-ci.yml` structure.

The design should preserve provider-native concepts instead of forcing each CI
provider through a lowest-common-denominator pipeline model.

## Decision

The authoring API will use `pipeline` as its general term for CI definitions.
Provider-native terms remain in provider-specific layers. For GitHub
Actions, the native output concept is still a workflow, and generated files
still live under `.github/workflows/*.yml`.

The project will not define a provider-neutral pipeline model with shared jobs,
steps, matrices, dependencies, and expressions. Users should choose the CI
provider they are authoring for, and the project should not promise transparent
pipeline portability between providers.

Each provider backend should expose provider-native authoring modules, define
provider-native intermediate representations, validate provider-native
concepts, and emit provider-native configuration. The GitHub Actions provider
backend owns GitHub Actions events, workflows, jobs, steps, `needs`, matrix,
permissions, `uses` steps, `workflow_call`, expression syntax, file layout, and
YAML emission.

Task functions are separate from provider pipeline authoring. A task
function is code authored in the same language family as the pipeline
definition and intended to run as CI work. Task functions are collected through
a task registry and prepared into a task artifact. A provider backend may emit
a provider-native step that invokes a task through the task runtime.

In the GitHub Actions provider backend, this means GitHub Actions keeps visible
job and step orchestration. A task-backed GitHub Actions step should still be a
normal Actions step, for example a `job.step("Test", testTask)` authoring call
that emits a visible provider step which invokes a task runtime entrypoint.

The `@tsugiori/core` package may contain both pipeline authoring modules and task
authoring modules while keeping them internally separate. It should stay pure:
no filesystem access, process execution, network access, YAML writing, package
installation, or compiler side effects.

## Consequences

Provider-specific pipeline expressiveness is preserved. The GitHub Actions
provider backend can model GitHub Actions directly rather than squeezing it
through a portable CI abstraction.

Future provider backends are additive. A GitLab CI provider backend should
define GitLab-native authoring modules and emit GitLab-native configuration
rather than pretending GitLab pipelines are portable GitHub Actions workflows.

The task runtime can provide value without the pipeline DSL. Repositories with
handwritten provider configuration may still use task artifacts and task
runtime invocation.

The integrated experience remains important. When a provider backend and the
task runtime are used together, the tooling can keep pipeline authoring, task
registration, task artifact preparation, and provider step emission aligned.

The project has two boundaries to maintain:

- provider pipeline authoring and emission remain provider-native
- task functions, task registry, task artifacts, and task runtime remain usable
  independently of pipeline authoring

## Trade-Offs

The project gives up transparent pipeline portability between CI providers. This is
intentional: preserving provider-native expressiveness is more important than a
lowest-common-denominator API.

Some vocabulary is layered. The authoring API uses `pipeline` as the general term, while
GitHub Actions still uses `workflow`, `job`, and `step`. This requires precise
documentation, but it avoids replacing provider-native terms with project terms.

The project will not implement GitLab CI in the initial phases. Deferring it keeps
the first milestone focused on proving the GitHub Actions provider backend and
task runtime integration before expanding the design surface.
