# Example

This example uses the implemented initial authoring and task-runtime subset.

## Authoring File

```ts
import { defineTsugiori, pipeline } from "@tsugiori/core/github-actions";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
});

const test = ci.job("test", {
  runsOn: "ubuntu-latest",
});

test.uses("Checkout", "actions/checkout@v4");
test.run("Verify tools", "deno --version && command -v tsugiori");
test.task("Test", async (ctx) => {
  ctx.logger.info(`Running tests in ${ctx.cwd}`);
  const result = await new Deno.Command("deno", {
    args: ["test", "-A"],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`Tests failed with ${result.code}.`);
});

const build = ci.job("build", {
  runsOn: "ubuntu-latest",
  needs: [test],
});

build.uses("Checkout", "actions/checkout@v4");
build.run("Verify tools", "deno --version && command -v tsugiori");
build.task("Build", async () => {
  const result = await new Deno.Command("deno", {
    args: ["task", "build"],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) throw new Error(`Build failed with ${result.code}.`);
});

export default defineTsugiori({ pipelines: [ci] });
```

## Generated Shape

The exact SHA-256 values are derived from each job's ordered task names.

```yaml
name: ci

on:
  pull_request: {}
  push: {}

jobs:
  build:
    runs-on: ubuntu-latest
    needs:
      - test
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Verify tools
        run: deno --version && command -v tsugiori
      - name: Prepare task artifact
        run: tsugiori task prepare --config './tsugiori.ts' --expect-layout 'ci/build=sha256:<digest>'
      - name: Build
        run: ./.tsugiori/task-runtime ci/build/task-1
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Verify tools
        run: deno --version && command -v tsugiori
      - name: Prepare task artifact
        run: tsugiori task prepare --config './tsugiori.ts' --expect-layout 'ci/test=sha256:<digest>'
      - name: Test
        run: ./.tsugiori/task-runtime ci/test/task-1
```

## Properties

- `test` and `build` remain separate GitHub Actions jobs.
- Each task-backed provider step becomes a normal GitHub Actions step.
- GitHub Actions still evaluates `needs` and step ordering.
- Task function bodies live in Deno code rather than inline YAML.
- The generated YAML is committed and reviewed.
- A visible preparation step makes the task artifact available.
- The task runtime dispatches readable, job-scoped task entrypoints.
- Job-layout fingerprints reject stale task order before dispatch.
- The initial repository-local cache uses a runtime-owned JSON manifest and
  remains behind the cache adapter boundary.
