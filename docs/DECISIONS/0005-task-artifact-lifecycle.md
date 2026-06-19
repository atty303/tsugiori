# 0005: Task Artifact Lifecycle

## Status

Accepted as initial direction.

## Context

The project needs a clearer task artifact lifecycle before implementation
begins. Pipeline generation and task artifact preparation have different
inputs, side effects, and failure modes.

Pipeline generation writes provider-native configuration that is intended to be
committed. Task artifact preparation may restore, build, and populate a
cacheable artifact for a target platform. The task runtime should also remain
usable from handwritten provider configuration, without requiring generated
pipeline YAML.

The design also needs to leave room for task artifacts that are OCI images.
If an OCI image is used, it should be able to be the task artifact itself
rather than requiring a second project-specific artifact beside it.

## Decision

Pipeline generation and task artifact preparation are separate command
responsibilities.

The planned `tsugiori generate` command should only generate provider-native
pipeline configuration, such as GitHub Actions workflow YAML. The planned
`tsugiori task prepare` command should prepare task artifacts. A future
convenience command may compose those operations, but the underlying
responsibilities should remain separate.

Task artifact metadata is owned by the task runtime tooling. A manifest file is
one possible representation of that metadata, but the design should not require
a separate manifest artifact. Metadata may instead be derived, embedded in the
prepared task artifact, or represented in another task-runtime-owned form.

If a manifest representation is introduced, it should describe the task
artifact contract rather than provider orchestration. It may include the
artifact key, target platform, runtime invocation form, registered task
entrypoints, and cache adapter reference data. Provider backends may reference
or emit steps that consume this task-owned metadata, but they should not own
the metadata shape.

`tsugiori task prepare` should compute the artifact key for the selected task
registry, dependency state, target platform, tool version, and artifact form.
It should try to restore the matching artifact through the selected cache
adapter. On a cache hit, it should make the artifact available to later
provider steps. On a cache miss, it should build the artifact and populate the
selected adapter before later provider steps invoke task runtime entrypoints.

Handwritten provider configuration can use the same lifecycle by running
`tsugiori task prepare` explicitly before invoking task runtime entrypoints.
This keeps task runtime usage independent from pipeline generation.

## Consequences

Phase 1 can focus on provider-native GitHub Actions workflow generation
without implementing task artifact preparation.

Task runtime implementation can define artifact preparation without depending
on generated pipeline YAML. Generated provider backends can later integrate by
emitting normal visible preparation steps before task-backed provider steps.

The artifact contract can support multiple artifact forms, including OCI
images, without forcing a separate project-specific artifact or mandatory
manifest file beside the prepared runtime.

Cache restore, cache miss builds, and cache population become part of the task
runtime tooling boundary. Provider backends remain responsible for native
provider configuration shape, not artifact construction internals.

## Trade-Offs

Separate commands expose more concepts to users than a single command, but they
keep reviewable provider configuration generation separate from cache,
platform, and artifact side effects.

A future composed command may improve local ergonomics, but it should be a thin
composition over the separate command responsibilities.

Keeping manifest shape optional delays a concrete integration detail, but it
preserves the ability for OCI image metadata or another artifact-native
representation to carry the task contract without requiring an additional
artifact.

Building and populating on cache miss makes initial CI runs slower, but it
gives repositories a working default before they adopt stricter pre-publish or
promotion workflows.
