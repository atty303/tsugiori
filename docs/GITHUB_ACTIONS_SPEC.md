# GitHub Actions specification basis

[The checked-in snapshot](../src/github_actions/github_spec.json) owns the
GitHub.com verification date, immutable `github/docs` revision, source paths and
SHA-256 digests, package version, source reconciliation and item-level coverage.
`githubActionsSpec` exposes that same data to consumers. A release uses the
snapshot checked into its source; a commit-pinned consumer also pins the
specification basis. When publishing another package version, update the
snapshot's package version in the same change. Git history owns superseded
snapshots; configuration does not select multiple baselines.

The inventory includes workflow syntax sections, event names, context/property
and availability rows, expression sections/operators and reusable workflow
semantics. Schema 2 distinguishes source guidance from implementation units:

| Status          | Meaning                                                                              |
| --------------- | ------------------------------------------------------------------------------------ |
| `implemented`   | The implementation unit described by this row is supported.                          |
| `limited`       | A concrete subset is supported; notes identify what cannot be evaluated or verified. |
| `unimplemented` | Within product scope but absent; no delivery date is promised.                       |
| `excluded`      | A capability the product does not provide, distinct from unfinished work.            |
| `reference`     | Source explanation or navigation, not another implementation unit.                   |

Count `implemented`, `limited` and `unimplemented` rows for implementation
scope. Report `excluded` and `reference` counts separately; reference rows do
not enter the capability denominator and excluded rows are not unfinished
implementation. These are counts of inventory units, not a percentage of all
GitHub behavior. Consumers of schema 1 must handle the new statuses before
reading schema 2; the former `unsupported` category is no longer emitted.

Each row retains an immutable source and anchor. `assessment` explains evidence
or boundaries such as native authoring, fixture dependence, alternatives and
source uncertainty; `notes` defines the exact supported/missing scope.
`evidence` links current source/tests, including evidence of a limitation rather
than implying an absent feature passes. Optional `related` entries use
`domain:key` identifiers to link other rows in this same inventory.
Unimplemented analysis and scenario units live here, not in a separate backlog.
A reference heading can guide readers to its independently assessed
implementation units.

The source manifest includes transitive Markdown templates, variables and
feature gates at the same revision. Apply GitHub.com conditions when reading
source templates; GHES branches are not Tsugiori targets. `publishedSources`
records the corresponding published pages. The reconciliation field records
differences in wording between official sources and Tsugiori's retained limits.

Context availability rows retain field-scope information and links to syntax
rows; catalog presence alone does not establish public callback support.
Workflow-level env has a typed map callback in its native scope, with
declared-name/input inference and supplied-value scenario evaluation. Trigger
rows link compiler, type/scenario and actual LSP evidence. Existing implemented
rows do not claim hosted event delivery or authorization.

Template YAML can preserve `$default-branch`; GitHub replaces it when copying
the template into a target repository. No generation-time substitution is
required. Metadata generation and distribution/access administration are
excluded: catalog assets and repository visibility/user/team access are separate
from the CI job graph. The template `runs-on` replacement section is GHES-only
and is not part of this GitHub.com coverage. YAML anchor/alias emission is
unimplemented; TypeScript reuse is an alternative, not native alias generation.

## Payload type basis

The snapshot's `payloadTypes` records a separate source:
[`@octokit/openapi-webhooks-types@12.2.0`](https://github.com/octokit/openapi-webhooks).
It is an exact-version, MIT, type-only npm dependency generated from GitHub's
OpenAPI webhooks. It is not the revision or verification date of the Actions
snapshot and supplies no runtime schema/network lookup. Every frozen event and
activity is checked against it. Tsugiori owns Actions differences: removed push
commit file attributes, optional PR bodies, string dispatch payload inputs,
declaration-dependent native input values, schedule identifiers, inherited
reusable event context and image filters without undocumented payload fields.
Deno typechecking, actual LSP completion/hover/signatures and JSR publish
dry-run verify the dependency boundary; hosted delivery is not verified by those
checks.

Scenarios take partial payloads and explicit changed-file/image facts. They
model configuration applied to an already supplied event. The fixture supplier
must provide a GitHub-eligible event: default-branch restrictions, check-suite
recursion, PR merge conflicts/forks, draft release suppression, push batch
limits and workflow_run access/nesting eligibility are GitHub-owned external
facts. Path filter fixtures reflect GitHub's diff construction and first-300
limit or explicit timeout/over-1,000-commit bypass. Delivery timing, cron
frequency enforcement and DST belong to GitHub. Input defaults and
payload/native input consistency are checked locally; environment existence is
not.

An implemented syntax field means Tsugiori can emit native YAML. It does not
mean GitHub authorization, runner availability or remote execution has been
validated. Expression context availability is owned by
[the scope catalog](../src/github_actions/expression_scope.ts); a catalog entry
alone does not make its workflow field available in the public API. The coverage
inventory owns the public capability assessment.

Generation, validation and scenarios consume local code and the frozen basis;
they perform no specification network requests. Raw expressions and external
workflow references remain explicit assertions. GitHub validates their actual
semantics, access and execution. Scenarios do not execute actions/scripts,
simulate runner environments, protection-rule decisions, live authorization,
elapsed time, concurrency, fail-fast cancellation or actual scheduling. Static
and evaluated matrices support scalar/object axes and include/exclude with a
256-member limit. Strategy controls and failure tolerance expressions are
interpreted as native values. Job failure tolerance retains the execution
outcome and failed step conclusions/job.status while exposing an effective
success result to dependencies and workflow aggregation; it does not resume
steps skipped by their success gate. An optional per-job-instance environment
fixture supplies the aggregate passed/rejected protection result. Rejection
prevents steps and propagates job failure without step-derived outputs; omission
continues interpretation without proving approval. Explicit scenario
expectations enable interpretation of requested runner/concurrency settings and
run defaults; existing scenarios do not require their expression contexts.
Values are interpreted, without runner assignment, platform defaults or
filesystem checks. They do not emulate GitHub's suppression of outputs that
contain secrets. Conflicting nonempty matrix output values fail locally because
GitHub's completion order cannot be predicted. A full job-index permutation can
be supplied with completionOrder() for output aggregation; instance results stay
in expansion order.

Context authoring includes workflow artifact declaration/metadata file paths,
job check-run and job-defining workflow identity, assigned runner environment,
and the standard GITHUB_TOKEN secret without a secret-name declaration.
Scenarios use explicit workflow github fixtures, job/matrix jobRuntime() and
runner() fixtures, and runner-owned step github() overlays. Missing required
values fail at their read site. Callee job identity remains distinct from
inherited caller github identity; standard-token fixtures propagate without
leaking unpassed custom secrets. Artifact paths do not read or write files, and
fixture evaluation does not establish actual runtime availability or
authorization. Context parent rows distinguish complete local value models from
partial external fixtures and GitHub execution boundaries. Each property has its
own assessment and linked generation/type/scenario evidence; a typed reference
alone does not prove a runtime value.

`strategy` uses the native `fail-fast`, `job-index`, `job-total` and
`max-parallel` names (TypeScript bracket access); the former underscore names
are removed. Scenarios derive indices, totals and authored controls. Omitted
max-parallel uses expanded instance count under an explicit sufficient-runner
model. Readonly strategy is exposed in callbacks and results; authored settings
remain separate. GitHub's selected default and actual parallelism are not
inferred.

`github.job` and `github.token` are null in server-evaluated fields such as job
conditions, concurrency and runner selection. Initialized runner settings
(workflow/job env, job defaults and containers), steps, environment URLs and job
outputs expose strings. Scenarios derive the local execution job ID and require
an explicit `github.token` or `secrets.GITHUB_TOKEN` fixture for runner reads.
The context article's step-only wording is reconciled with initialization and
completion in pinned
[ExecutionContext](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Runner.Worker/ExecutionContext.cs)
and
[JobExtension](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Runner.Worker/JobExtension.cs).

Pure expression interpretation covers frozen literals, suffix/dynamic access,
operators, native conversions, built-ins, object filters and status calls on
supplied values. A quoted function name does not remove the implicit success
gate. Computed JSON values are closed: missing properties yield null, which
converts to an empty string. Partial external fixtures remain strict, including
nested event values; missing data is not evidence of native absence.
`hashFiles()` generation and return-value fixtures are implemented as separate
units; filesystem hashing is excluded. Step hashFiles() matches evaluated string
argument tuples in exact order and injects only the return value. Surrounding
functions/operators/interpolation still evaluate; short-circuited or skipped
calls need no fixture. Missing reached values fail at their field.
Complete-field expression overrides are not supported. Local files cannot
establish the runner workspace after actions/steps that scenarios do not
execute. Native function argument counts and malformed JSON/format strings fail
with a location-aware scenario error.

Where prose is ambiguous (JSON numbers versus hexadecimal examples, missing
access versus its string conversion), the supplemental pinned runner
[expression SDK](https://github.com/actions/runner/tree/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Sdk/Expressions),
[EvaluationResult](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Sdk/Expressions/EvaluationResult.cs),
[Index](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Sdk/Expressions/Sdk/Operators/Index.cs)
and
[ExpressionUtility](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Sdk/Expressions/Sdk/ExpressionUtility.cs)
evidence coercion, number parsing, ordinal case-insensitive comparison, filters
and lazy built-ins. `fromJSON` accepts valid JSON; this is not a claim to
emulate runner implementation resource limits or legacy non-JSON extensions.
These implementation references do not advance the frozen snapshot.

Local reusable graph validation accepts 50 distinct reachable callees and
rejects 51, including nested targets and excluding the root. Workflow identity
is the registered local definition/output path; repeated calls and matrix
members do not increase the count. External graph resolution is an explicit
assertion: external references are not fetched, so their unique count and
nesting cannot be preflighted.

External retrieval/graph/contract analysis remains unimplemented: it requires
ref resolution, authorized retrieval, pinned content and an offline validation
handoff. Native call/input/secret/output generation and supplied-value
propagation remain implemented units. Root tokenPermissions() enables a
supplied-value model of environment defaults, native workflow/job replacements,
explicit write restrictions and local caller ceilings. Effective excess demands
fail; external internals are not verified. Supplied matrix completion order
selects outputs using native ordinary/reusable rules without a scheduler.
Secret-output suppression remains unimplemented, distinct from these value
models and live GitHub authorization. Secret detection must be grounded in
official runner behavior; an ad hoc string check is not equivalent. Usage
monitoring and rerun history models are excluded because they add organization
audit operations or time-varying execution history to definition validation.

Background, wait, wait-all, cancel and parallel use the fixed Actions NGA
GitHub.com feature gate. Native run/uses and task-backed run steps retain
visible execution boundaries. Typed control references identify earlier
background work; outputs are hidden until synchronization. Parallel children use
the pre-group context, and final job outputs use the implicit wait-all. cancel
requests termination without publishing outputs or assuming a process result.
Composite internals cannot declare asynchronous steps. Scenarios interpret
fixture outcomes and environment writes at logical joins, with no scheduling,
signal or elapsed time emulation. Conflicting environment writes at one join
fail instead of assuming a completion order. Task cache/prepare completes
outside the first parallel group containing tasks.

Container/services use the frozen syntax and context scopes, including service
command/entrypoint. Scenarios interpret requests and explicitly supplied runtime
context; empty service images have no runtime entry. Aggregate initialization
failure precedes authored steps and follows native status gates. Docker startup,
health checks, network/port assignment and image compatibility remain
runner-owned. The scenario pre-step model is also grounded in
[actions/runner ContainerOperationProvider](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Runner.Worker/ContainerOperationProvider.cs),
[JobExtension](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Runner.Worker/JobExtension.cs)
and
[StepsRunner](https://github.com/actions/runner/blob/67f01c276e0a91d967ba499ce4cdc9a95efa0262/src/Runner.Worker/StepsRunner.cs).
This additional implementation reference does not change the frozen Actions
specification revision or verification date.

Cache-mode and snapshot use supplemental dependency-caching and custom-image
sources at the same frozen revision, including their transitive templates. Cache
modes are restore/save capabilities, with job declarations overriding workflow
settings and explicit caller settings capping local reusable graphs. Trigger
fallbacks remain distinct from explicit limits. Scenarios interpret requested
access without executing cache actions or proving token enforcement. PR caches
use merge-ref scope, outside the default-branch low-trust restriction.

Snapshot's string and mapping forms preserve image name, optional version and
condition. The fixed context table has no snapshot row; the custom-image example
evidences github.ref, so typed condition callbacks expose github only. Other
contexts require explicit raw assertions. Nonempty settings and literal numeric
patch versions are checked locally; remaining image/version formats are GitHub
validation boundaries. Opt-in settings interpretation exposes a generation
request after execution success and a truthy condition, without generating an
image or proving runner eligibility.

Use the repository's
[specification update skill](../.agents/skills/update-github-actions-spec/SKILL.md)
only for an explicit specification refresh. It fixes the new sources before
changing coverage and asks whether newly discovered capabilities should be
implemented. Unimplemented or excluded units can remain so when advancing the
basis. Ordinary workflow authoring and generation do not invoke this process.

Public API Doc comments explain how to author the supported GitHub capability in
Tsugiori: what to write, prerequisites, callback context and returned values,
immutable state order, evaluation timing and validation limits. Include the
GitHub meanings, defaults and caveats needed to choose the setting; link the
fixed official sources for detailed semantics. Tsugiori differences belong with
the relevant usage explanation, rather than in a mandatory trailing paragraph.
Host callbacks build definitions; GitHub resolves emitted runtime expressions;
task runtime and scenario behavior have separate Tsugiori-owned contracts.

Shared explanations belong in module or owning API docs, with links from local
APIs. README contains getting started and API navigation. Examples show the
local call or setting with prerequisites in prose; the verification harness
supplies setup while typechecking the actual published snippets. Documentation
is designed for the JSR public reference, not only compact editor hovers.

Descriptions reproduced or adapted from
[GitHub Docs](https://github.com/github/docs) are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Retain field source
links and the fixed snapshot basis. These descriptions are edited for API names
and the supported GitHub.com surface, with Markdown templates expanded from the
fixed source revision recorded in the snapshot.
