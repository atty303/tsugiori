import { assertEquals, assertRejects } from "@std/assert";
import {
  project,
  rawExpression,
  rawNode,
  workflow,
} from "../src/github_actions/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import { scenario, ScenarioError } from "../src/testing/mod.ts";

Deno.test("workflow env callbacks materialize once and emit native scoped expressions", () => {
  let calls = 0;
  const values = { SHA: rawNode<string>("github.sha"), CI: "true" };
  const base = workflow("env.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          dry_run: { type: "boolean", default: false },
          count: { type: "number", default: 2 },
        },
      },
    },
    vars: ["REGION"],
    secrets: ["DEPLOY_TOKEN"],
    env: ({ github, vars, secrets, inputs }) => {
      calls++;
      return {
        ...values,
        REGION: vars.REGION,
        CUSTOM_TOKEN: secrets.DEPLOY_TOKEN,
        TOKEN: secrets.GITHUB_TOKEN,
        JOB: github.job,
        INITIALIZED_TOKEN: github.token,
        DRY_RUN: inputs.dry_run,
        COUNT: inputs.count,
        RAW: rawExpression("github.ref"),
      };
    },
  });
  values.CI = "changed";
  for (const id of ["one", "two"]) {
    const flow = base.job(
      id,
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({ name: "Read", run: "true" }),
    );
    const native =
      lowerProject(project({ workflows: [flow] }), "workflows.ts").workflows[0]
        .workflow;
    assertEquals(parse(emitWorkflow(native)).env, {
      SHA: "${{ github.sha }}",
      CI: "true",
      REGION: "${{ vars.REGION }}",
      CUSTOM_TOKEN: "${{ secrets.DEPLOY_TOKEN }}",
      TOKEN: "${{ secrets.GITHUB_TOKEN }}",
      JOB: "${{ github.job }}",
      INITIALIZED_TOKEN: "${{ github.token }}",
      DRY_RUN: "${{ inputs.dry_run }}",
      COUNT: "${{ inputs.count }}",
      RAW: "${{ github.ref }}",
    });
  }
  assertEquals(calls, 1);
});

Deno.test("static workflow env retains strings and renders non-string expressions", () => {
  const flow = workflow("static-env.yml", {
    on: { push: {} },
    env: {
      BOOL: rawNode<boolean>("true"),
      NUMBER: rawNode<number>("42"),
      EMPTY: "",
      SPACE: " ",
      RAW: rawExpression("github.sha"),
      CI: "true",
    },
  }).job(
    "read",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Read", run: "true" }),
  );
  const native =
    lowerProject(project({ workflows: [flow] }), "workflows.ts").workflows[0]
      .workflow;
  assertEquals(parse(emitWorkflow(native)).env, {
    BOOL: "${{ true }}",
    NUMBER: "${{ 42 }}",
    EMPTY: "",
    SPACE: " ",
    RAW: "${{ github.sha }}",
    CI: "true",
  });
});

Deno.test("workflow env expressions evaluate with initialized contexts and native override order", async () => {
  const flow = workflow("scenario-env.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          dry_run: { type: "boolean", default: false },
          count: { type: "number", default: 2 },
        },
      },
    },
    vars: ["REGION"],
    secrets: ["DEPLOY_TOKEN"],
    env: ({ github, vars, secrets, inputs }) => ({
      SHA: github.sha,
      JOB: github.job,
      TOKEN: github.token,
      STANDARD_TOKEN: secrets.GITHUB_TOKEN,
      CUSTOM_TOKEN: secrets.DEPLOY_TOKEN,
      REGION: vars.REGION,
      DRY_RUN: inputs.dry_run,
      COUNT: inputs.count,
      OVERRIDE: "workflow",
    }),
  }).job(
    "read",
    ({ job }) =>
      job.runsOn("ubuntu-latest").env({ OVERRIDE: "job" }).run({
        id: "first",
        name: "First",
        run: "true",
      }).run({
        id: "second",
        name: "Second",
        run: "true",
        env: { OVERRIDE: "step" },
      }),
  ).job(
    "other",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
      }),
  );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "workflow_dispatch", sha: "fixture-sha" });
    test.inputs({ dry_run: true, count: 7 });
    test.vars({ REGION: "fixture-region" });
    test.secrets({
      GITHUB_TOKEN: "fixture-only-standard",
      DEPLOY_TOKEN: "fixture-only-custom",
    });
    test.job("read", (job) => {
      job.step("first").fixture({});
      job.step("second").fixture({});
    });
    test.job("other", (job) => job.step("read").fixture({}));
  });
  assertEquals(result.jobs.read!.instances[0].steps.first!.env, {
    SHA: "fixture-sha",
    JOB: "read",
    TOKEN: "fixture-only-standard",
    STANDARD_TOKEN: "fixture-only-standard",
    CUSTOM_TOKEN: "fixture-only-custom",
    REGION: "fixture-region",
    DRY_RUN: "true",
    COUNT: "7",
    OVERRIDE: "job",
  });
  assertEquals(
    result.jobs.read!.instances[0].steps.second!.env.OVERRIDE,
    "step",
  );
  assertEquals(result.jobs.other!.instances[0].steps.read!.env.JOB, "other");
  assertEquals(
    result.jobs.other!.instances[0].steps.read!.env.OVERRIDE,
    "workflow",
  );
  await assertRejects(
    () =>
      scenario(flow, (test) => {
        test.github({ event_name: "workflow_dispatch", sha: "fixture-sha" });
        test.vars({ REGION: "fixture-region" });
        test.secrets({ DEPLOY_TOKEN: "fixture-only-custom" });
      }),
    ScenarioError,
    "github.token",
  );
});

Deno.test("callback workflow env remains isolated across local reusable calls", async () => {
  const callee = workflow(".github/workflows/callee-env.yml", {
    on: {
      workflow_call: { inputs: { stage: { type: "string", required: true } } },
    },
    env: ({ inputs }) => ({ STAGE: inputs.stage, OWNER: "callee" }),
  }).job(
    "read",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
      }),
  );
  const caller = workflow(".github/workflows/caller-env.yml", {
    on: { push: {} },
    env: ({ github }) => ({ CALLER_ONLY: github.sha, OWNER: "caller" }),
  }).job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/callee-env.yml", callee, {
        with: { stage: "dev" },
      }),
  );
  await scenario(caller, (test) => {
    test.github({ event_name: "push" });
    test.job("call", (job) =>
      job.call(
        callee,
        (child) =>
          child.job("read", (job) =>
            job.step("read").fixture(({ env }) => {
              assertEquals(env, { STAGE: "dev", OWNER: "callee" });
              return {};
            })),
      ));
  }, { config: project({ workflows: [caller, callee] }) });
});
