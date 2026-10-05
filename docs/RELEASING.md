# Releasing

## Setup

Create or verify the `@atty303/tsugiori` package in the `@atty303` JSR scope
with an account allowed to publish. In its JSR Settings, link `atty303/tsugiori`
as the GitHub repository. Confirm existing versions before bootstrap. These are
operator prerequisites; the workflow does not configure JSR or grant ownership.
See
[JSR's GitHub Actions publishing documentation](https://jsr.io/docs/publishing-packages#publishing-from-github-actions).

GitHub Actions must allow `contents: write` and `id-token: write` for the
release job. Publishing uses OIDC, with provenance enabled by Deno. Do not set
`JSR_TOKEN`, pass a publish token, or disable provenance. GitHub and JSR access,
repository linkage and hosted provenance require verification during the real
initial release; local dry-runs do not verify them.

Both workflow sources live in `.github/tsugiori.ts`. `releaseEnabled = false`
keeps regular publication disabled while the manual `release-initial` workflow
is available. Both use the same concurrency group and root mise tasks. The
regular workflow calls the
[generic action contract](https://github.com/atty303/repository-template/blob/124ee84f8b01ac242d16b352f2d1e37627124724/docs/release-action.md)
at a full commit SHA with `versioning: semver`.

## Initial 0.1.0 release

1. Land the generated workflows and their sources on `main`. Confirm the regular
   workflow still has `releaseEnabled = false`, and no other release version
   exists. Ensure the source license (`MIT`) reflects the intended terms.
2. Manually run **release-initial** on `main`. It checks generated YAML and runs
   repository checks/tests, builds the versioned source archive, reserves
   `v0.1.0` at the input commit, publishes JSR through OIDC, then creates and
   verifies the GitHub Release and its archive. No version update commit is
   made.
3. Verify JSR version `0.1.0`, its provenance and GitHub repository linkage,
   GitHub tag commit, and the non-draft Release's source archive. A successful
   dry-run or reserved tag alone does not establish completion.
4. After successful publication, delete the `initialRelease` definition from
   `.github/tsugiori.ts`, remove it from the config's `pipelines`, delete
   `scripts/release/bootstrap.ts` and its bootstrap tests, and set
   `releaseEnabled = true`. Keep the shared package/archive/diagnostic tasks.
5. Regenerate YAML, explicitly remove the obsolete owned YAML (generation does
   not delete extra files), and verify everything. Commit these changes together
   and land them on `main`:

```sh
mise exec -- deno task --cwd .github generate
```

```sh
rm .github/workflows/release-initial.yml
```

```sh
mise exec -- deno task --cwd .github generate:check
```

```sh
mise run test
```

The existing `v0.1.0` tag becomes the normal SemVer baseline. Breaking changes
after it may produce `1.0.0`; there is no policy to retain `0.x` or `0.1.x`.

## Regular operation

After activation, a push to `main` or manual **release** dispatch runs checks
and tests before calling the common action. It analyzes commits after the latest
reachable version tag. `fix`, `perf` and `revert` trigger a patch; `feat`
triggers a minor; breaking changes trigger a major. Other ordinary commit types
need not create a release. Both workflows reject other branches.

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

The initial workflow never deletes or overwrites tags, Releases or assets. If
`v0.1.0` exists, its commit must match the input SHA. A partial initial Release
is resumable only when its exact bootstrap marker, commit and archive hash
match; missing assets can be uploaded into that draft. Existing assets must
match digest and size. An unrelated Release, conflicting tag, extra asset,
mismatched content or asset left in an incomplete upload state stops recovery.
Inspect those resources and resolve their ownership manually; do not delete
resources merely to make the retry pass. An ambiguous network failure requires
inspection before rerunning. Do not activate regular releases until bootstrap is
complete. A failed initial tag is retained for recovery.

For regular releases, the common action rolls back only tags and Releases owned
by that run. A successfully published JSR version remains. Retrying the same
commit rebuilds identical source and verifies that version before completing
GitHub Release publication. Unknown creation outcomes and conflicting resources
require operator inspection; see the common action contract. Neither workflow
rolls back JSR by deleting an accepted package version.

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
