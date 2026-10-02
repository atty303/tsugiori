# GitHub Actions specification basis

[The checked-in snapshot](../packages/core/src/github_actions/github_spec.json)
owns the GitHub.com verification date, immutable `github/docs` revision, source
paths and SHA-256 digests, package version, source reconciliation and item-level
coverage. `githubActionsSpec` exposes that same data to consumers. A release
uses the snapshot checked into its source; a commit-pinned consumer also pins
the specification basis. When publishing another package version, update the
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

An implemented syntax field means Tsugiori can emit native YAML. It does not
mean GitHub authorization, runner availability or remote execution has been
validated. Expression context availability is owned by
[the scope catalog](../packages/core/src/github_actions/expression_scope.ts); a
catalog entry alone does not make its workflow field available in the public
API. The coverage inventory owns the public capability assessment.

Generation, validation and scenarios consume local code and the frozen basis;
they perform no specification network requests. Raw expressions and external
workflow references remain explicit assertions. GitHub validates their actual
semantics, access and execution. Scenarios do not execute actions/scripts,
simulate runner environments, approvals, effective permissions, timeouts,
concurrency, fail-fast cancellation or actual scheduling. They do not emulate
GitHub's suppression of outputs that contain secrets. Conflicting nonempty
matrix output values fail locally because GitHub's completion order cannot be
predicted.

Use the repository's
[specification update skill](../.agents/skills/update-github-actions-spec/SKILL.md)
only for an explicit specification refresh. It fixes the new sources before
changing coverage and asks whether newly discovered capabilities should be
implemented. Unsupported fields can remain unsupported when advancing the basis.
Ordinary workflow authoring and generation do not invoke this process.
