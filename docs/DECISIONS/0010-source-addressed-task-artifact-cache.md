# 0010: Source-Addressed Task Artifact Cache

## Status

Accepted. This supersedes the artifact-key input decision in 0006 and any
earlier transitive content-identity claims that conflict with it. The Tsugiori
package identifier is added to the key by 0012.

## Context

The previous artifact key hashed every local path reported by `deno info`, the
lockfile, Deno configuration and version, Tsugiori build identity, compile
permissions, and registered entrypoints. Remote modules are represented by
files in Deno's cache. Those files include transport metadata that can change
between otherwise equivalent downloads, so identical authoring source produced
different keys and prevented GitHub Actions cache reuse.

Tracking every transitive input also made the cache contract stricter than its
intended operation. The common invalidation event is a change to the authoring
source or a repository-local module it imports. Less direct inputs need a
simple explicit invalidation mechanism rather than complete automatic identity.

## Decision

The task artifact cache is source-addressed. The automatic artifact key contains
only:

- the root-relative path and content digest of each reachable `file:` module
  inside the repository root
- the target platform
- the artifact format version
- the Tsugiori package identifier (added by 0012)
- the config-wide `cacheVersion`

`defineTsugiori` accepts an optional positive safe integer `cacheVersion` whose
default is `1`. Authors increment it when an excluded input must invalidate the
cache.

Remote modules, repository-external local modules, lockfiles, Deno
configuration and version, compile permissions, and the entrypoint list are
not separate automatic key inputs. Deno version remains diagnostic manifest
metadata. Incompatible artifact or
manifest changes increment the artifact format version.

The GitHub Actions transport key keeps its existing generational shape. It
embeds the artifact key and does not repeat `cacheVersion` as a separate
segment.

## Consequences

Editing a reachable repository-local source module invalidates the artifact.
Clean downloads of equivalent or changed remote dependency content do not
change the key by themselves. Repository-external files and toolchain or
dependency metadata also require an explicit `cacheVersion` increment when
they affect the desired artifact.

The contract is intentionally narrower than complete transitive dependency
identity or bit-for-bit reproducibility. The manifest schema and artifact format
must change with this decision so older entries are not accepted as compatible.

## Trade-Offs

Automatic tracking of every transitive input could detect more changes, but it
would retain unstable transport metadata and make ordinary cache reuse
unreliable. Hashing only the config entrypoint would be simpler, but it would
miss repository-local modules that contain task implementations. Hashing the
whole repository would invalidate on unrelated edits. Repository-external
absolute paths would reduce portability, while rejecting those modules would
unnecessarily restrict authoring.
