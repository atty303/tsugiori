import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import {
  defineProject,
  defineWorkflow,
  rawExpression,
  rawNode,
} from "../src/github_actions/mod.ts";
import { lowerConfig } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { scenario } from "../src/testing/mod.ts";
import { parse } from "../src/deps.ts";

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
    .env({ MODULE: ({ inputs }) => inputs.module })
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
        ({ inputs, secrets }) => ({
          with: { module: inputs.module },
          secrets: { token: secrets.token },
        }),
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
        env: { RESULT: ({ needs }) => needs.ci.outputs.result },
      }),
  );
const config = defineProject({ workflows: [main, ci, platform] });

Deno.test("typed reusable call emits the explicit native reference independently of the callee path", async () => {
  const caller = defineWorkflow("generated/caller.yaml", { on: { push: {} } })
    .job("call", ({ job }) =>
      job.reusable().call(
        "./.github/workflows/deployed-platform.yaml",
        platform,
        { with: { module: "app" }, secrets: "inherit" },
      ));
  const lowered = await lowerConfig(
    defineProject({ workflows: [platform, caller] }),
    "./config.ts",
  );
  assertStringIncludes(
    emitWorkflow(lowered.workflows[1].workflow),
    "uses: ./.github/workflows/deployed-platform.yaml",
  );
});

Deno.test("Glaze native nested calls and platform matrix emit standard YAML", async () => {
  const lowered = await lowerConfig(config, ".github/tsugiori.ts");
  const caller = parse(emitWorkflow(lowered.workflows[0].workflow)) as {
    jobs: Record<string, Record<string, unknown>>;
  };
  assertEquals(caller.jobs.ci.uses, "./.github/workflows/ci.yml");
  assertEquals(caller.jobs.ci.secrets, "inherit");
  assertEquals("steps" in caller.jobs.ci, false);
  assertEquals("runs-on" in caller.jobs.ci, false);
  const callee = parse(emitWorkflow(lowered.workflows[2].workflow)) as {
    on: Record<string, unknown>;
    jobs: Record<string, Record<string, unknown>>;
  };
  assertEquals(callee.jobs.build["runs-on"], "${{ matrix.runner }}");
  assertEquals(callee.jobs.build.defaults, {
    run: { shell: "bash", "working-directory": "./modules" },
  });
  const steps = callee.jobs.build.steps as Record<string, unknown>[];
  assertEquals(steps[0].shell, "pwsh");
  assertEquals(steps[0]["timeout-minutes"], "${{ fromJSON(env.TIMEOUT) }}");
  assertEquals(callee.on.workflow_call, {
    inputs: {
      module: { type: "string", required: true },
      enabled: { type: "boolean", default: true },
    },
    secrets: { token: { required: true } },
    outputs: { result: { value: "${{ jobs.build.outputs.result }}" } },
  });
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
  await assertRejects(
    () => lowerConfig(defineProject({ workflows: [main] }), "config.ts"),
    Error,
    "included in the same config",
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

Deno.test("Glaze dispatch choice, PR-target activity and ordered tag filters", async () => {
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
  const lowered = await lowerConfig(
    defineProject({ workflows: [dispatch] }),
    "config.ts",
  );
  const yaml = parse(emitWorkflow(lowered.workflows[0].workflow)) as Record<
    string,
    unknown
  >;
  assertEquals(yaml["run-name"], "Release ${{ inputs.into_env }}");
  assertEquals(yaml.on, {
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
  });
  await scenario(dispatch, (t) => {
    t.github({ event_name: "workflow_dispatch" });
    t.job("release", (j) =>
      j.step("release").fixture(({ env }) => {
        assertEquals(env.TIMEOUT, "10");
        return {};
      }));
  });
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
  const lowered = await lowerConfig(
    defineProject({ workflows: [p] }),
    "config.ts",
  );
  const w = parse(emitWorkflow(lowered.workflows[0].workflow)) as {
    jobs: Record<
      string,
      { defaults: unknown; steps: Record<string, unknown>[] }
    >;
  };
  assertEquals(w.jobs.shell.defaults, { run: { shell: "bash" } });
  assertEquals(w.jobs.directory.defaults, {
    run: { "working-directory": "." },
  });
  assertEquals(w.jobs.directory.steps.at(-1)?.["timeout-minutes"], 1);
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
