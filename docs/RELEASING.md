# Releasing

## Setup

Create or verify the `@atty303/tsugiori` package in the `@atty303` JSR scope
with an account allowed to publish. In its JSR Settings, link `atty303/tsugiori`
as the GitHub repository. Confirm existing versions and release tags before
changing release configuration. These are operator prerequisites; the workflow
does not configure JSR or grant ownership. See
[JSR's GitHub Actions publishing documentation](https://jsr.io/docs/publishing-packages#publishing-from-github-actions).

GitHub Actions must allow `contents: write` and `id-token: write` for the
release job. Publishing uses OIDC, with provenance enabled by Deno. Do not set
`JSR_TOKEN`, pass a publish token, or disable provenance. GitHub and JSR access,
repository linkage and hosted provenance require verification during a real
release; local dry-runs do not verify them.

The workflow source lives in `.github/tsugiori.ts`. The release workflow calls
the
[generic action contract](https://github.com/atty303/repository-template/blob/124ee84f8b01ac242d16b352f2d1e37627124724/docs/release-action.md)
at a full commit SHA with `versioning: semver`. Generated YAML is committed and
checked for consistency. The root mise tasks own source builds and JSR
publishing.

## Regular operation

A push to `main` or manual **release** dispatch runs checks and tests before
calling the common action. It analyzes commits after the latest reachable
version tag. `fix`, `perf` and `revert` trigger a patch; `feat` triggers a
minor; breaking changes trigger a major. Other ordinary commit types need not
create a release. The workflow rejects other branches. Breaking changes may
produce `1.0.0` from a `0.x` baseline; there is no policy to retain `0.x` or
`0.1.x`.

`release:build` receives a stable version and absolute artifact directory. It
selects tracked consumer source under `packages/`, injects version into a
publication-only `deno.json`, adds README, validates with
`deno publish --dry-run` and creates a deterministic `tsugiori-VERSION.tar.gz`.
Development workspace, services, tests, tool configuration and credentials are
excluded. The archive has the same complete file set selected by its publish
config. No binary is built.

`release:publish` extracts that archive inside the checkout, preserving Git
repository discovery for provenance. It publishes without a token or verifies an
existing version by comparing every path, size, SHA-256 and export against
[JSR registry metadata](https://jsr.io/docs/api#registry-api). The publish
config has no development import map or JSX compiler settings; source imports
must already have their published spelling. Changes introducing publish-time
transformations require revisiting content comparison. A metadata 404 allows
publication; other metadata errors fail closed. An existing version alone never
means success, and a content mismatch is an error.

## Partial failure and retry

Keep the exact original source commit and mise/Deno versions when retrying. Use
**Re-run all jobs** on the failed Actions run so `GITHUB_SHA` and source remain
identical. A fresh manual dispatch is suitable when no version was published, or
when it selects the same original commit. Dispatching newer main content after
JSR accepted a version can fail its equality check.

The common action rolls back only tags and Releases owned by that run. A
successfully published JSR version remains. Retrying the same commit rebuilds
identical source and verifies that version before completing GitHub Release
publication. Unknown creation outcomes and conflicting resources require
operator inspection; see the common action contract. The workflow never rolls
back JSR by deleting an accepted package version.

## Local verification

Use a fresh absolute directory you own for artifacts:

```sh
mise run release:build 0.1.0 /tmp/tsugiori-release-artifacts
```

```sh
mise run release:dry-run 0.1.0 /tmp/tsugiori-release-artifacts
```

```sh
mise exec -- deno task --cwd .github generate:check
```

```sh
mise run test
```

Remove your temporary artifact directory afterwards. Dry-run validates the
package graph, exports, types and published file selection without uploading. It
does not verify effective JSR ownership, OIDC or GitHub publication.

Local release task records are bounded to 32 runs in `.release/diagnostics/`.
Inspect with `mise run release:diagnostics list`; delete with
`mise run release:diagnostics clear`. Set `RELEASE_DIAGNOSTICS=off` to disable
recording. They contain stage/timing/status/error class only and are not
exported. GitHub Actions step logs and the common action's cleanup diagnostics
remain the hosted evidence for publication and recovery.
