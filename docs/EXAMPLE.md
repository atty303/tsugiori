# Example

This example is hypothetical. It shows the intended shape of authoring source
and generated YAML, but no API or compiler has been implemented yet.

## Hypothetical Authoring File

```ts
import { pipeline, expr } from "@tsugiori/core/github-actions";
import { task } from "@tsugiori/core/task";

const testTask = task("test", async (ctx) => {
  await ctx.command("deno", ["test", "-A"]).run();
});

const buildTask = task("build", async (ctx) => {
  await ctx.command("deno", ["task", "build"]).run();
});

const uploadCoverageTask = task("upload-coverage", async (ctx) => {
  await ctx.command("deno", ["task", "coverage:upload"]).run();
});

const ci = pipeline("ci", {
  on: {
    pull_request: {},
    push: {
      branches: ["main"],
    },
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

const build = ci.job("build", {
  runsOn: "ubuntu-latest",
  needs: [test],
  permissions: {
    contents: "read",
  },
});

build.uses("Checkout", "actions/checkout@v4");
build.step("Build", buildTask);
build.step("Upload coverage", uploadCoverageTask, {
  if: expr.github("ref").eq("refs/heads/main").and(expr.success()),
});

ci.export(".github/workflows/ci.yml");
```

## Hypothetical Generated YAML

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

      - name: Prepare task artifact
        run: tsugiori task prepare

      - name: Test
        run: ./.tsugiori/task-runtime test

  build:
    runs-on: ubuntu-latest
    needs:
      - test
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Deno
        uses: denoland/setup-deno@v2
        with:
          deno-version: 2.x

      - name: Prepare task artifact
        run: tsugiori task prepare

      - name: Build
        run: ./.tsugiori/task-runtime build

      - name: Upload coverage
        if: ${{ github.ref == 'refs/heads/main' && success() }}
        run: ./.tsugiori/task-runtime upload-coverage
```

## Intended Properties

- `test` and `build` remain separate GitHub Actions jobs.
- Each task-backed provider step becomes a normal GitHub Actions step.
- GitHub Actions still evaluates `needs`, matrix expansion, and `if:`.
- Task function bodies live in Deno code rather than inline YAML.
- The generated YAML is intended to be committed and reviewed.
- A visible preparation step makes the task artifact available.
- The task runtime dispatches different task entrypoints.
- Task artifact storage is intended to be replaceable through cache
  adapters.
- The exact task artifact metadata or manifest representation is intentionally
  unspecified here.
