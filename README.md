# Tsugiori

Tsugiori is a proposed CI pipeline authoring tool and task runtime.

The first intended CI provider is GitHub Actions. It is intended to let
users define GitHub Actions workflow structure in TypeScript/Deno code, export
native `.github/workflows/*.yml` files, and optionally author task functions
that CI provider steps can execute through a prepared task artifact.

Tsugiori has an initial GitHub Actions authoring and task-runtime slice. It can
load a TypeScript authoring module, generate deterministic workflow YAML,
prepare a content-addressed Deno task binary through a repository-local cache,
restore and save those cache entries through generated `actions/cache` steps,
and dispatch inline task functions. The repository now uses a generated
workflow to exercise that slice on GitHub Actions. Native stale-output check
mode, broader GitHub Actions syntax, and other artifact delivery backends are
not implemented yet.

## Problem

GitHub Actions YAML is the execution interface, but it is not a strong
authoring interface for larger pipelines. As pipelines grow, authors often
need:

- reusable typed structure
- clearer pipeline composition
- task implementations that can share ordinary language tooling
- validation before generated workflow YAML reaches GitHub
- generated YAML that is still understandable in the GitHub web UI

For the initial provider backend, the project explores a middle ground: use
TypeScript/Deno as the authoring language, but keep GitHub Actions as the
orchestration and execution platform.

## Initial Direction

The compiler is intended to turn language-native pipeline definitions into
provider-native CI configuration. The initial provider backend targets GitHub
Actions-native YAML.

The project should not define a lowest-common-denominator pipeline model.
Users should choose the CI provider they are authoring for, and each provider
backend should preserve that provider's native concepts. For GitHub Actions,
the provider backend owns Actions events, workflows, jobs, steps, permissions,
expression syntax, `uses` steps, workflow file layout, and YAML emission. A
future GitLab CI provider backend would need its own native concepts rather
than pretending those details are the same.

The generated workflow should still expose jobs and steps normally in GitHub
Actions. Concepts such as `if`, `needs`, `matrix`, `workflow_call`,
`permissions`, `concurrency`, `environment`, `secrets`, and outputs should
remain GitHub Actions concepts.

The implemented slice supports inline task-backed pipeline steps. Handwritten
workflow integration remains a future provider-specific decision; the current
preparation commands are generated implementation details rather than a public
cross-provider contract.

The pipeline source is intended to be the source of truth, while generated
`.github/workflows/*.yml` files are committed review artifacts. A local git hook
may compile pipeline source before commit, but CI should eventually verify that
committed generated YAML is not stale.

Task artifact preparation is intended to produce or restore a
content-addressed task artifact derived from task source, dependency state,
target platform, tool version, and artifact form. The artifact may be a
prepared runtime form such as an OCI image. Provider steps should make that
artifact available through explicit preparation work, then invoke task runtime
entrypoints without fetching or building managed task code again. Task artifact
delivery is provider-owned. The GitHub Actions backend emits visible
`actions/cache` restore and save steps. A shared delivery abstraction should be
extracted only after another backend such as an OCI registry or S3 requires it.

## Initial Authoring API

```ts
import { defineTsugiori, pipeline } from "@tsugiori/core/github-actions";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
  permissions: { contents: "read" },
});

const test = ci.job("test", {
  runsOn: "ubuntu-24.04",
});

test.uses("Checkout", "actions/checkout@<commit-sha>", {
  "persist-credentials": false,
});
test.run("Verify tools", "deno --version && command -v tsugiori");
test.task("Test", async (ctx) => {
  ctx.logger.info(`Running tests in ${ctx.cwd}`);
  const command = new Deno.Command("deno", {
    args: ["test", "-A"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await command.output();
  if (!result.success) throw new Error(`Tests failed with ${result.code}.`);
});

export default defineTsugiori({ pipelines: [ci] });
```

Build the current-host CLI and generate the configured workflow:

```bash
mise run build
```

```bash
./dist/tsugiori generate --config ./tsugiori.ts
```

The generated job keeps setup steps visible, resolves the artifact key, restores
the newest matching `actions/cache` generation, prepares and validates the
artifact, and conditionally saves a new generation before the first task-backed
step. Each task remains a separate invocation such as
`./.tsugiori/task-runtime ci/test/task-1`. The preparation step contains a
job-layout fingerprint so stale task ordering fails before dispatch.

The initial task artifact is compiled with Deno `-A`. Authoring module
top-level code must only construct deterministic definitions; task work belongs
inside `job.task` functions. The generated invocation currently targets POSIX
runners.

When GitHub Actions debug logging is enabled and exposes `RUNNER_DEBUG=1`, each
CLI or task-runtime invocation writes one bounded JSON diagnostic record to
standard error. Normal runs do not emit structured diagnostics or retain
diagnostic files.

## Status

Phase 1 stale-output checking and later provider-native GitHub Actions concepts
remain in progress. The initial Phase 2 vertical slice implements inline task
authoring, task registry lowering, local artifact preparation and caching,
manifest verification, generated `actions/cache` delivery, and task dispatch.
It has local compiled-binary E2E coverage. The earlier local-cache workflow ran
successfully for push and pull request events on a GitHub-hosted
`ubuntu-24.04` runner; the new remote-cache path still requires a live run.

## Codex-Driven Development

This repository includes lightweight structure for AI-assisted development with
Codex:

- `AGENTS.md`: durable repository guidance loaded by Codex
- `docs/CODEX_WORKFLOW.md`: recommended Codex work loop and context packs
- `docs/TASKS.md`: AI-friendly task queue
- `docs/PROMPTS.md`: reusable prompts for planning, ADRs, implementation, and
  review
- `docs/GLOSSARY.md`: current design vocabulary for pipelines, providers,
  tasks, and artifacts
- `docs/REPOSITORY_LAYOUT.md`: proposed future source, package, test, fixture,
  and example layout
- `.agents/skills/design-review/SKILL.md`: repo-local review skill for checking
  repository design constraints
