# Architecture

This document describes the implemented GitHub Actions backend and task
runtime. [README](../README.md) covers authoring and commands;
[ROADMAP](ROADMAP.md) contains unfinished work.

## Execution boundary

Tsugiori builds standard `.github/workflows/*.yml` files. GitHub Actions owns
scheduling, job dependencies, matrix expansion, conditions, permissions,
secrets, environments, runners, and logs. Generated jobs and task-backed steps
remain normal, visible Actions jobs and steps. Task bodies are compiled into a
binary rather than embedded in YAML. The repository commits generated YAML and
checks it for staleness in CI.

The current implementation has one provider backend. Its API and workflow AST
model GitHub Actions concepts directly. There is no provider-neutral job or
step model and no second delivery backend.

## Package and authoring

The root `deno.json` defines one Deno package with root, `github-actions`,
`task`, and `run` exports. The GitHub Actions authoring API uses immutable
facades: job methods become available as the definition advances, and only a
pipeline with a completed, non-empty job can reach `defineTsugiori()`. Jobs are
authored in dependency order, so a new job can reference already completed
jobs. Typed action contracts bind a pinned `uses` value to declared inputs and
outputs; `rawAction()` is the explicit path for an unregistered action.

Authoring and task execution share a config file. The file exports a config
object and calls `runTsugiori()` under `import.meta.main`, passing that object,
its URL, and the repository root. The Deno project containing that file owns
import resolution and its lockfile. The runner consumes the object in-process;
it does not load it again or parse the project's Deno configuration. Top-level
code constructs the workflow definition; task callbacks run only through the
prepared task artifact.

The public API supports `push`, `pull_request`, and `workflow_dispatch` events,
including push branch filters and string dispatch inputs. It supports native
workflow and job permissions, concurrency, job conditions, timeouts,
environments, outputs, matrix strategy, and step conditions, environment
variables, failure policy, and working directories. The public
`rawExpression()` emits an explicit `${{ ... }}` value. The expression AST
serializes literals, property references, operators, built-in calls, and
opaque `rawNode<T>()` nodes. Field callbacks derive their available contexts
from the provider scope catalog. The AST is built at each field; it is not a
host-language evaluation of GitHub runtime values. `fromJSON().as<T>()` and
`rawNode<T>()` contain caller assertions, not runtime validation.

Jobs use staged methods for conditions, matrix, concurrency, and other options.
Step output names come from typed action definitions, declared run-step outputs,
or `defineTask()` declarations. Job outputs are authored after their steps and
become the typed `needs` surface of subsequent jobs. Task output writes pass
through a context writer that checks declared names and appends GitHub's
multiline output format to `GITHUB_OUTPUT`.

## Generation and validation

The compiler lowers authoring data to a GitHub Actions workflow AST, validates
it, and emits deterministic YAML. Generated `run` commands preserve their
string values in YAML literal blocks; values that cannot be represented safely
that way are rejected. The config owns output paths under
`.github/workflows/` and each generated file starts with an ownership comment.

`generate` writes the configured outputs. `generate --check` compares expected
bytes to existing files and reports missing or changed outputs, plus extra
`.yml` files with the same ownership comment. It does not modify files.
`--output <path>` limits the check to one workflow. Normal generation does not
delete extra files. The checked-in [CI config](../.github/tsugiori.ts) emits the
[CI workflow](../.github/workflows/ci.yml); CI runs `generate:check`.

## Task artifact lifecycle

Compiler lowering records inline task functions in a registry. A task-backed
step gets an entrypoint of the form
`<pipeline-id>/<job-id>/task-<ordinal>`, where the ordinal counts task steps
within the job. Generated preparation steps include a job-layout fingerprint
so changed task ordering is detected before dispatch.

Each task-backed job contains visible steps to resolve the artifact key, run a
pinned `actions/cache` action, and prepare the artifact. Preparation first
checks the repository-local cache, then compiles the config into one Deno
binary for its tasks on a miss or invalid entry. The binary is compiled with
`-A`; the current invocation contract rejects Windows task artifacts. Each
task step invokes the prepared binary directly with its own entrypoint.
The GitHub Actions backend owns these preparation steps and internal commands;
they are not a public handwritten-workflow interface.

The local entry is `.tsugiori/cache/artifacts/<artifact-key>/`. It contains the
binary and a runtime-owned JSON manifest with the artifact key, format,
target, Deno and Tsugiori versions, invocation path, entrypoints, and binary
checksum. Restored entries are validated before use. A failed restore or an
invalid entry can fall back to a local build. Failure to store an otherwise
valid build in the local cache is reported but does not discard the binary.

The automatic artifact key covers the reachable repository-local `file:`
module graph, target platform, artifact format, and Tsugiori package identity.
The config-wide `cacheVersion` is an additional key input. Remote modules,
repository-external files, lockfiles, and Deno settings and versions are not
tracked automatically; authors increase `cacheVersion` when changes to these
inputs require a new artifact. This key is a cache reuse contract rather than
a complete build-reproducibility claim.

The GitHub cache transport key is `tsugiori-task-<artifact-key>`. The generated
`actions/cache` step is best-effort and can save a new entry through its post
action after a successful job if there was no exact hit. A corrupt remote
entry cannot be overwritten at the same key; recovery requires deleting that
entry or changing the key. GitHub's cache scope and write authorization remain
the remote authenticity boundary.

## Diagnostics

When `RUNNER_DEBUG=1`, a config entrypoint or compiled runtime invocation emits
one bounded JSON diagnostic record to standard error. Normal runs emit no
structured diagnostic record, and neither path retains diagnostic files.
Import and top-level config failures occur before the runner and use Deno's
error output.
