# Forge

Forge is a proposed CI pipeline authoring tool and task runtime.

The first intended CI provider is GitHub Actions. Forge is intended to let
users define GitHub Actions workflow structure in TypeScript/Deno code, export
native `.github/workflows/*.yml` files, and optionally author task functions
that CI provider steps can execute through a prepared task artifact.

Forge is currently in the design phase. There is no runtime implementation,
authoring API, compiler, package manifest, or CI setup yet.

## Problem

GitHub Actions YAML is the execution interface, but it is not a strong
authoring interface for larger pipelines. As pipelines grow, authors often
need:

- reusable typed structure
- clearer pipeline composition
- task implementations that can share ordinary language tooling
- validation before generated workflow YAML reaches GitHub
- generated YAML that is still understandable in the GitHub web UI

For the initial provider backend, Forge explores a middle ground: use
TypeScript/Deno as the authoring language, but keep GitHub Actions as the
orchestration and execution platform.

## Initial Direction

Forge is intended to compile language-native pipeline definitions into
provider-native CI configuration. The initial provider backend targets
GitHub Actions-native YAML.

Forge should not define a lowest-common-denominator pipeline model. Users
should choose the CI provider they are authoring for, and Forge should preserve
that provider's native concepts. For GitHub Actions, the provider backend owns
Actions events, workflows, jobs, steps, permissions, expression syntax, `uses`
steps, workflow file layout, and YAML emission. A future GitLab CI provider
backend would need its own native concepts rather than pretending those details
are the same.

The generated workflow should still expose jobs and steps normally in GitHub
Actions. Concepts such as `if`, `needs`, `matrix`, `workflow_call`,
`permissions`, `concurrency`, `environment`, `secrets`, and outputs should
remain GitHub Actions concepts.

Task functions are independent from pipeline authoring. A repository can use
Forge to generate provider-native workflow YAML without task functions, or use
the task runtime from handwritten CI configuration. When used together, a
GitHub Actions provider step can invoke a Forge task through the task runtime.

The pipeline source is intended to be the source of truth, while generated
`.github/workflows/*.yml` files are committed review artifacts. A local git hook
may compile pipeline source before commit, but CI should eventually verify that
committed generated YAML is not stale.

Task artifact preparation is intended to produce a content-addressed task
artifact derived from task source, dependency state, target platform, and Forge
version. Provider steps should make that artifact available through explicit
preparation work, then invoke task runtime entrypoints without fetching or
building Forge-managed task code again. Task artifact storage should be
adapter-backed so implementations such as `actions/cache`, GCR or another OCI
registry, and S3 can be substituted.

## Intended Authoring Style

This is illustrative only. The API shown here is not implemented.

```ts
import { pipeline, expr } from "@forge/core/github-actions";
import { task } from "@forge/core/task";

const testTask = task("test", async (ctx) => {
  await ctx.command("deno", ["test", "-A"]).run();
});

const uploadTestReport = task("upload-test-report", async (ctx) => {
  await ctx.command("deno", ["task", "coverage:upload"]).run();
});

const ci = pipeline("ci", {
  on: {
    pull_request: {},
    push: { branches: ["main"] },
  },
});

const test = ci.job("test", {
  runsOn: "ubuntu-latest",
  permissions: {
    contents: "read",
  },
  strategy: {
    matrix: {
      deno: ["2.x"],
    },
  },
});

test.uses("Checkout", "actions/checkout@v4");
test.uses("Setup Deno", "denoland/setup-deno@v2", {
  with: {
    "deno-version": expr.matrix("deno"),
  },
});

test.step("Test", testTask);

test.step("Upload test report", uploadTestReport, {
  if: expr.always().and(expr.failure()),
});

ci.export(".github/workflows/ci.yml");
```

## Intended Generated YAML

This is also illustrative. The exact layout is not specified yet.

```yaml
name: ci

on:
  pull_request: {}
  push:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    strategy:
      matrix:
        deno:
          - 2.x
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: ${{ matrix.deno }}

      - name: Prepare Forge task artifact
        run: forge task prepare --manifest .forge/tasks.json

      - name: Test
        run: ./.forge/task-runtime test

      - name: Upload test report
        if: ${{ always() && failure() }}
        run: ./.forge/task-runtime upload-test-report
```

## Status

Design phase only.

Current repository contents are documentation and lightweight scaffolding for
future implementation. No dependencies, runtime code, generated workflows, or
source files have been added.

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
- `.agents/skills/forge-design-review/SKILL.md`: repo-local review skill for
  checking Forge-specific design constraints
