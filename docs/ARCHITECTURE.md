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
`task`, `testing`, and `run` exports. The root re-exports the full GitHub Actions API and
`runTsugiori()`; the subpath exports remain available. The authoring API uses
immutable facades: `definePipeline()` groups trigger settings under a native
`on` object; job methods become available as the definition advances, and
only a pipeline with a completed, non-empty job can reach `defineTsugiori()`.
Jobs are authored in dependency order, so a new job can reference completed
jobs. Action steps take a metadata contract or an implementation reference directly
through `job.uses(contractOrUses, options?)`. Contracts declare input names,
requiredness and string outputs; a string reference provides no declared output
names. Action values are strings or string expressions, while reusable workflow
call inputs retain their declared primitive types.

Authoring and task execution share a config file. The file exports a config
object and calls `runTsugiori()` under `import.meta.main`, passing that object,
its URL, and the repository root. The Deno project containing that file owns
import resolution and its lockfile. External projects can map the root to one
commit-pinned source URL; the YAML dependency uses a direct `jsr:` specifier in
the package source. The runner consumes the object in-process;
it does not load it again or parse the project's Deno configuration. Top-level
code constructs the workflow definition; task callbacks run only through the
prepared task artifact.

The public API supports push, PR, PR-target, dispatch and reusable-workflow
triggers and the native fields listed in the
[specification coverage](GITHUB_ACTIONS_SPEC.md). Local reusable references
retain the `on.workflow_call` input/secret/output contract separately from
the input reference union across configured events, and emit normal caller jobs with
uses/with/secrets. The config contains both callers and callees; lowering checks
membership, contracts, nesting and output references. Workflow env stays within
each workflow. Run defaults remain native job settings and per-step overrides
remain explicit. The public `rawExpression()` emits an explicit `${{ ... }}` value. The expression AST
serializes literals, property references, operators, built-in calls, and
opaque `rawNode<T>()` nodes. Field callbacks derive their available contexts
from the provider scope catalog. The AST is built at each field; it is not a
host-language evaluation of GitHub runtime values. `rawNode<T>()` and
`.as<T>()` contain caller assertions, not runtime validation. Typed task JSON
references give `fromJSON()` an inferred result type while preserving its
ordinary GitHub expression rendering.

Jobs use staged methods for conditions, matrix, concurrency, and other options.
Step output names come from typed action definitions, declared run-step outputs,
or task-step output declarations. Job outputs are authored after their steps
and become the typed `needs` surface of subsequent jobs. A task is defined
directly in `job.task({ inputs, outputs, env, run })`. Each typed input couples
a contract to a GitHub expression source; the compiler creates its step `env`
entry and rejects collisions with authored `env`. Task output writes validate
and serialize native values before appending GitHub's multiline format to
`GITHUB_OUTPUT`; the runner parses and validates input wire values before
calling `run`.

Text and JSON are distinct task I/O variants. JSON accepts a consumer-owned
`parse(value: unknown): T` schema without depending on a particular parser
library. Parsing must preserve the JSON shape. An omitted output is `null` in
the typed model and an empty string in GitHub's output wire format. Top-level
`null` and explicit empty text are invalid writes; nested JSON `null` and arrays
are normal values. A required output must be set. Direct task output and job
output passthrough references retain the same contract object; computed
expressions do not carry a contract. `present(ref)` lowers to an empty-string
check and carries a presence proof through `and`, job `when`, and task `if`.
Other expression nodes do not correct wire values implicitly.
Conditional or `continueOnError` task steps expose their outputs as optional
to consumers, even when an output is required during an actual task run.

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

## Scenario interpretation

The testing API lowers a pipeline with the same compiler path used for YAML
generation and interprets the validated GitHub Actions workflow AST. Its
scenario builder preserves the pipeline's job IDs, step IDs, task contracts,
and matrix types for editor completion. A scenario provides referenced
external contexts and fixtures for reached authored steps. Local calls recursively
interpret callee workflows with separate inputs, secrets and env; external calls
use explicit fixtures. The caller github context stays unchanged. Call results
and workflow outputs retain their native boundaries. The interpreter
builds `steps`, `needs`, and `matrix` contexts, evaluates supported expressions,
serializes typed task outputs to GitHub wire values, and checks independent
expectations against the resulting state. Generated task preparation steps
default to success and support an explicit outcome override.

The interpreter checks trigger filters, conditions, step order, matrix
expansion, job dependencies, status and `continue-on-error`, and value
propagation. It does not call authored step or task bodies. It does not model
runner behavior, permissions, environment approvals, timeouts, concurrency,
or actual parallel execution. Unknown expression forms and `hashFiles()` need
a field-specific scenario value; unsupported forms never silently succeed.

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

The scenario library can emit per-workflow start/completion/error operations to
an optional host-owned observation sink, linked through nested calls. Events
contain generated operation IDs, stage, status and stable error type; no input,
secret, env, expression or fixture values enter the sink. A missing or failing
sink does not affect results. The library owns no provider, recording store or
exporter. Deterministic compiler/schema failures retain operation-specific typed
diagnostics and can be rerun safely from the same authoring input.

## Type service

`services/type-service/` owns one Cloudflare Worker independently of the
consumer package. Its current resource is `/github/actions/`; it does not
execute actions or workflows. GitHub requests resolve a ref first and read
`action.yml` (then `action.yaml` on a 404) at that SHA. A pure, versioned
metadata validator/emitter produces standalone TypeScript data, omitting
`runs`. The plain structural contract types live in the GitHub Actions core;
no Tsugiori runtime identity crosses the distribution boundary.

The HTTP layer redirects original references to URLs containing generator
version, resolved SHA, and original reference. These immutable identities
retain the original `uses` default. Cloudflare's default Cache API holds
five-minute ref redirects and year-long modules; neither is durable storage.
Cache failure permits normal upstream retrieval, while an upstream failure
after redirect expiry returns an error. The generator's version owns its
emitted bytes and parser dependency; changing either output requires a new
version and retaining the old generator. Unknown versions fail explicitly.

The service uses unauthenticated GitHub API requests and accepts no user
credentials. Public hosting still requires rate-limit and authentication
planning before deployment. The deployment configuration owns no domain or
bindings, disables remote log export, and uploads a browser-targeted Deno
bundle. Consumer imports never load Worker code. Wrangler and its Node runtime
are pinned in the repository's mise toolchain. Wrangler's official custom build
hook owns bundling for local development, dry-run upload validation, and deploy.
Local development runs the Worker in workerd on loopback with remote bindings
disabled. The standard verification path validates the upload without publishing.
Authentication and publication remain explicit operator actions through separate
tasks; the repository contains no account ID or credential. Wrangler usage metrics
are disabled by default.

Requests retain at most 32 causal stage records per run and 128 runs per
isolate, evicting successful runs first. Records contain operation names,
parent IDs, durations, completion and error classes; no requested URL, metadata,
headers, input values or raw exceptions are stored. The host-owned diagnostic
store exposes listing and deletion in process and has no public route or
remote exporter. `DIAGNOSTICS=off` disables Worker recording. Isolate teardown
loses these bounded diagnostic records. This is local diagnosis, not a durable
operational audit.

## Package release boundary

`.github/tsugiori.ts` owns CI and the release workflow; generated YAML stays
visible and checked in. Regular releases delegate version selection, tag/Release
ownership, artifact validation and rollback to the commit-pinned
repository-template action. Root mise release tasks own source selection,
version injection and JSR publication from the extracted archive. Development
metadata is never written back by a release.

JSR retries compare the complete registry file manifest (path, byte count and
SHA-256) and exports against the source archive. The publication config excludes
workspace and import-map settings; sources use explicit relative, `node:` or
`jsr:` imports. Adding publish-time transformations requires updating this
comparison contract. Registry versions are never removed on failure.

An Actions concurrency group serializes releases. The main branch condition
allows automatic publication after repository checks; manual dispatch supports
retries. Release tags define the SemVer baseline.

Release task diagnostics retain up to 32 runs locally under
`.release/diagnostics/`, evicting older successes first. Records contain only
stage names, timings, status and stable error classes; incomplete runs remain
partial after abrupt termination. `RELEASE_DIAGNOSTICS=off` disables recording;
`mise run release:diagnostics list` and `clear` inspect or delete records. Store
failure does not change release results. There is no diagnostic exporter. GitHub
Actions owns hosted step logs and their configured retention; the common action
owns its own release diagnostics and cleanup journal.
