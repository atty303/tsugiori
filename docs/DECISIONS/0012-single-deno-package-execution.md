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
API and a `runTsugiori` function. A consumer pins one package dependency in its
workflow project's `deno.json` and lockfile. Its config file default-exports
the authoring object and, under an explicit `import.meta.main` guard, calls the
runner with that object, its own file URL, and the repository root. The author
chooses how to obtain the root; the example uses a relative `URL`.

The consumer defines `generate` and stale-output check as `deno task` commands
that execute the config file. The GitHub Actions backend emits internal run
steps with the workflow project as `working-directory`; those steps execute the
same config file for artifact key resolution and preparation. The task artifact
is the compiled config file, and `runTsugiori` also dispatches its task
entrypoints. The config object stays in-process without a loader child process or JSON serialization. Deno
selects the workflow project's config and lockfile for execution, `deno info`,
and `deno compile`; Tsugiori does not rediscover or parse Deno project config.
The config file's import and top-level initialization errors are reported by
Deno before the runner starts. Runner diagnostics remain available afterward.

The source-addressed artifact key now includes the Tsugiori package name and
version from the package manifest, in addition to repository-local source,
target, artifact format, and `cacheVersion`. A published package update changes
the key. Authors can increment `cacheVersion` for local package edits that keep
the manifest identity unchanged or for other excluded inputs.

## Consequences

The authoring API and runner resolve from one consumer dependency.
Generated preparation remains visible as normal GitHub Actions steps. The
repository root still owns generated workflow paths and `.tsugiori` artifact
storage, while the workflow project owns Deno dependency resolution. The
separate CLI binary build route and config loader process are removed.

## Trade-Offs

A consumer supplies the repository root once in its config file. The runner
accepts a path or file URL without prescribing how the author derives it.
The key does not include the whole transitive dependency graph; `cacheVersion`
remains the manual invalidation control for excluded changes.
