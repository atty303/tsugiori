---
name: update-github-actions-spec
description: TsugioriのGitHub Actions仕様snapshotを明示的に更新し、固定出典の差分、対応状況、Docコメントと検証を整合させる。仕様基準の更新・再確認を依頼されたときに使用する。通常のworkflow生成やAPI利用には使用しない。
---

# Update the GitHub Actions basis

## Establish the update

- Apply the repository's development and design-review guidance. Read `docs/GITHUB_ACTIONS_SPEC.md` and `packages/core/src/github_actions/github_spec.json`. Preserve its source/coverage ownership; use Git history for the previous accepted baseline. On initial introduction with no accepted baseline in history, explicitly report that no previous-baseline comparison is available; do not treat an uncommitted draft as accepted history.
- Identify the requested GitHub.com source revision or verification scope. Do not infer permission to implement every new GitHub feature, fetch specifications during normal generation, or change Glaze, GHES support, dependencies or remote refs.

## Retrieve and freeze sources

- Retrieve the official published pages listed in `publishedSources` and identify an immutable commit of `github/docs`. Fetch each corresponding source at that commit, including transitive reusable templates, variable files and feature gates. Resolve GitHub.com conditions; retain no credentials or private material.
- Confirm published section identities and the selected source contents correspond. Record a SHA-256 digest and immutable URL for each source. If a required page, fixed source or included template cannot be obtained or reconciled, stop the dependent update. Report the unavailable source and evidence; do not advance the verification date/revision or claim confirmation from a cached/live-only page.
- Compare the frozen previous and candidate sources. Inventory all workflow syntax sections, event names and activity details, expressions/operators/functions, contexts/property/availability rows and reusable-workflow constraints. Examine changed included templates as well as article bodies. Record disagreements between official sources separately from Tsugiori limitations.

## Request capability decisions

- For each new or changed item, show the source links, semantic difference, affected API/compiler/validation/scenario/docs/tests, compatibility impact and recommended treatment. Ask whether to support it only when the decision is unresolved; honor explicit existing decisions, including a request to leave new features unsupported. Do not automatically implement a new capability.
- While a decision is pending, record it as unsupported/decision pending in the candidate assessment and stop dependent implementation. Continue independent investigation. Do not publish the candidate assessment as accepted coverage or advance its verification claim while required source/compatibility decisions remain unresolved.
- For existing public-contract or compatibility changes, stop before changing the contract and ask for a choice with migration impact. Do not weaken tests, silently widen/narrow validation or reinterpret old values to avoid this decision. Previously authorized additions do not need another confirmation.
- A confirmed snapshot may include unsupported features; full implementation is not a prerequisite. Apply only the user's accepted capability and snapshot decisions.

## Apply and verify

- Update the snapshot as the single owner of version, verification date, fixed revision, source manifest, reconciliation and coverage. Keep the package version synchronized. Update affected code and source-linked public Doc comments, the expression scope catalog and living documentation together. Do not duplicate dates/revisions across APIs or create historical decision documents.
- Keep normal generation/validation/scenario offline with respect to specification acquisition. Preserve provider-native YAML and the task-runtime boundary. Add focused type, compiler, validation, scenario and generated-YAML checks for changed semantics. Use the repository's standard verification tasks and inspect generated diffs; local tests are not hosted execution evidence.
- Verify source URLs/digests, coverage identities and status/limitation consistency. Do not mark a scope-catalog item implemented unless public authoring, lowering and documented scenario support justify it. Follow development guidance for independent review and local Git evidence.
- Report the adopted revision/date, accepted and still unsupported capabilities, decisions still pending, verification results and untested GitHub boundaries. Stop if mandatory sources, compatibility decisions, tool/dependency authority or required review remain unavailable.
