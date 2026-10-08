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
semantics. Each item records `implemented`, `limited` or `unsupported`, a
limitation and an immutable source. The source manifest includes transitive
Markdown templates, variables and feature gates at the same revision. Apply
GitHub.com conditions when reading source templates; GHES branches are not
Tsugiori targets. `publishedSources` records the corresponding published pages.
The reconciliation field records differences in wording between official sources
and Tsugiori's retained limits.

`assessment` distinguishes `supported`, `implementation-gap`, `alternative`,
`outside-product`, `github-runtime` and `reference`; an item can have more than
one assessment. `status` retains the existing capability summary. Headings,
deprecated `pull_request_comment` guidance, templates and YAML sharing are
classified explicitly instead of being counted as missing trigger events.
Trigger rows link their compiler, type/scenario and actual LSP evidence.

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
simulate runner environments, protection-rule decisions, effective permissions,
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
GitHub's completion order cannot be predicted.

Use the repository's
[specification update skill](../.agents/skills/update-github-actions-spec/SKILL.md)
only for an explicit specification refresh. It fixes the new sources before
changing coverage and asks whether newly discovered capabilities should be
implemented. Unsupported fields can remain unsupported when advancing the basis.
Ordinary workflow authoring and generation do not invoke this process.

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
