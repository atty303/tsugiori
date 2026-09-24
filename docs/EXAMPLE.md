# Example

This example uses the implemented initial authoring and task-runtime subset.

## Authoring File

```ts
import {
  defineAction,
  defineTsugiori,
  pipeline,
} from "@tsugiori/core/github-actions";

const checkout = defineAction({
  uses: "actions/checkout@v4",
  inputs: {},
  outputs: [],
});

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
})
  .job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .uses({ name: "Checkout", uses: checkout({}) })
      .run({
        name: "Verify tools",
        run: "deno --version && command -v tsugiori",
      })
      .task({
        name: "Test",
        task: async (ctx) => {
          ctx.logger.info(`Running tests in ${ctx.cwd}`);
          const result = await new Deno.Command("deno", {
            args: ["test", "-A"],
            stdout: "inherit",
            stderr: "inherit",
          }).output();
          if (!result.success) {
            throw new Error(`Tests failed with ${result.code}.`);
          }
        },
      })
  )
  .job("build", ({ job, jobs }) =>
    job
      .needs(jobs.test)
      .runsOn("ubuntu-latest")
      .uses({ name: "Checkout", uses: checkout({}) })
      .run({
        name: "Verify tools",
        run: "deno --version && command -v tsugiori",
      })
      .task({
        name: "Build",
        task: async () => {
          const result = await new Deno.Command("deno", {
            args: ["task", "build"],
            stdout: "inherit",
            stderr: "inherit",
          }).output();
          if (!result.success) {
            throw new Error(`Build failed with ${result.code}.`);
          }
        },
      })
  );

export default defineTsugiori({ cacheVersion: 1, pipelines: [ci] });
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
      - name: Resolve task artifact
        id: tsugiori-task-artifact
        run: tsugiori github-actions task cache-key --config './tsugiori.ts' --expect-layout 'ci/build=sha256:<digest>'
      - name: Restore task artifact cache
        continue-on-error: true
        uses: actions/cache/restore@<commit-sha>
        with:
          path: ${{ steps.tsugiori-task-artifact.outputs.cache-path }}
          key: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-${{ github.run_id }}-${{ github.run_attempt }}
          restore-keys: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-
      - name: Prepare task artifact
        id: tsugiori-task-prepare
        run: tsugiori github-actions task prepare --config './tsugiori.ts' --expect-layout 'ci/build=sha256:<digest>' --expected-key '${{ steps.tsugiori-task-artifact.outputs.artifact-key }}'
      - name: Save task artifact cache
        if: steps.tsugiori-task-prepare.outputs.cache-write-required == 'true'
        continue-on-error: true
        uses: actions/cache/save@<commit-sha>
        with:
          path: ${{ steps.tsugiori-task-artifact.outputs.cache-path }}
          key: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-${{ github.run_id }}-${{ github.run_attempt }}
      - name: Build
        run: ./.tsugiori/task-runtime ci/build/task-1
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Verify tools
        run: deno --version && command -v tsugiori
      - name: Resolve task artifact
        id: tsugiori-task-artifact
        run: tsugiori github-actions task cache-key --config './tsugiori.ts' --expect-layout 'ci/test=sha256:<digest>'
      - name: Restore task artifact cache
        continue-on-error: true
        uses: actions/cache/restore@<commit-sha>
        with:
          path: ${{ steps.tsugiori-task-artifact.outputs.cache-path }}
          key: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-${{ github.run_id }}-${{ github.run_attempt }}
          restore-keys: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-
      - name: Prepare task artifact
        id: tsugiori-task-prepare
        run: tsugiori github-actions task prepare --config './tsugiori.ts' --expect-layout 'ci/test=sha256:<digest>' --expected-key '${{ steps.tsugiori-task-artifact.outputs.artifact-key }}'
      - name: Save task artifact cache
        if: steps.tsugiori-task-prepare.outputs.cache-write-required == 'true'
        continue-on-error: true
        uses: actions/cache/save@<commit-sha>
        with:
          path: ${{ steps.tsugiori-task-artifact.outputs.cache-path }}
          key: tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}-${{ github.run_id }}-${{ github.run_attempt }}
      - name: Test
        run: ./.tsugiori/task-runtime ci/test/task-1
```

## Properties

- `test` and `build` remain separate GitHub Actions jobs.
- Each task-backed provider step becomes a normal GitHub Actions step.
- GitHub Actions still evaluates `needs` and step ordering.
- Task function bodies live in Deno code rather than inline YAML.
- The generated YAML is committed and reviewed.
- Visible restore, preparation, and conditional save steps make the task
  artifact available.
- The task runtime dispatches readable, job-scoped task entrypoints.
- Job-layout fingerprints reject stale task order before dispatch.
- The local source-addressed entry uses a runtime-owned JSON manifest and is
  delivered through generational `actions/cache` entries.
