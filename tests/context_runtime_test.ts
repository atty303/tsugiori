import { assert, assertEquals, assertRejects } from "@std/assert";
import { project, toJSON, workflow } from "../src/github_actions/mod.ts";
import { githubActionsSpec } from "../src/github_actions/github_spec.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import {
  type JobRuntime,
  type RunnerRuntime,
  scenario,
  ScenarioError,
  type ScenarioObservation,
  type StepGitHub,
} from "../src/testing/mod.ts";

const ci = workflow("contexts.yml", { on: { push: {} } }).job(
  "build",
  ({ job }) =>
    job.runsOn("ubuntu-latest").strategy({ matrix: { stage: ["dev", "prd"] } })
      .container("node:24").services({ db: { image: "postgres:17" } })
      .run({
        id: "first",
        name: "First",
        run: "true",
        if: ({ github }) => github.artifacts.eq("/first"),
        env: ({ github, job, runner, secrets }) => ({
          ARTIFACTS: github.artifacts,
          LIST: github.artifacts_list,
          CHECK: toJSON(job.check_run_id),
          REF: job.workflow_ref,
          SHA: job.workflow_sha,
          REPO: job.workflow_repository,
          FILE: job.workflow_file_path,
          RUNNER: runner.environment,
          OS: runner.os,
          TOKEN: secrets.GITHUB_TOKEN,
          STATUS: job.status,
          NETWORK: job.container.network,
          DB: job.services.db.id,
        }),
      })
      .run({
        id: "next",
        name: "Next",
        run: "true",
        env: ({ github, runner }) => ({
          ARTIFACTS: github.artifacts,
          OS: runner.os,
        }),
      })
      .outputs(({ github, job }) => ({
        artifacts: github.artifacts,
        source: job.workflow_file_path,
      })),
);

Deno.test("context additions generate native paths without declaring GITHUB_TOKEN", () => {
  const native =
    lowerProject(project({ workflows: [ci] }), "./workflows.ts").workflows[0]
      .workflow;
  const env = parse(emitWorkflow(native)).jobs.build.steps[0].env;
  assertEquals(env, {
    ARTIFACTS: "${{ github.artifacts }}",
    LIST: "${{ github.artifacts_list }}",
    CHECK: "${{ toJSON(job.check_run_id) }}",
    REF: "${{ job.workflow_ref }}",
    SHA: "${{ job.workflow_sha }}",
    REPO: "${{ job.workflow_repository }}",
    FILE: "${{ job.workflow_file_path }}",
    RUNNER: "${{ runner.environment }}",
    OS: "${{ runner.os }}",
    TOKEN: "${{ secrets.GITHUB_TOKEN }}",
    STATUS: "${{ job.status }}",
    NETWORK: "${{ job.container.network }}",
    DB: "${{ job.services.db.id }}",
  });
});

Deno.test("instance fields override job fixtures, step github stays local, and containers/status coexist", async () => {
  const events: ScenarioObservation[] = [];
  const result = await scenario(ci, (test) => {
    test.github({ event_name: "push", artifacts: "/common" });
    test.secrets({ GITHUB_TOKEN: "fixture-only-token" });
    test.job("build", (job) => {
      job.jobRuntime({
        check_run_id: 10,
        workflow_ref: "callee@main",
        workflow_sha: "fixture-sha",
        workflow_repository: "fixture/repo",
        workflow_file_path: "contexts.yml",
      });
      job.runner({ environment: "github-hosted", os: "Linux" });
      job.containerRuntime({
        container: { network: "fixture-network" },
        services: { db: { id: "fixture-db" } },
      });
      job.step("first").github({ artifacts: "/first", artifacts_list: "/list" })
        .fixture({ outcome: "failure" });
      job.step("next").expectSkip();
      job.eachMatrix(({ stage }, instance) => {
        instance.jobRuntime({ check_run_id: stage === "dev" ? 11 : 12 });
        instance.runner({
          environment: stage === "dev" ? "self-hosted" : "github-hosted",
        });
      });
    });
  }, { observe: (e) => events.push(e) });
  const rows = result.jobs.build.instances;
  assertEquals(rows.map((r) => r.steps.first.env.CHECK), ["11", "12"]);
  assertEquals(rows.map((r) => r.steps.first.env.RUNNER), [
    "self-hosted",
    "github-hosted",
  ]);
  for (const row of rows) {
    assertEquals(row.steps.first.env.OS, "Linux");
    assertEquals(row.steps.first.env.STATUS, "success");
    assertEquals(row.steps.first.env.NETWORK, "fixture-network");
    assertEquals(row.steps.first.env.DB, "fixture-db");
  }
  assertEquals(result.jobs.build.outputs, {
    artifacts: "/common",
    source: "contexts.yml",
  });
  assert(!JSON.stringify(events).includes("fixture-only-token"));
  assert(!JSON.stringify(events).includes("fixture-sha"));
  assertEquals(events.at(-1)?.status, "success");
});

Deno.test("parallel step github overrides do not leak to sibling or later steps or outputs", async () => {
  const flow = workflow("parallel-context.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").parallel((group) => [
        group.run({
          id: "one",
          name: "One",
          run: "true",
          env: ({ github }) => ({ PATH: github.artifacts }),
        }),
        group.run({
          id: "two",
          name: "Two",
          run: "true",
          env: ({ github }) => ({ PATH: github.artifacts }),
        }),
      ]).run({
        id: "three",
        name: "Three",
        run: "true",
        env: ({ github }) => ({ PATH: github.artifacts }),
      })
        .outputs(({ github }) => ({ path: github.artifacts })),
  );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push", artifacts: "/common" });
    test.job("test", (job) => {
      job.step("one").github({ artifacts: "/one" }).fixture({});
      job.step("two").github({ artifacts: "/two" }).fixture({});
      job.step("three").fixture({});
    });
  });
  assertEquals(
    Object.values(result.jobs.test.instances[0].steps).map((s) => s.env.PATH),
    ["/one", "/two", "/common"],
  );
  assertEquals(result.jobs.test.outputs.path, "/common");
});

Deno.test("local nested calls retain caller github and standard token but isolate execution context and custom secrets", async () => {
  const leaf = workflow("leaf.yml", { on: { workflow_call: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "check",
        name: "Check",
        run: "true",
        env: ({ github, job, runner, secrets }) => ({
          CALLER: github.workflow_ref,
          CALLEE: job.workflow_ref,
          RUNNER: runner.environment,
          TOKEN: secrets.GITHUB_TOKEN,
        }),
      }),
  );
  const middle = workflow("middle.yml", { on: { workflow_call: {} } })
    .job(
      "local",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "check",
          name: "Check",
          run: "true",
          env: ({ runner }) => ({ OS: runner.os }),
        }),
    )
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/leaf.yml", leaf, {}),
    );
  const caller = workflow("caller.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/middle.yml", middle, {}),
  );
  const config = project({ workflows: [caller, middle, leaf] });
  const result = await scenario(caller, (test) => {
    test.github({ event_name: "push", workflow_ref: "caller@main" });
    test.secrets({
      GITHUB_TOKEN: "fixture-only-token",
      CUSTOM: "fixture-custom",
    });
    test.job("call", (job) =>
      job.call(middle, (child) => {
        child.job("local", (job) => {
          job.runner({ os: "Linux" });
          job.step("check").fixture({});
        });
        child.job("call", (job) =>
          job.call(leaf, (child) => {
            child.job("build", (job) => {
              job.jobRuntime({ workflow_ref: "leaf@main" });
              job.runner({ environment: "self-hosted" });
              job.step("check").fixture({});
            });
          }));
      }));
  }, { config });
  const nested = result.jobs.call.instances[0].call!.jobs.call.instances[0]
    .call!;
  assertEquals(nested.jobs.build.instances[0].steps.check.env, {
    CALLER: "caller@main",
    CALLEE: "leaf@main",
    RUNNER: "self-hosted",
    TOKEN: "fixture-only-token",
  });
  // Missing callee execution identity is not filled from caller github.
  const error = await assertRejects(() =>
    scenario(caller, (test) => {
      test.github({ event_name: "push", workflow_ref: "caller@main" });
      test.job("call", (job) =>
        job.call(middle, (child) => {
          child.job("local", (job) => {
            job.runner({ os: "Linux" });
            job.step("check").fixture({});
          });
          child.job("call", (job) =>
            job.call(leaf, (child) => {
              child.job("build", (job) => {
                job.step("check").fixture({});
              });
            }));
        }));
    }, { config }), ScenarioError);
  assertEquals(error.kind, "fixture_missing");
  assert(error.message.includes("job.workflow_ref"));
});

Deno.test("missing runtime reads identify context field and expression site without inferring runner labels", async () => {
  for (
    const [name, expected] of [["runner", "runner.environment"], [
      "job",
      "job.check_run_id",
    ]] as const
  ) {
    const flow = workflow(`${name}.yml`, { on: { push: {} } }).job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "check",
          name: "Check",
          run: "true",
          env: ({ job, runner }) => ({
            VALUE: name === "runner"
              ? runner.environment
              : toJSON(job.check_run_id),
          }),
        }),
    );
    const events: ScenarioObservation[] = [];
    const error = await assertRejects(() =>
      scenario(flow, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => job.step("check").fixture({}));
      }, { observe: (e) => events.push(e) }), ScenarioError);
    assertEquals(error.kind, "fixture_missing");
    assert(error.message.includes(expected), error.message);
    assert(error.location.endsWith(".check.env.VALUE"), error.location);
    assertEquals(events.at(-1)?.errorType, "fixture_missing");
  }
});
Deno.test("runtime fixtures reject computed or event fields and wrong native types", async () => {
  const flow = workflow("invalid.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "check",
        name: "Check",
        run: "true",
      }),
  );
  // The assertions exercise untyped JavaScript callers bypassing the public types.
  for (
    const value of [
      { status: "failure" },
      { check_run_id: "1" },
      { services: {} },
      { needs: {} },
      { check_run_id: NaN },
    ]
  ) {
    await assertRejects(
      () =>
        scenario(
          flow,
          (test) =>
            test.job("test", (job) => job.jobRuntime(value as JobRuntime)),
        ),
      ScenarioError,
    );
  }
  for (const value of [{ environment: "guess" }, { os: 1 }, { steps: {} }]) {
    await assertRejects(
      () =>
        scenario(
          flow,
          (test) =>
            test.job("test", (job) => job.runner(value as RunnerRuntime)),
        ),
      ScenarioError,
    );
  }
  for (
    const value of [{ event_name: "push" }, { ref: "main" }, { artifacts: 1 }]
  ) {
    await assertRejects(
      () =>
        scenario(
          flow,
          (test) =>
            test.job("test", (job) =>
              job.step("check").github(value as StepGitHub)),
        ),
      ScenarioError,
    );
  }
});

Deno.test("standard token is automatic while custom secrets retain explicit and inherit boundaries", async () => {
  const leaf = workflow("secret-leaf.yml", {
    on: { workflow_call: { secrets: { CUSTOM: {} } } },
  })
    .job(
      "check",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "check",
          name: "Check",
          run: "true",
          env: ({ secrets }) => ({
            TOKEN: secrets.GITHUB_TOKEN,
            CUSTOM: secrets.CUSTOM,
          }),
        }),
    );
  for (const mode of ["omit", "explicit", "inherit"] as const) {
    const caller = workflow("secret-caller.yml", {
      on: { push: {} },
      secrets: ["CUSTOM"],
    })
      .job(
        "call",
        ({ job }) => {
          const call = job.reusable();
          if (mode === "inherit") {
            return call.call("./.github/workflows/secret-leaf.yml", leaf, {
              secrets: "inherit",
            });
          }
          if (mode === "explicit") {
            return call.call("./.github/workflows/secret-leaf.yml", leaf, {
              secrets: ({ secrets }) => ({ CUSTOM: secrets.CUSTOM }),
            });
          }
          return call.call("./.github/workflows/secret-leaf.yml", leaf, {});
        },
      );
    const run = () =>
      scenario(caller, (test) => {
        test.github({ event_name: "push" });
        test.secrets({
          GITHUB_TOKEN: "fixture-only-token",
          CUSTOM: "fixture-custom",
        });
        test.job("call", (job) => {
          job.expectCallSecrets({ GITHUB_TOKEN: "fixture-only-token" });
          job.call(leaf, (child) =>
            child.job("check", (job) => job.step("check").fixture({})));
        });
      }, { config: project({ workflows: [caller, leaf] }) });
    if (mode === "omit") {
      const error = await assertRejects(run, ScenarioError);
      assertEquals(error.kind, "fixture_missing");
      assert(error.message.includes("secrets.CUSTOM"));
    } else {
      const result = await run();
      assertEquals(
        result.jobs.call.instances[0].call!.jobs.check.instances[0].steps.check
          .env,
        { TOKEN: "fixture-only-token", CUSTOM: "fixture-custom" },
      );
    }
  }
});

Deno.test("reusable caller jobs reject runtime fixtures and do not admit child workflow context overrides", async () => {
  const leaf = workflow("runtime-leaf.yml", { on: { workflow_call: {} } })
    .job(
      "check",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "check",
          name: "Check",
          run: "true",
        }),
    );
  const caller = workflow("runtime-caller.yml", { on: { push: {} } })
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/runtime-leaf.yml", leaf, {}),
    );
  for (const kind of ["runner", "jobRuntime", "child"] as const) {
    const error = await assertRejects(() =>
      scenario(caller, (test) => {
        test.github({ event_name: "push" });
        test.job("call", (job) => {
          if (kind === "runner") job.runner({ os: "Linux" });
          if (kind === "jobRuntime") job.jobRuntime({ check_run_id: 42 });
          job.call(leaf, (child) => {
            if (kind === "child") child.github({ event_name: "push" });
            child.job("check", (job) => job.step("check").fixture({}));
          });
        });
      }, { config: project({ workflows: [caller, leaf] }) }), ScenarioError);
    assertEquals(error.kind, "fixture_invalid");
    if (kind !== "child") assert(error.location.endsWith(`.${kind}`));
  }
});

Deno.test("missing standard token identifies its field at workflow, job and step expression sites", async () => {
  const root = workflow("missing-token.yml", {
    on: { push: {} },
    env: { TOKEN: "${{ secrets.GITHUB_TOKEN }}" },
  }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "check",
        name: "Check",
        run: "true",
      }),
  );
  const jobLevel = workflow("missing-token.yml", { on: { push: {} } })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").env(({ secrets }) => ({
          TOKEN: secrets.GITHUB_TOKEN,
        }))
          .run({ id: "check", name: "Check", run: "true" }),
    );
  const stepLevel = workflow("missing-token.yml", { on: { push: {} } })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "check",
          name: "Check",
          run: "true",
          env: ({ secrets }) => ({ TOKEN: secrets.GITHUB_TOKEN }),
        }),
    );
  for (
    const [flow, site] of [[root, "missing-token.yml.env.TOKEN"], [
      jobLevel,
      "missing-token.yml.test[{}].env.TOKEN",
    ], [stepLevel, "missing-token.yml.test[{}].check.env.TOKEN"]] as const
  ) {
    const events: ScenarioObservation[] = [];
    const error = await assertRejects(() =>
      scenario(flow, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => job.step("check").fixture({}));
      }, { observe: (event) => events.push(event) }), ScenarioError);
    assertEquals(error.kind, "fixture_missing");
    assertEquals(error.location, site);
    assert(error.message.includes("secrets.GITHUB_TOKEN"), error.message);
    assertEquals(events.at(-1)?.errorType, "fixture_missing");
  }
});

Deno.test("server fields use null while initialized runner settings, steps and job outputs use local job identity and token fixtures", async () => {
  const flow = workflow("phases.yml", {
    on: { push: {} },
    concurrency: ({ github }) => ({
      group: toJSON(github.job),
      cancelInProgress: github.token.ne(null),
    }),
    env: {
      WORKFLOW_JOB: "${{ github.job }}",
      WORKFLOW_TOKEN: "${{ github.token }}",
    },
  }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").when(({ github }) =>
        github.job.eq(null).and(github.token.eq(null))
      )
        .env(({ github }) => ({ JOB_TOKEN: github.token }))
        .run({
          id: "read",
          name: "Read",
          run: "true",
          env: ({ github }) => ({
            STEP_JOB: github.job,
            STEP_TOKEN: github.token,
          }),
        })
        .outputs(({ github }) => ({ job: github.job, token: github.token })),
  );
  const result = await scenario(flow, (test) => {
    test.github({
      event_name: "push",
      job: "ignored-server-fixture",
      token: "fixture-only-token",
    });
    test.expectConcurrency({ group: "null", cancelInProgress: false });
    test.job("build", (job) => {
      job.expectSettings({ runsOn: "ubuntu-latest" });
      job.step("read").fixture(({ env }) => {
        assertEquals(env, {
          WORKFLOW_JOB: "build",
          WORKFLOW_TOKEN: "fixture-only-token",
          JOB_TOKEN: "fixture-only-token",
          STEP_JOB: "build",
          STEP_TOKEN: "fixture-only-token",
        });
        return {};
      });
    });
  });
  assertEquals(result.jobs.build.outputs, {
    job: "build",
    token: "fixture-only-token",
  });
  const missing = await assertRejects(() =>
    scenario(flow, (test) => {
      test.github({ event_name: "push" });
      test.expectConcurrency({ group: "null", cancelInProgress: false });
      test.job("build", (job) => job.step("read").fixture({}));
    }), ScenarioError);
  assertEquals(missing.kind, "fixture_missing");
  assert(missing.location.endsWith("env.WORKFLOW_TOKEN"));
});

Deno.test("every frozen github property traverses typed authoring, native emission and scenario fixtures", async () => {
  const fixture = {
    action: "check",
    action_path: "/action",
    action_ref: "v1",
    action_repository: "owner/action",
    action_status: "success",
    actor: "actor",
    actor_id: "1",
    api_url: "https://api.github.com",
    artifacts: "/artifacts",
    artifacts_list: "/list",
    base_ref: "main",
    env: "/env",
    event: { ref: "refs/heads/main" },
    event_name: "push" as const,
    event_path: "/event.json",
    graphql_url: "https://api.github.com/graphql",
    head_ref: "topic",
    job: "build",
    path: "/path",
    ref: "refs/heads/main",
    ref_name: "main",
    ref_protected: true,
    ref_type: "branch",
    repository: "owner/repo",
    repository_id: "2",
    repository_owner: "owner",
    repository_owner_id: "3",
    repositoryUrl: "git://owner/repo",
    retention_days: "90",
    run_id: "4",
    run_number: "5",
    run_attempt: "1",
    secret_source: "Actions",
    server_url: "https://github.com",
    sha: "fixture-sha",
    token: "synthetic-context-token",
    triggering_actor: "actor",
    workflow: "contexts",
    workflow_ref: "owner/repo/.github/workflows/context.yml@main",
    workflow_sha: "workflow-sha",
    workspace: "/workspace",
  };
  const keys = Object.keys(fixture) as (keyof typeof fixture)[];
  assertEquals(keys.length, 41);
  const propertyRows = githubActionsSpec.coverage.filter((row) =>
    row.domain === "context" && row.key.startsWith("github.")
  );
  assertEquals(
    propertyRows.map((row) => row.key).sort(),
    keys.map((key) => `github.${key}`).sort(),
  );
  for (const row of propertyRows) {
    assertEquals(row.status, "implemented", row.key);
    assert(!row.assessment.includes("implementation-gap"), row.key);
  }
  const flow = workflow("all-context.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
        env: ({ github }) =>
          Object.fromEntries(keys.map((key) => [key, toJSON(github.at(key))])),
      }),
  );
  const native =
    lowerProject(project({ workflows: [flow] }), "./workflows.ts").workflows[0]
      .workflow;
  const emitted = parse(emitWorkflow(native)).jobs.build.steps[0].env;
  for (const key of keys) {
    assertEquals(emitted[key], `\${{ toJSON(github.${key}) }}`, key);
  }
  const result = await scenario(flow, (t) => {
    t.github(fixture);
    t.job("build", (j) => j.step("read").fixture({}));
  });
  for (const key of keys) {
    assertEquals(
      result.jobs.build.instances[0].steps.read.env[key],
      JSON.stringify(fixture[key], null, 2),
      key,
    );
  }
});
