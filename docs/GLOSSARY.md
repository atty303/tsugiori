# Glossary

This glossary records the current design vocabulary. Some terms have an initial
implemented API, while later-phase terms remain intended concepts.

## Pipeline

A CI definition authored with the pipeline API.

`pipeline` is the general term. Provider-native terms remain provider-specific.
For GitHub Actions, the native emitted concept is still a workflow.

The project should not define a provider-neutral pipeline model that erases
provider-native concepts.

## CI Provider

An external CI system such as GitHub Actions, GitLab CI, or Buildkite.

The selected CI provider owns orchestration, scheduling, runtime contexts,
secrets, permissions, logs, and provider-native UI behavior.

## Provider Backend

The compiler and emitter layer for a specific CI provider.

A provider backend exposes provider-native authoring modules, validates
provider-native concepts, and emits provider-native configuration. The first
intended provider backend is GitHub Actions.

## GitHub Actions Workflow

The GitHub Actions-native workflow emitted under `.github/workflows/*.yml`.

The authoring API may use `pipeline` vocabulary, but generated GitHub Actions
configuration should keep GitHub's native `workflow`, `job`, and `step`
concepts.

## GitHub Actions Workflow AST

The provider backend's structured representation of a GitHub Actions workflow.

It should model GitHub Actions concepts directly and preserve enough structure
for validation and deterministic YAML emission.

## GitHub Actions Expression AST

The structured representation of GitHub Actions expressions such as
`matrix.deno`, `github.ref == 'refs/heads/main'`, and `always() && failure()`.

GitHub Actions expressions are CI runtime values. They should not be evaluated
as host-language conditionals during pipeline generation.

## Task Function

Code authored to perform CI work.

The initial API defines task functions inline through `job.task`. Standalone
task authoring for handwritten provider configuration remains planned.

## Task Registry

The mapping from task entrypoints to task functions. The initial entrypoint is
the pipeline ID, job ID, and task-backed-step ordinal joined as a readable path.

The task registry lets task artifact preparation and provider backend emission
agree on the task runtime entrypoints that will exist.

## Task Runtime

The mechanism that executes registered task functions in CI.

Provider-native steps may invoke the task runtime with a task entrypoint while
remaining visible as normal provider steps.

## Task Artifact

The prepared output used by CI provider steps to execute registered task
functions.

The initial implementation uses Deno to produce one binary for all tasks in an
authoring root, but the term is intentionally broader than binary so future
bundle, OCI image, or WebAssembly forms remain possible. An OCI image may
itself be the task artifact.

## Task Artifact Metadata and Manifest

Metadata that connects provider configuration to the expected task artifact.

The initial local cache entry includes a JSON sidecar manifest with the artifact
key, target platform, task runtime invocation form, registered entrypoints,
binary checksum, and tool/runtime versions. Other artifact forms are not
required to use a separate manifest.

## Task Artifact Cache Adapter

The storage and retrieval boundary for task artifacts.

The adapter is an artifact delivery mechanism. It should not become a scheduler
or hide provider-native jobs and steps.
