import { assertInlineSnapshot } from "@std/testing/unstable-snapshot";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  defineProject,
  defineWorkflow,
  rawExpression,
  rawNode,
} from "../src/github_actions/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { scenario } from "../src/testing/mod.ts";

const platform = defineWorkflow(".github/workflows/platform.yml", {
  on: {
    workflow_call: {
      inputs: {
        module: { type: "string", required: true },
        enabled: { type: "boolean", default: true },
      },
      secrets: { token: { required: true } },
    },
  },

  env: { ISOLATED: "callee" },
}).job("build", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({
      matrix: {
        include: [
          { runner: "ubuntu-latest", target: "linux", arch: "x86_64" },
          { runner: "macos-latest", target: "macos", arch: "aarch64" },
          { runner: "windows-2022", target: "windows", arch: "x86_64" },
          { runner: "ubuntu-latest", target: "android", arch: "aarch64" },
        ],
      },
    })
    .runsOn(({ matrix }) => matrix.runner)
    .name(({ matrix }) => matrix.target)
    .env(({ inputs }) => ({ MODULE: inputs.module }))
    .defaultsRun({ shell: "bash", workingDirectory: "./modules" })
    .run({
      id: "check",
      name: "Check",
      run: "echo check",
      shell: "pwsh",
      workingDirectory: ".",
      timeoutMinutes: () => rawNode<number>("fromJSON(env.TIMEOUT)"),
      outputs: ["result"],
    })
    .outputs(({ steps }) => ({ result: steps.check.outputs.result })))
  .workflowOutputs(({ jobs }) => ({ result: jobs.build.outputs.result }));

const ci = defineWorkflow(".github/workflows/ci.yml", {
  on: {
    workflow_call: {
      inputs: { module: { type: "string", required: true } },
      secrets: { token: { required: true } },
    },
  },
})
  .job(
    "platform",
    ({ job }) =>
      job.reusable().call(
        "./.github/workflows/platform.yml",
        platform,
        {
          with: ({ inputs }) => ({ module: inputs.module }),
          secrets: ({ secrets }) => ({ token: secrets.token }),
        },
      ),
  )
  .workflowOutputs(({ jobs }) => ({ result: jobs.platform.outputs.result }));
const main = defineWorkflow(".github/workflows/main.yml", {
  on: { push: { branches: ["master"], tags: ["*"] } },

  env: { CALLER_ONLY: "value" },
  permissions: { actions: "read", "pull-requests": "write" },
})
  .job(
    "ci",
    ({ job }) =>
      job.reusable().call("./.github/workflows/ci.yml", ci, {
        with: { module: "app" },
        secrets: "inherit",
      }),
  )
  .job(
    "notify",
    ({ job, jobs }) =>
      job.needs(jobs.ci).runsOn(["self-hosted", "linux"]).when(({ always }) =>
        always()
      ).run({
        id: "notify",
        name: "Notify",
        run: "echo notify",
        env: ({ needs }) => ({ RESULT: needs.ci.outputs.result }),
      }),
  );
const config = defineProject({ workflows: [main, ci, platform] });

Deno.test("Glaze native nested calls and platform matrix emit standard YAML", async () => {
  const lowered = await lowerProject(config, ".github/tsugiori.ts");
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/main.yml
env:
  CALLER_ONLY: value
on:
  push:
    branches:
      - master
    tags:
      - "*"
permissions:
  actions: read
  pull-requests: write
jobs:
  ci:
    uses: ./.github/workflows/ci.yml
    with:
      module: app
    secrets: inherit

  notify:
    runs-on:
      - self-hosted
      - linux
    needs:
      - ci
    if: \${{ always() }}
    steps:
      - name: Notify
        id: notify
        env:
          RESULT: \${{ needs.ci.outputs.result }}
        run: echo notify
`,
    { serializer: (yaml) => yaml },
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[1].workflow),
    `name: .github/workflows/ci.yml
on:
  workflow_call:
    inputs:
      module:
        type: string
        required: true
    secrets:
      token:
        required: true
    outputs:
      result:
        value: \${{ jobs.platform.outputs.result }}
jobs:
  platform:
    uses: ./.github/workflows/platform.yml
    with:
      module: \${{ inputs.module }}
    secrets:
      token: \${{ secrets.token }}
`,
    { serializer: (yaml) => yaml },
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[2].workflow),
    `name: .github/workflows/platform.yml
env:
  ISOLATED: callee
on:
  workflow_call:
    inputs:
      enabled:
        type: boolean
        default: true
      module:
        type: string
        required: true
    secrets:
      token:
        required: true
    outputs:
      result:
        value: \${{ jobs.build.outputs.result }}
jobs:
  build:
    runs-on: \${{ matrix.runner }}
    name: \${{ matrix.target }}
    env:
      MODULE: \${{ inputs.module }}
    defaults:
      run:
        shell: bash
        working-directory: ./modules
    outputs:
      result: \${{ steps.check.outputs.result }}
    strategy:
      matrix:
        include:
          - runner: ubuntu-latest
            target: linux
            arch: x86_64
          - runner: macos-latest
            target: macos
            arch: aarch64
          - runner: windows-2022
            target: windows
            arch: x86_64
          - runner: ubuntu-latest
            target: android
            arch: aarch64
    steps:
      - name: Check
        id: check
        timeout-minutes: \${{ fromJSON(env.TIMEOUT) }}
        working-directory: .
        shell: pwsh
        run: echo check
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("typed reusable call emits the explicit native reference independently of the callee path", async () => {
  const caller = defineWorkflow("generated/caller.yaml", { on: { push: {} } })
    .job("call", ({ job }) =>
      job.reusable().call(
        "./.github/workflows/deployed-platform.yaml",
        platform,
        { with: { module: "app" }, secrets: "inherit" },
      ));
  const lowered = await lowerProject(
    defineProject({ workflows: [platform, caller] }),
    "./config.ts",
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[1].workflow),
    `name: generated/caller.yaml
on:
  push: {}
jobs:
  call:
    uses: ./.github/workflows/deployed-platform.yaml
    with:
      module: app
    secrets: inherit
`,
    { serializer: (yaml) => yaml },
  );
});

for (const fail of [false, true]) {
  Deno.test(`nested scenario propagates outputs, secrets and failure (${fail})`, async () => {
    const result = await scenario(main, (test) => {
      test.github({ event_name: "push", ref: "refs/heads/master", event: {} })
        .secrets({ token: "fixture-only" });
      test.job("ci", (j) =>
        j.expectCallInputs({ module: "app" }).expectCallSecrets({
          token: "fixture-only",
        }).call(ci, (test) => {
          test.job("platform", (j) =>
            j.expectCallInputs({ module: "app", enabled: true })
              .expectCallSecrets({ token: "fixture-only" }).call(
                platform,
                (test) => {
                  test.job("build", (j) =>
                    j.eachMatrix(({ target }, i) =>
                      i.step("check").fixture(({ env }) => {
                        assertEquals(env.ISOLATED, "callee");
                        assertEquals(env.CALLER_ONLY, undefined);
                        assertEquals(env.MODULE, "app");
                        return {
                          outcome: fail && target === "windows"
                            ? "failure"
                            : "success",
                          outputs: { result: "done" },
                        };
                      })
                    ).expectResult(fail ? "failure" : "success"));
                },
              ));
        }).expectResult(fail ? "failure" : "success").expectOutputs({
          result: "done",
        }));
      test.job("notify", (j) =>
        j.step("notify").fixture(({ env }) => {
          assertEquals(env.RESULT, "done");
          return {};
        }).expectRun());
      test.expectResult(fail ? "failure" : "success");
    }, { config });
    assertEquals(
      result.jobs.ci.instances[0].call?.jobs.platform.instances[0].call?.jobs
        .build.instances.length,
      4,
    );
  });
}

Deno.test("local references require config membership and input contracts", async () => {
  assertThrows(
    () => lowerProject(defineProject({ workflows: [main] }), "config.ts"),
    Error,
    "included in the same project",
  );
  const invalid = defineWorkflow(".github/workflows/invalid.yml", {
    on: { push: {} },
  })
    .job(
      "ci",
      ({ job }) =>
        job.reusable().call("./.github/workflows/ci.yml", ci, {
          with: { module: rawExpression("42") },
          secrets: "inherit",
        }),
    );
  await assertRejects(
    () =>
      scenario(invalid, (t) => {
        t.github({ event_name: "push" }).secrets({ token: "fixture" });
        t.job("ci", (j) => j.call(ci, () => {}));
      }, { config: defineProject({ workflows: [invalid, ci, platform] }) }),
    Error,
    "violates declared type",
  );
});

Deno.test("external workflow call uses explicit fixture", async () => {
  const p = defineWorkflow(".github/workflows/external.yml", {
    on: { push: {} },
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
          with: { target: "linux" },
        }),
    );
  const result = await scenario(p, (t) => {
    t.github({ event_name: "push" });
    t.job("call", (j) =>
      j.callFixture(({ inputs }) => {
        assertEquals(inputs, { target: "linux" });
        return { outcome: "failure", outputs: { message: "failed" } };
      }).expectOutputs({ message: "failed" }));
  });
  assertEquals(result.result, "failure");
});

Deno.test("host scenario observation preserves results and never exposes fixture values", async () => {
  const events: unknown[] = [];
  const p = defineWorkflow(".github/workflows/observe.yml", {
    on: { push: {} },
  }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "run",
        name: "Run",
        run: "echo run",
      }),
  );
  const result = await scenario(p, (t) => {
    t.github({ event_name: "push" }).secrets({
      token: "private-fixture-value",
    });
    t.job("job", (j) => j.step("run").fixture({}));
  }, {
    observe: (event) => {
      events.push(event);
      throw new Error("sink unavailable");
    },
  });
  assertEquals(result.result, "success");
  assertEquals(events, [{
    operationId: 1,
    parentId: undefined,
    stage: "workflow",
    status: "start",
  }, {
    operationId: 1,
    parentId: undefined,
    stage: "workflow",
    status: "success",
  }]);
  const errors: unknown[] = [];
  await assertRejects(() =>
    scenario(p, (t) => t.github({ event_name: "push" }), {
      observe: (e) => errors.push(e),
    })
  );
  assertEquals(errors[1], {
    operationId: 1,
    parentId: undefined,
    stage: "workflow",
    status: "failure",
    errorType: "fixture_missing",
  });
});

Deno.test("dispatch choice and run name render into native YAML", async () => {
  const dispatch = defineWorkflow(".github/workflows/release.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          into_env: {
            type: "choice",
            required: true,
            options: ["stg", "prd"],
            default: "stg",
          },
        },
      },
    },
    runName: "Release ${{ inputs.into_env }}",

    env: { TIMEOUT: "10" },
  }).job(
    "release",
    ({ job }) =>
      job.runsOn("ubuntu-latest").permissions({
        actions: "write",
        "pull-requests": "write",
      }).run({
        id: "release",
        name: "Release",
        run: "echo release",
        shell: "bash",
        timeoutMinutes: 10,
      }),
  );
  const lowered = await lowerProject(
    defineProject({ workflows: [dispatch] }),
    "config.ts",
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/release.yml
run-name: Release \${{ inputs.into_env }}
env:
  TIMEOUT: "10"
on:
  workflow_dispatch:
    inputs:
      into_env:
        type: choice
        required: true
        options:
          - stg
          - prd
        default: stg
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      actions: write
      pull-requests: write
    steps:
      - name: Release
        id: release
        timeout-minutes: 10
        shell: bash
        run: echo release
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("dispatch scenarios expose workflow env to steps", async () => {
  const dispatch = defineWorkflow(".github/workflows/release.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          into_env: {
            type: "choice",
            required: true,
            options: ["stg", "prd"],
            default: "stg",
          },
        },
      },
    },
    runName: "Release ${{ inputs.into_env }}",

    env: { TIMEOUT: "10" },
  }).job(
    "release",
    ({ job }) =>
      job.runsOn("ubuntu-latest").permissions({
        actions: "write",
        "pull-requests": "write",
      }).run({
        id: "release",
        name: "Release",
        run: "echo release",
        shell: "bash",
        timeoutMinutes: 10,
      }),
  );
  await scenario(dispatch, (t) => {
    t.github({ event_name: "workflow_dispatch" });
    t.job("release", (j) =>
      j.step("release").fixture(({ env }) => {
        assertEquals(env.TIMEOUT, "10");
        return {};
      }));
  });
});

Deno.test("PR-target scenarios filter activity types", async () => {
  const pr = defineWorkflow(".github/workflows/pr.yml", {
    on: { pull_request_target: { types: ["opened"] } },
  }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ id: "run", name: "Run", run: "true" }),
  );
  assertEquals(
    (await scenario(pr, (t) =>
      t.github({
        event_name: "pull_request_target",
        event: { action: "closed" },
      }))).result,
    "skipped",
  );
  await scenario(pr, (t) => {
    t.github({
      event_name: "pull_request_target",
      event: { action: "opened" },
    });
    t.job("job", (j) => j.step("run").fixture({}));
  });
});

Deno.test("push scenarios honor ordered tag filters", async () => {
  const tags = defineWorkflow(".github/workflows/tags.yml", {
    on: { push: { tags: ["v*", "!v*-alpha"] } },
  }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ id: "run", name: "Run", run: "true" }),
  );
  for (const ref of ["refs/heads/v1", "refs/tags/v1-alpha"]) {
    assertEquals(
      (await scenario(tags, (t) => t.github({ event_name: "push", ref })))
        .result,
      "skipped",
    );
  }
  await scenario(tags, (t) => {
    t.github({ event_name: "push", ref: "refs/tags/v1" });
    t.job("job", (j) => j.step("run").fixture({}));
  });
});

Deno.test("native defaults emit only specified values and tasks retain step timeout", async () => {
  const p = defineWorkflow(".github/workflows/defaults.yml", {
    on: { push: {} },
  })
    .job(
      "shell",
      ({ job }) =>
        job.runsOn("ubuntu-latest").defaultsRun({ shell: "bash" }).run({
          name: "Run",
          run: "true",
        }),
    )
    .job(
      "directory",
      ({ job }) =>
        job.runsOn("ubuntu-latest").defaultsRun({ workingDirectory: "." }).task(
          {
            name: "Task",
            inputs: {},
            outputs: {},
            run: () => {},
            timeoutMinutes: 1,
          },
        ),
    );
  const lowered = await lowerProject(
    defineProject({
      workflows: [p],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "config.ts",
    "fixture-source",
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/defaults.yml
on:
  push: {}
jobs:
  shell:
    runs-on: ubuntu-latest
    defaults:
      run:
        shell: bash
    steps:
      - name: Run
        run: "true"

  directory:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: .
    steps:
      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          entrypoint: ./config.ts
          project-directory: .
          source-key: fixture-source

      - name: Task
        timeout-minutes: 1
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/defaults.yml/directory/task-1'"
`,
    { serializer: (yaml) => yaml },
  );
});
Deno.test("caller matrix instance expectations are checked independently", async () => {
  const callee = defineWorkflow(".github/workflows/callee.yml", {
    on: { workflow_call: {} },
  }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ id: "run", name: "Run", run: "true" }),
  );
  const caller = defineWorkflow(".github/workflows/caller.yml", {
    on: { push: {} },
  }).job(
    "call",
    ({ job }) =>
      job.reusable().strategy({
        matrix: { include: [{ target: "linux" }, { target: "windows" }] },
      }).call("./.github/workflows/callee.yml", callee, {}),
  );
  await assertRejects(
    () =>
      scenario(caller, (t) => {
        t.github({ event_name: "push" });
        t.job("call", (j) =>
          j.eachMatrix((_m, i) =>
            i.expectResult("failure").call(callee, (t) =>
              t.job("job", (j) =>
                j.step("run").fixture({})))
          ));
      }, { config: defineProject({ workflows: [caller, callee] }) }),
    Error,
    "Expected value differs",
  );
});
