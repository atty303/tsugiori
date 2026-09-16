# 0008: GitHub Actions Owns Task Artifact Cache Delivery

## Status

Accepted.

## Context

The repository-local cache established the content-addressed task artifact
layout and validation behavior. GitHub Actions cache delivery does not fit the
same in-process `restore` and `store` interface: `actions/cache` is provider
orchestration expressed as workflow steps, with provider-owned scopes, tokens,
and failure reporting.

The cache service is immutable. A corrupt entry therefore cannot be repaired
under the same transport key. Task binaries restored from the service also
need validation before they are materialized and executed.

## Decision

The GitHub Actions backend emits visible steps that resolve the artifact key,
restore an `actions/cache` entry, prepare and validate the artifact, and save a
new entry only when preparation built or repaired the local entry.

The content-addressed local entry remains
`.tsugiori/cache/artifacts/<artifact-key>/`. The transport key adds
`github.run_id` and `github.run_attempt` as a generation. Restore uses the
artifact-key prefix, so the most recent valid generation is preferred and a
repaired generation can supersede a corrupt one.

Artifact key resolution and preparation recompute the same key. Preparation
fails if the inputs changed between those steps. Restored entries are checked
against the expected key, manifest format, and binary checksum before use.

Restore and save steps are best-effort. A local build may continue after a
cache service failure, and a save failure does not invalidate a usable local
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
during a concurrent cold start. Normal hits avoid both compilation and a new
cache generation. Pull request and branch behavior follows GitHub's native
cache scopes.

Generated workflows depend on pinned `actions/cache/restore` and
`actions/cache/save` actions. The provider-specific lifecycle remains visible
without turning task-backed work into one opaque step.

Handwritten workflow integration is not part of this slice. It may be designed
later as a provider-specific interface without preserving these internal
commands.

## Trade-Offs

A generic cache adapter would provide an early uniform API, but it would hide
provider orchestration behind an interface shaped by the local filesystem.
Using one immutable transport key would be simpler, but a corrupt entry could
not be repaired automatically. Signing cached binaries would strengthen the
authenticity boundary, but it would introduce key ownership and pull-request
distribution concerns beyond the initial cache integration.
