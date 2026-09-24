# 0006: Inline Task Runtime Slice

## Status

Accepted. The artifact-key input paragraph is superseded by 0010.

## Context

The first task runtime implementation needs to connect authoring, provider
lowering, artifact preparation, cache restore, and runtime dispatch without
making GitHub Actions an opaque wrapper around another scheduler.

The implementation also needs one source of truth for generated task invocations
and compiled task entrypoints. Explicit standalone task authoring remains
useful, but it is not required to prove this first integrated slice.

## Decision

The GitHub Actions authoring API accepts inline task functions through
`job.task(name, function)`. The authoring model preserves a task-backed step
until compiler lowering. Lowering collects a task registry and emits normal
GitHub Actions `run` steps.

Task entrypoints use the readable form `<pipeline-id>/<job-id>/task-<ordinal>`.
The ordinal counts only task-backed steps within the job. Because ordinals are
not stable across task reordering, the generated preparation step includes a
fingerprint of that job's ordered task names. `tsugiori task prepare` rejects
stale generated configuration when the fingerprint differs.

One prepared binary contains all tasks from the authoring root. The first
task-backed step in each job is preceded by one visible preparation step. The
user remains responsible for provider-native checkout and setup steps that put
the `tsugiori` and `deno` binaries on `PATH` before preparation.

The initial artifact is compiled with `deno compile -A`. It is content addressed
from the reachable local module graph, dependency lock state, target, Deno
configuration sources, Deno version, Tsugiori build identity, artifact format,
compile permissions, and registered entrypoints. Preparation assumes these
inputs do not change during the command. Initial configuration inheritance is
limited to local paths so every configuration source can be hashed.

The initial cache adapter is repository-local. Cache entries contain the binary
and a runtime-owned JSON manifest. A corrupt entry is rebuilt. Failure to
populate the cache is recorded but does not prevent use of a successfully built
artifact in the current job.

The implementation initially emits POSIX runtime invocations. Task functions
inherit the runtime process working directory, receive a small logger, succeed
by returning, and fail by throwing or rejecting. GitHub Actions retains timeout,
retry, cancellation, and orchestration authority.

## Consequences

Generated jobs preserve separate visible task steps. Function bodies are
compiled into the task artifact and are not emitted into YAML.

The authoring module is evaluated while generating, preparing, and starting the
compiled runtime. Its top level must therefore construct definitions
deterministically and must not perform task work.

The initial artifact has broad runtime authority because it is compiled with
`-A`. Per-repository or per-task permission contracts require a later design.

Standalone task-registry authoring, Windows invocation, task outputs, runtime
timeouts and retries, remote cache adapters, and stale-file check mode remain
future work.
