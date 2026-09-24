# 0008: GitHub Actions Owns Task Artifact Cache Delivery

## Status

Accepted.

## Context

The repository-local cache established the key-addressed task artifact
layout and validation behavior. GitHub Actions cache delivery does not fit the
same in-process `restore` and `store` interface: `actions/cache` is provider
orchestration expressed as workflow steps, with provider-owned scopes, tokens,
and failure reporting.

The cache service is immutable. A corrupt entry therefore cannot be repaired
under the same transport key. Task binaries restored from the service also
need validation before they are materialized and executed.

## Decision

The GitHub Actions backend emits visible steps that resolve the artifact key,
restore an `actions/cache` entry, and prepare and validate the artifact. The
single cache action saves the prepared entry through its post action when the
job succeeds and the key was not an exact cache hit.

The source-addressed local entry remains
`.tsugiori/cache/artifacts/<artifact-key>/`. The transport key is
`tsugiori-task-<artifact-key>` and is stable across workflow runs. The artifact
key includes the config-wide `cacheVersion` for explicit invalidation needs.
An immutable corrupt remote entry cannot be replaced at the same key. Recovery
requires deleting the entry or changing the key.

Artifact key resolution and preparation recompute the same key. Preparation
fails if the inputs changed between those steps. Restored entries are checked
against the expected key, manifest format, and binary checksum before use.

The cache step is best-effort. A local build may continue after a cache service
failure, and a post-action save failure does not invalidate a usable local
artifact. GitHub's default cache access and scope rules are retained; generated
workflows do not broaden write access for low-trust triggers. The GitHub cache
authorization boundary is the authenticity boundary. The manifest checksum
detects corruption but is not a signature.

Preparation commands and GitHub step outputs are backend implementation
details, not a shared public prepare-command contract. No generic remote cache
adapter is introduced. A common delivery abstraction may be extracted after a
second backend provides concrete requirements.

Compiler-owned generated steps may emit raw GitHub expressions. A future
public expression API may use structured expressions, but it must permit an
explicit escape hatch rather than requiring every expression to use an AST.

## Consequences

Each task-backed job remains independent and may perform a duplicate build
during a concurrent cold start. Exact cache hits avoid both compilation and a
new cache entry. A new entry is saved only after a successful job. Pull request
and branch behavior follows GitHub's native cache scopes.

Generated workflows depend on a pinned `actions/cache` action. The
provider-specific lifecycle remains visible without turning task-backed work
into one opaque step.

Handwritten workflow integration is not part of this slice. It may be designed
later as a provider-specific interface without preserving these internal
commands.

## Trade-Offs

A generic cache adapter would provide an early uniform API, but it would hide
provider orchestration behind an interface shaped by the local filesystem.
Using one immutable transport key avoids a separate save step and redundant
generations, but a corrupt entry cannot be repaired automatically. Signing
cached binaries would strengthen the authenticity boundary, but it would
introduce key ownership and pull-request
distribution concerns beyond the initial cache integration.
