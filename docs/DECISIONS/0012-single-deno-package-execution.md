# 0012: One Deno Package for Authoring and Execution

## Status

Accepted. This refines the execution route in 0005 and 0008 and the artifact
key inputs in 0010.

## Context

A separately compiled Tsugiori CLI requires consumer projects to manage a
binary as well as authoring imports. Looking for `deno.json` or `deno.jsonc`
at the repository root and parsing `extends` inside Tsugiori can select a
different dependency graph from the consumer's Deno task. Generated steps must
also work when the workflow project is outside `.github`.

## Decision

The root `deno.json` is the single package manifest. It exports the authoring
API and an executable `cli` module. A consumer pins one package dependency in
its workflow project's `deno.json` and lockfile, and defines `generate` and
stale-output check as `deno task` commands. Tsugiori does not require the
consumer to define tasks for generated internal operations.

The consumer task gives the repository root explicitly with `--root`. The
config path and generated workflow outputs remain relative to that root. The
GitHub Actions backend emits internal run steps with the workflow project as
`working-directory`; those steps invoke the package's `cli` export through
Deno. Configuration loading, `deno info`, and `deno compile` run from that
project and let Deno select its config and lockfile. Tsugiori does not
rediscover or parse Deno project configuration.

The source-addressed artifact key now includes the Tsugiori package name and
version from the package manifest, in addition to repository-local source,
target, artifact format, and `cacheVersion`. A published package update changes
the key. Authors can increment `cacheVersion` for local package edits that keep
the manifest identity unchanged or for other excluded inputs.

## Consequences

The authoring API and executable module resolve from one consumer dependency.
Generated preparation remains visible as normal GitHub Actions steps. The
repository root still owns generated workflow paths and `.tsugiori` artifact
storage, while the workflow project owns Deno dependency resolution. The
separate CLI binary build route is removed.

## Trade-Offs

A consumer must supply the repository root in its two user-facing tasks. That
explicit path avoids Git-root discovery and supports nested workflow projects.
The key does not include the whole transitive dependency graph; `cacheVersion`
remains the manual invalidation control for excluded changes.
