# Example

This example is hypothetical. It shows the intended shape of Forge authoring and
generated YAML, but no API or compiler has been implemented yet.

## Hypothetical Authoring File

```ts
import { expr, runtime, workflow } from "forge";

const ci = workflow("ci", {
  on: {
    pull_request: {},
    push: {
      branches: ["main"],
    },
  },
});

runtime.step("test", async (ctx) => {
  await ctx.command("deno", ["test", "-A"]).run();
});

runtime.step("build", async (ctx) => {
  await ctx.command("deno", ["task", "build"]).run();
});

runtime.step("upload-coverage", async (ctx) => {
  await ctx.command("deno", ["task", "coverage:upload"]).run();
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

const build = ci.job("build", {
  runsOn: "ubuntu-latest",
  needs: [test],
  permissions: {
    contents: "read",
  },
});

build.uses("Checkout", "actions/checkout@v4");
build.step("Build", "build");
build.step("Upload coverage", "upload-coverage", {
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

      - name: Test
        run: forge-runtime test

  build:
    runs-on: ubuntu-latest
    needs:
      - test
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build
        run: forge-runtime build

      - name: Upload coverage
        if: ${{ github.ref == 'refs/heads/main' && success() }}
        run: forge-runtime upload-coverage
```

## Intended Properties

- `test` and `build` remain separate GitHub Actions jobs.
- Each logical Forge step becomes a normal GitHub Actions step.
- GitHub Actions still evaluates `needs`, matrix expansion, and `if:`.
- Step implementation bodies live in Deno code rather than inline YAML.
- The same runtime binary dispatches different subcommands.
