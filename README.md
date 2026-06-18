# Forge

Forge is a proposed GitHub Actions compiler and typed CI runtime authoring tool.

The intended direction is to let users define both GitHub Actions workflow
structure and step implementation entrypoints in TypeScript/Deno code, then
export native `.github/workflows/*.yml` files.

Forge is currently in the design phase. There is no runtime implementation,
authoring API, compiler, package manifest, or CI setup yet.

## Problem

GitHub Actions YAML is the execution interface, but it is not a strong
authoring interface for larger workflows. As workflows grow, authors often need:

- reusable typed structure
- clearer workflow composition
- step implementations that can share ordinary language tooling
- validation before a workflow reaches GitHub
- generated YAML that is still understandable in the GitHub web UI

Forge explores a middle ground: use TypeScript/Deno as the authoring language,
but keep GitHub Actions as the orchestration and execution platform.

## Initial Direction

Forge is intended to compile language-native workflow definitions into
Actions-native YAML.

The generated workflow should still expose jobs and steps normally in GitHub
Actions. Concepts such as `if`, `needs`, `matrix`, `workflow_call`,
`permissions`, `concurrency`, `environment`, `secrets`, and outputs should
remain GitHub Actions concepts.

Step bodies are not intended to be inlined into YAML. Each logical step should
compile to a normal GitHub Actions step that invokes the same compiled Deno
runtime binary with a different subcommand.

## Intended Authoring Style

This is illustrative only. The API shown here is not implemented.

```ts
import { expr, workflow } from "forge";

const ci = workflow("ci", {
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

test.step("Test", "test");

test.step("Upload test report", "upload-test-report", {
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

      - name: Test
        run: forge-runtime test

      - name: Upload test report
        if: ${{ always() && failure() }}
        run: forge-runtime upload-test-report
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
- `.agents/skills/forge-design-review/SKILL.md`: repo-local review skill for
  checking Forge-specific design constraints
