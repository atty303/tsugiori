# Architecture

This document describes the implemented GitHub Actions backend and task runtime.
[README](../README.md) provides getting started and links to the detailed API
docs; [ROADMAP](ROADMAP.md) contains unfinished work.

## Execution boundary

Tsugiori builds standard `.github/workflows/*.yml` files. GitHub Actions owns
scheduling, job dependencies, matrix expansion, conditions, permissions,
secrets, environments, runners, and logs. Generated jobs and task-backed steps
remain normal, visible Actions jobs and steps. Task bodies are compiled into a
binary rather than embedded in YAML. The repository commits generated YAML and
checks it for staleness in CI.

The current implementation has one provider backend. Its API and workflow AST
model GitHub Actions concepts directly. There is no provider-neutral job or step
model and no second delivery backend.

## Example verification

The normal repository test suite checks the actual README/example sources
against the checkout's public exports in disposable project copies. The harness
supplies the documented local task preparation Action prerequisite, and runs
Deno typechecking, generation and task/scenario tests. It does not require a
published Tsugiori version or change the example sources.

The separate `test:examples:published` Deno task checks the standalone projects
against their locked JSR dependencies, including their committed generated
files. This consumer check can run after publication; it is not a prerequisite
for committing an implementation and its examples.

## Package and authoring

The root `deno.json` defines one Deno package with no default root export. The
executable `init` export bootstraps a separate workflow project in the
invocation directory. It writes only Deno configuration and the authoring
entrypoint, refuses existing configuration, lockfile or entrypoint files, and
leaves installation and generation to explicit follow-up commands. Its
dependency range is derived from the package version. Bootstrap uses the
existing bounded local command diagnostics and exports no library API.
`github-actions` is the provider umbrella for authoring, running, and scenario
testing. `github-actions/authoring`, `github-actions/run`, and
`github-actions/testing` support selective imports; `task` exposes common task
contracts. These entrypoints share a responsibility-based `src/` tree. A future
provider can have its own entrypoint and import graph without changing the
GitHub Actions entrypoint. The authoring API uses immutable facades:
`workflow()` groups trigger settings under a native `on` object; job methods
become available as the definition advances, and only a workflow with a
completed, non-empty job can reach `project()`. Jobs are authored in dependency
order, so a new job can reference completed jobs. Action steps take a metadata
contract or an implementation reference directly through
`job.uses(contractOrUses, options?)`. Contracts declare input names,
requiredness and string outputs; a string reference provides no declared output
names. Action values are strings or string expressions, while reusable workflow
call inputs retain their declared primitive types.

The authoring type surface groups optional context and materializes flat maps of
prior job and step references. Named readonly interfaces retain contract and
scenario fixture identity without repeatedly expanding their structure in IDE
hovers. These representations preserve field scopes and phase-specific
operations; consumers obtain them through inference rather than supplying type
annotations.

Authoring and task execution share an executable entrypoint. It constructs a
project value and calls `runProject()` under `import.meta.main`, passing
`project` and `entrypointUrl`. The URL identifies the entrypoint used as
generated YAML provenance and as the task artifact compilation root. The
invocation directory (`Deno.cwd()`) is the Deno project base for output paths
and local source identity. Deno tasks establish that directory; direct
invocations must use it explicitly. The project owns import resolution and its
lockfile. External projects can map the package name to one JSR version; the
YAML dependency uses a direct `jsr:` specifier in the package source. The runner
consumes the object in-process; it does not load it again. Generation uses
Deno's import resolution rather than parsing the project's Deno configuration.
The `tsugiori` task selects generation or `actions add <uses>`. Action addition
edits inline imports in exactly one Deno JSON/JSONC configuration in the
invocation directory, preserving comments and unrelated settings. Dependency
fetching and lockfile updates remain Deno's responsibility; the addition command
has no network boundary. Top-level code constructs the workflow definition; task
callbacks run only through the prepared task artifact.

The public API supports all 33 events at the frozen GitHub.com basis, including
their activities, ref/file filters, schedules, all dispatch input types and
reusable-workflow declarations, alongside the native fields listed in the
[specification coverage](GITHUB_ACTIONS_SPEC.md). Local reusable references
retain the `on.workflow_call` input/secret/output contract separately from the
input reference union across configured events, and emit normal caller jobs with
uses/with/secrets. Calls specify a native `uses` reference and a callee
definition separately; no output path is converted to a GitHub reference. The
project contains both callers and callees; lowering checks membership,
contracts, nesting and output references. Workflow env stays within each
workflow. Run defaults remain native workflow/job settings and per-step
overrides remain explicit. Workflow defaults forbid expressions; job defaults
retain their scoped expressions. Runner groups, structured environments and
expression-valued cancellation remain visible native settings. Permission
declarations cover the fixed GitHub.com scopes and read-all/write-all without
calculating authorization. The public `rawExpression()` emits an explicit
`${{ ... }}` value. The expression AST serializes literals, property references,
operators, built-in calls, and opaque `rawNode<T>()` nodes. Field callbacks
derive their available contexts from the provider scope catalog. Settings
sharing that scope accept a static object or one authoring callback returning
the complete object. Step/job env, job run defaults and concurrency, and task
input bindings use this form; individual values do not accept callbacks.
Reusable caller inputs and secrets have separate map callbacks because only the
secrets scope exposes secrets. Caller arguments remain an object, preserving
these field boundaries. All these callbacks run during authoring and retain
typed references and task presence proofs. The AST is built at each field; it is
not a host-language evaluation of GitHub runtime values. `rawNode<T>()` and
`.as<T>()` contain caller assertions, not runtime validation. Typed task JSON
references give `fromJSON()` an inferred result type while preserving its
ordinary GitHub expression rendering.

Generated property references prefer GitHub-native dot syntax, including
hyphenated names, and use brackets when required. Explicit raw expressions
retain their authored spelling.

Jobs use staged methods for conditions, matrix, concurrency, and other options.
Step output names come from typed action definitions, declared run-step outputs,
or task-step output declarations. Job outputs are authored after their steps and
become the typed `needs` surface of subsequent jobs. A task is defined directly
in `job.task({ inputs, outputs, env, run })`. Each typed input couples a
contract to a GitHub expression source. Contracts are optional: outputs default
to the shared `textValue()` contract; inputs inherit a direct typed reference
contract or default to text when the source carries no contract. Explicit input
contracts must match the source contract object. The compiler creates its step
`env` entry and rejects collisions with authored `env`. Task output writes
validate and serialize native values before appending GitHub's multiline format
to `GITHUB_OUTPUT`; the runner parses and validates input wire values before
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
Other expression nodes do not correct wire values implicitly. Conditional or
`continueOnError` task steps expose their outputs as optional to consumers, even
when an output is required during an actual task run.

## Composite action authoring and distribution

Composite definitions contain common Action metadata and a separate
`runs.using: composite` step sequence. Their completed objects implement the
existing, execution-independent `ActionContract` and retain an authoring
identity for automatic collection and local reference resolution. The common
metadata does not contain future JavaScript/Docker execution fields.

The immutable composite step builder shares workflow step construction and typed
task I/O. It requires run shells and excludes step timeouts and direct secret
names. Public inputs are strings. Public output descriptions are metadata; step
output mappings supply their wire values. Action-only projects are valid. The
compiler validates the native step sequence, metadata, declared mappings, local
placement conflicts and composite nesting/cycles. Workflows and explicit Action
roots determine the transitive set of internal Actions to generate. Identical
definitions generate once, ordered by metadata path; traversal still checks
every call path against the nesting limit. Distinct definitions cannot share an
Action directory, even with different metadata extensions.

The Action path identifies its project-relative action.yml or action.yaml file.
Its parent directory determines local uses and task payload placement, including
metadata files at the project root. Object calls resolve from the project's
checkout-relative location. Generation resolves that location from Git root to
the invocation directory, canonicalizing filesystem paths, unless an explicit
`workingDirectory` takes precedence. The compiler receives the resolved value
without invoking Git. Workflow task preparation uses the same location; task
execution cwd is independent. Without Git or an explicit location, generation
fails when checkout-relative references or workflow task preparation require it.
Explicit reference overrides retain ordinary GitHub semantics. Local composite
`uses` references resolve in the caller workspace, never implicitly in the
downloaded Action directory. No checkout or task cwd change is inserted.

Task actions distribute the reachable local source graph and discovered project
configuration beneath their own `.tsugiori/` directory. Local file topology is
preserved, absolute local module references are relocated, and configuration
includes import maps, workspace members and locks. The executable entrypoint and
registry travel with the Action, so preparation does not load caller-side
authoring files. Remote dependencies remain pinned by the copied lockfiles;
runtime data and computed imports beyond the module graph require explicit
consumer-owned distribution.

The composite emits separate pinned cache and Bash preparation steps, followed
by each task invocation. Preparation runs inside the bundled project; tasks use
normal composite working-directory semantics. The source identity is computed
from the relocated local modules with the existing format, package identity and
`cacheVersion`. Actions from one project carry its shared registry; identical
payloads reuse the artifact key while scoped step IDs and absolute runtime paths
remain independent. Restore validates the current payload before using the
binary. The bridge matches the distributed workflow preparation script, with
byte equality enforced by a conformance test.

## Generation and validation

The compiler lowers workflow and composite authoring data to native GitHub
Actions steps, validates it, and emits deterministic YAML and Action payloads.
Authored maps retain JavaScript key enumeration order; jobs, dependencies, and
runner labels retain their specified order. A self-hosted label, matched without
case sensitivity, must be first when present; validation reports misplaced
labels rather than reordering them. Fixed schema property ordering is unchanged.
The YAML serializer selects plain, quoted, or block scalars while preserving
string values, including command whitespace and trailing newlines. Workflow and
composite step spacing, and workflow Action reference comments, are attached to
YAML document nodes. Each workflow is identified solely by its project-relative
output path. Generation does not restrict its directory; authors ensure GitHub
workflow placement. Each generated file starts with a source comment.

`generate` writes the configured outputs. `generate --check` compares expected
bytes to configured files and reports missing or changed outputs. It does not
scan directories or modify files. `--output <path>` limits the check to one
configured file. Normal generation does not delete extra files. Action checks
include every configured payload file. The checked-in
[CI entrypoint](../.github/workflows.ts) emits the
[CI workflow](../.github/workflows/ci.yml); CI runs `tsugiori generate --check`.

## Scenario interpretation

The testing API lowers a workflow with the same compiler path used for YAML
generation and interprets the validated GitHub Actions workflow AST. Its
scenario builder preserves the workflow's job IDs, step IDs, task contracts, and
matrix types for editor completion. A scenario provides referenced external
contexts and fixtures for reached authored steps. Local calls recursively
interpret callee workflows with separate inputs, secrets and env; external calls
use explicit fixtures. The caller github context stays unchanged. Call results
and workflow outputs retain their native boundaries. The interpreter builds
`steps`, `needs`, and `matrix` contexts, evaluates supported expressions,
serializes typed task outputs to GitHub wire values, and checks independent
expectations against the resulting state. Generated task preparation steps
default to success and support an explicit outcome override.

The interpreter checks trigger filters, conditions, step order, matrix
expansion, job dependencies, status and `continue-on-error`, and value
propagation. It does not call authored step or task bodies. It does not model
runner behavior, effective permissions, protection-rule decisions, timeouts,
concurrency effects, or actual parallel execution. Explicit expectSettings(),
expectConcurrency() and expectRunSettings() calls enable interpretation of
runner requests, concurrency expressions and effective run settings from
explicit workflow/job/step values; platform shell defaults and filesystem
existence are not inferred. Environment name resolves before steps and URL after
steps. An optional per-instance environment protection fixture supplies the
aggregate passed/rejected result. Rejection runs no steps, produces job failure
and omits step-derived job outputs; failure flows through dependencies and local
reusable calls. Omission retains ungated interpretation and does not prove
actual approval. Pending, reviewer eligibility, timers and protection-rule
calculation are not modeled. Evaluated unknown expression forms and
`hashFiles()` need a field-specific scenario value; unsupported forms never
silently succeed.

### Trigger and payload contracts

The fixed Actions snapshot owns event names, activities and trigger settings.
The separately pinned, type-only `@octokit/openapi-webhooks-types@12.2.0` owns
webhook shapes. Actions adapters remove push commit file lists, retain optional
PR bodies, model dispatch payload inputs as strings, provide delivered schedule
identifiers, and inherit the caller's event for reusable workflows. No
undocumented image payload properties are invented; image filter facts have a
separate scenario fixture. Generation and scenarios do not fetch either source.

Workflow input metadata carries event selection through field scopes.
`eventIs(github, name, activity?)` emits a native runtime condition and supplies
proofs to subsequent job fields and conditionally executed task fields.
Conjunction retains proofs; disjunction, negation and assertions do not. The
ordinary TypeScript `if` statement only runs during authoring and cannot narrow
a future GitHub event. Named `EventRef` projections keep root and nested payload
hovers compact without erasing optional, nullable or activity-specific fields.

Scenarios consume delivered event fixtures, not event sources. They require
activity values instead of inventing a PR action. Branch/path filters combine;
ordered negation can exclude and reinclude matches. `changedFiles()` supplies
GitHub's considered file list (first 300) or an explicit
timeout/over-1,000-commit bypass. The fixture supplier owns diff provenance: PR
three-dot, existing push two-dot, and new-branch comparisons. `imageVersion()`
supplies image name and version for that event's filters. Missing required reads
identify the trigger or expression site and the missing property. Default input
values are declaration semantics, not arbitrary payload completion. Schedule
fixtures select a configured cron; they do not advance a clock.

### Authoring migration

Ref exclusion keys use GitHub's literal `"branches-ignore"`, `"tags-ignore"` and
`"paths-ignore"`. Repeated job `when()` calls now combine with AND, including
reusable caller jobs, so earlier event proofs remain valid. Combine alternatives
explicitly with `or()` in one condition. Use `eventIs()` for payload selection;
a raw event-name comparison still emits normally but carries no narrowing proof.
Provide an explicit action fixture for activity events, use caller events in
reusable scenarios, and put path facts in `changedFiles()`. Existing input and
job-output contracts continue to propagate through these event scopes.

## Task artifact lifecycle

Compiler lowering records inline task functions in a registry. A task-backed
step gets an entrypoint of the form `<workflow-path>/<job-id>/<task-id>` (or
`<action-path>/composite/<task-id>`). An explicit step ID is also the task ID.
Otherwise, ID-less tasks receive available `task-N` IDs in appearance order
within the job or composite Action, skipping explicit task IDs.

Each task-backed job contains a pinned `actions/cache` step by default, followed
by a normal composite preparation Action distributed from
`actions/task-prepare/`. A project-level cache factory can provide native `uses`
and `run` steps before preparation, including inside task-backed composite
Actions. The factory receives the transport path and key; it owns its steps'
inputs and failure policy. The backend embeds a generate-time source key in YAML
and combines it with GitHub's runner OS and architecture for cache delivery.
Composite Actions use the relocated payload's source key before the factory
runs. Generation and fallback builds share the `deno info` local-source identity
calculation. `generate --check` guards source-key changes as well as structure.

The compiled artifact owns hit validation and immutable runtime publication.
Build-time metadata is embedded using a preload module, calculated before that
module is created so it cannot hash itself. The original executable entrypoint
and its `import.meta.main` behavior are preserved. Metadata contains the source
key, project-relative module paths and hashes, target, and original entrypoint
argument. A runtime-owned format-4 manifest contains source and platform keys,
target, Deno and Tsugiori versions, entrypoints, and checksum. The restored
binary validates these inputs and checkout files directly without an external
Deno, dependency resolution, or fetching. Published runtimes remain in place for
concurrent readers; corrupt paths recover to a separate key directory.

The shell owns executable startup and fallback tool acquisition. Restore miss,
artifact validation failure, or startup failure leads to source preparation.
Tracked source changes or missing files are terminal YAML drift, reported by the
compiled executable before the shell selects or installs Deno. Source
preparation computes the current source key and rejects a mismatch with YAML
before building or publishing a runtime. No YAML generation or comparison is
performed during preparation; `generate --check` retains that responsibility. A
startup failure forces a rebuild and prevents reuse of a published runtime with
the failed binary checksum. Rejected checksums are retained outside immutable
runtime directories and consulted by both restore and source preparation. It
reuses the Deno binary on PATH unchanged. If absent, it downloads the official
platform ZIP at the pin in the Action, verified against this repository's mise
toolchain, into an invocation-owned temporary directory. An old PATH binary
fails without replacement. The selected absolute binary path is propagated to
graph and compile subprocesses; the shell cleans up its download and does not
change the application's toolchain or later steps' PATH. Only the source
`runProject` gate enforces the minimum Deno version. The compiled path does not
check external Deno. Task-body execution happens in subsequent native Actions
steps and never triggers preparation fallback.

The Action passes the resolved checkout-relative project location to its own
script, referenced through the Action's absolute directory. Its `runtime-path`
output forwards the inner prepare step's output. Normal steps and task bodies
retain native defaults. Transport artifacts live under
`runner.temp/tsugiori-artifacts/<source-key>-<runner-os>-<runner-arch>/`.
Runner-local build caches and immutable runtimes live under the platform cache's
`tsugiori/` directory (`XDG_CACHE_HOME` overrides the base). Each task receives
the runtime's absolute path via the prepare step's output.

Automatic identity covers reachable local `file:` modules, including
project-external imports. Paths are project-relative rather than
machine-absolute. Source identity also includes artifact format, Tsugiori
package identity, and `cacheVersion`; runtime identity hashes the source key and
Deno target together. Both use SHA-256, encoded as uppercase Base36 padded to 50
digits, with `S` and `A` prefixes respectively. Module hashes and binary
checksums retain hexadecimal encoding. Remote modules, lockfiles, and Deno
settings and versions remain excluded; authors increase `cacheVersion` for those
inputs. This is a reuse contract, not a complete reproducibility claim.
Linux/macOS X64/ARM64 map to their corresponding Deno targets; Windows task
artifacts remain unsupported.

GitHub's transport key is
`tsugiori-task-<source-key>-<runner-os>-<runner-arch>`. The best-effort cache
action saves after a successful job without an exact hit. Source drift fails the
prepare step and prevents task execution and successful job cache saving.
Preparation never writes a new artifact under a stale key; the existing
transport directory is left intact. A subsequent generate updates the remote
key. A corrupt exact remote entry cannot be overwritten; delete it or change its
key. GitHub's cache scope and write authorization own the remote authenticity
boundary.

## Diagnostics

Source commands, artifact restore, and task dispatch use a bounded local
recorder, enabled unless `TSUGIORI_DIAGNOSTICS=0`. It retains up to 32 records
under `<platform-cache>/tsugiori/diagnostics/`, preferring failures, and caps
each run at 64 operations. A capped record is marked partial. Records contain
command, runtime/platform, stable stage and error types, and cache identities;
task values and raw exceptions are excluded. Recording failure reports
degradation without changing the command result. `RUNNER_DEBUG=1` also displays
records. There is no remote exporter. Users can list/read records as JSON and
delete the directory to clear them.

The Bash bridge separately retains up to 32 bootstrap stage histories under
`runner.temp/tsugiori-diagnostics/`, with the same opt-out. It distinguishes
miss, validation failure, startup failure, selection/download, and final prepare
result. Import or top-level entrypoint failures precede the command recorder;
the bridge records their startup/fallback outcome. Shell evidence lasts only as
long as runner temporary storage.

The scenario library emits workflow operations to an optional host-owned sink;
consumer absence or failure does not alter results. It owns no provider,
recording store, or exporter. Deterministic compiler/schema failures retain
typed diagnostics and can be rerun safely from the same authoring input.

## Type service

`services/type-service/` owns the official type service at
`https://tsugiori.atty303.workers.dev`, a Cloudflare Worker independent of the
consumer package. Its current resource is `/github/actions/v1/`; it does not
execute actions or workflows. Mutable references resolve first; full SHA
references skip resolution and read `action.yml` (then `action.yaml` on a 404)
at that SHA. A pure, versioned metadata validator/emitter produces standalone
TypeScript data, omitting `runs`. The plain structural contract types live in
the GitHub Actions core; no Tsugiori runtime identity crosses the distribution
boundary.

The HTTP layer redirects mutable references to URLs containing generator
version, resolved SHA, and original reference. These immutable identities pin
the `uses` default to the SHA. The optional `ref` query becomes `originalRef`
annotation and a safe inline YAML comment; it cannot change the metadata or
execution target. SHA requests return directly. Different annotations have
distinct cache identities and module checksums. Cloudflare's default Cache API
holds five-minute ref redirects and year-long modules; neither is durable
storage. Cache failure permits normal upstream retrieval, while an upstream
failure after redirect expiry returns an error. The generator's version owns its
emitted bytes and parser dependency; changing either output requires a new
version and retaining the old generator. Metadata parsing uses the YAML 1.2 core
schema: dates remain strings, and merge keys are not expanded. Unknown versions
fail explicitly.

The service authenticates public GitHub API requests with a dedicated OAuth
App's client ID and client secret and accepts no user credentials. Missing
bindings or failed authentication fail explicitly without unauthenticated
fallback. Credentials are used only in GitHub API headers; they never enter
contract generation or diagnostic records. Effective API limits and account
permissions are operational properties of the deployed service.

The deployment configuration names the Worker `tsugiori`, enables workers.dev,
Workers Cache before execution, Cloudflare Workers Logs including invocation
logs, and Issues for grouped production failures. Response Cache-Control headers
govern cache lifetime; the Worker's Cache API remains independent. The service
uploads a browser-targeted Deno bundle. Consumer imports never load Worker code.
Wrangler and its Node runtime are pinned in the repository's mise toolchain.
Wrangler's custom build hook builds and watches source for local development and
dry-run upload validation. Release builds retain a local bundle for later
deployment without adding it to GitHub Release assets; deployment skips the
custom build using this prebuilt bundle. Local development runs the Worker in
workerd on loopback with remote bindings disabled. The standard verification
path validates the upload without publishing. Wrangler usage metrics are
disabled by default.

Requests retain at most 32 causal stage records per run and 128 runs per
isolate, evicting successful runs first. Records contain operation names, parent
IDs, durations, completion and error classes; no requested URL, metadata,
headers, input values or raw exceptions are stored. The host-owned diagnostic
store exposes listing and deletion in process and has no public route or remote
exporter. `DIAGNOSTICS=off` disables Worker recording. Isolate teardown loses
these bounded diagnostic records. This is local diagnosis, not a durable
operational audit.

## Package release boundary

`.github/workflows.ts` imports action metadata from the official type service
through `/github/actions/v1/` URLs and `#actions/` aliases, retaining the
existing action commit SHAs and a checked-in Deno lockfile. It owns CI and the
release workflow; generated YAML stays visible and checked in. Regular releases
delegate version selection, tag/Release ownership, artifact validation and
rollback to the commit-pinned repository-template action. Root mise release
tasks own source selection, version injection and JSR publication from the
extracted archive. Development metadata is never written back by a release.
Packaging verifies relevant package, Action, and toolchain files match HEAD and,
on Actions, that HEAD matches the workflow SHA. It reads the immutable Git tree
and stamps that SHA into the existing package identity module. Generated
preparation references use this release commit; they never consult the
consumer's Git HEAD. Tsugiori's own project explicitly selects a checkout-local
Action to avoid self-referential generated commit keys. Task-backed generation
without either release identity or a local override fails.

`release:build` also builds the Worker into ignored local `dist/` storage before
any publication. `release:publish` publishes or verifies the JSR version, then
deploys that bundle with Wrangler. Deployment failure fails the release; JSR
versions remain published and identical-source retries can retry deployment. The
common action alone decides whether a release is needed. Old release reruns may
replace current Worker code and secrets; package, Worker and GitHub Release
publication are not atomic.

fnox owns age-encrypted deployment and OAuth secrets in `fnox.toml`. Public
recipients permit both a dedicated CI identity and a personal identity to
decrypt the same ciphertext. Account and OAuth client IDs are separate plaintext
configuration. The release action receives only `FNOX_AGE_KEY` from Actions;
other steps do not receive that key. Noninteractive fnox execution uses the
repository config without global configuration, strips the decryption identity
from its child, and supplies a Cloudflare account API token for deployment. The
OAuth secret goes into a mode-0600 temporary secrets file for Wrangler's
code-and-secret deployment and is removed on success or failure. The build
receives neither decrypted secrets nor the decryption identity. Normal fnox and
Wrangler output is visible in release logs; Wrangler debug payload sanitization
is enforced and disk logs are disabled. Bounded release diagnostics retain stage
and status only. Real recipients and credentials are operator configuration, not
repository defaults.

JSR retries compare the complete registry file manifest (path, byte count and
SHA-256) and exports against the source archive. The publication config excludes
workspace and import-map settings; sources use explicit relative, `node:`,
`npm:`, or `jsr:` imports. Adding publish-time transformations requires updating
this comparison contract. Registry versions are never removed on failure.

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
