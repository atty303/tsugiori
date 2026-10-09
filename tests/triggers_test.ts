import {
  assertEntries,
  checkedScenario as scenario,
} from "./scenario_checks.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  eventIs,
  literal,
  project,
  workflow,
  type WorkflowTriggers,
} from "../src/github_actions/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import { ScenarioError } from "../src/testing/mod.ts";
import { validateTriggers } from "../src/compiler/github_actions/triggers.ts";
import { activities } from "../src/github_actions/events.ts";

const entrypointUrl = "file:///tmp/triggers/workflows.ts";
function make(on: WorkflowTriggers) {
  return workflow("ci.yml", { on }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ id: "run", name: "Run", run: "true" }),
  );
}

Deno.test("all frozen event declarations reach normal YAML without losing settings", () => {
  for (const event of Object.keys(activities)) {
    const settings = event === "schedule"
      ? [{ cron: "0 4 * * MON", timezone: "Asia/Tokyo" }]
      : event === "workflow_run"
      ? { workflows: ["Build"], types: ["completed"] }
      : {};
    const on = { [event]: settings } as WorkflowTriggers;
    const flow = make(on);
    const lowered = lowerProject(project({ workflows: [flow] }), entrypointUrl);
    const document = parse(emitWorkflow(lowered.workflows[0].workflow)) as {
      on: unknown;
    };
    assertEquals(document.on, on, event);
  }
});

Deno.test("native validation rejects conflicting filters and event-specific mistakes", () => {
  const cases: unknown[] = [
    { push: { branches: ["main"], "branches-ignore": ["dev"] } },
    { push: { paths: ["!src/**"] } },
    { push: { tags: [] } },
    { issues: { types: ["synchronize"] } },
    { check_suite: { types: ["requested"] } },
    { create: { types: ["created"] } },
    { workflow_run: {} },
    { schedule: [{ cron: "@daily" }] },
    { schedule: [{ cron: "60 0 * * *" }] },
    { schedule: [{ cron: "0 0 * * *", timezone: "Not/AZone" }] },
    {
      workflow_dispatch: {
        inputs: { enabled: { type: "boolean", default: "true" } },
      },
    },
    {
      workflow_dispatch: {
        inputs: {
          stage: { type: "choice", options: ["dev"], default: "prod" },
        },
      },
    },
    { workflow_call: { secrets: { token: { required: "yes" } } } },
  ];
  for (const on of cases) {
    assert(validateTriggers(on).length, JSON.stringify(on));
  }
  for (const count of [25, 26]) {
    const inputs = Object.fromEntries(
      Array.from(
        { length: count },
        (_, i) => [`input_${i}`, { type: "string" }],
      ),
    );
    assertEquals(
      validateTriggers({ workflow_dispatch: { inputs } }).length > 0,
      count === 26,
    );
  }
  assertEquals(
    validateTriggers({
      push: {
        branches: [
          "releases/**",
          "!releases/**-alpha",
          "releases/special-alpha",
        ],
        "tags-ignore": ["v*-alpha"],
        paths: ["**.ts"],
      },
      schedule: [{ cron: "20/15 4-6 * JAN-DEC MON-FRI" }],
    }),
    [],
  );
});

Deno.test("ordered branch and path filters use explicit bounded diff facts", async () => {
  const flow = make({
    push: {
      branches: [
        "main",
        "release/**",
        "!release/**-alpha",
        "release/special-alpha",
      ],
      paths: ["**/*.ts", "!generated/**"],
    },
  });
  for (
    const [branch, files, expected] of [
      ["main", ["main.ts"], "success"],
      ["release/1-alpha", ["src/main.ts"], "skipped"],
      ["release/special-alpha", ["src/main.ts"], "success"],
      ["main", ["generated/main.ts"], "skipped"],
      ["main", [], "skipped"],
      ["main", [
        ...Array.from({ length: 300 }, () => "README.md"),
        "main.ts",
      ], "skipped"],
    ] as const
  ) {
    const result = await scenario(flow, (test, _check) => {
      test.github({ event_name: "push", ref: `refs/heads/${branch}` });
      test.changedFiles(files);
      test.job("test", (job) => job.step("run").fixture({}));
    });
    assertEquals(result.result, expected);
  }
  for (const reason of ["timeout", "over-1000-commits"] as const) {
    assertEquals(
      (await scenario(flow, (test, _check) => {
        test.github({ event_name: "push", ref: "refs/heads/main" });
        test.changedFiles(reason);
        test.job("test", (job) => job.step("run").fixture({}));
      })).result,
      "success",
    );
  }
  const missing = await assertRejects(
    () =>
      scenario(
        flow,
        (test, _check) =>
          test.github({ event_name: "push", ref: "refs/heads/main" }),
      ),
    ScenarioError,
  );
  assertEquals((missing as ScenarioError).kind, "fixture_missing");
  const tag = make({ push: { paths: ["src/**"] } });
  assertEquals(
    (await scenario(tag, (test, _check) => {
      test.github({ event_name: "push", ref: "refs/tags/v1" });
      test.job("test", (job) => job.step("run").fixture({}));
    })).result,
    "success",
  );
});

Deno.test("PR base filters, activity defaults and ignored paths determine admission", async () => {
  const flow = make({
    pull_request: { branches: ["main"], "paths-ignore": ["docs/**"] },
  });
  for (
    const [action, branch, files, expected] of [
      ["opened", "main", ["docs/a.md", "src/main.ts"], "success"],
      ["opened", "main", ["docs/a.md"], "skipped"],
      ["opened", "dev", ["src/main.ts"], "skipped"],
      ["labeled", "main", ["src/main.ts"], "skipped"],
    ] as const
  ) {
    const result = await scenario(flow, (test, _check) => {
      test.github({
        event_name: "pull_request",
        event: { action, pull_request: { base: { ref: branch } } },
      });
      test.changedFiles(files);
      test.job("test", (job) => job.step("run").fixture({}));
    });
    assertEquals(result.result, expected);
  }
  await assertRejects(
    () =>
      scenario(
        flow,
        (test, _check) =>
          test.github({ event_name: "pull_request", event: {} }),
      ),
    ScenarioError,
  );
});

Deno.test("workflow_run, merge_group, custom dispatch, images and delivered schedules", async () => {
  const flow = make({
    workflow_run: {
      workflows: ["Build"],
      types: ["completed"],
      branches: ["main"],
    },
    merge_group: { branches: ["main"] },
    repository_dispatch: { types: ["deploy"] },
    image_version: { names: ["My*"], versions: ["1.*"] },
    schedule: [{ cron: "0 4 * * MON", timezone: "Asia/Tokyo" }],
  });
  const fixtures = [
    {
      event_name: "workflow_run",
      event: {
        action: "completed",
        workflow: { name: "Build" },
        workflow_run: { head_branch: "main" },
      },
    },
    {
      event_name: "merge_group",
      event: {
        action: "checks_requested",
        merge_group: { base_ref: "refs/heads/main" },
      },
    },
    {
      event_name: "repository_dispatch",
      event: { action: "deploy", client_payload: { stage: "dev" } },
    },
    { event_name: "image_version", event: {} },
    { event_name: "schedule", event: { schedule: "0 4 * * MON" } },
  ] as const;
  for (const fixture of fixtures) {
    assertEquals(
      (await scenario(flow, (test, _check) => {
        test.github(fixture);
        test.imageVersion({ name: "MyImage", version: "1.0.0" });
        test.job("test", (job) => job.step("run").fixture({}));
      })).result,
      "success",
    );
  }
  assertEquals(
    (await scenario(flow, (test, _check) =>
      test.github({
        event_name: "schedule",
        event: { schedule: "0 5 * * MON" },
      }))).result,
    "skipped",
  );
  assertEquals(
    (await scenario(flow, (test, _check) =>
      test.github({
        event_name: "repository_dispatch",
        event: { action: "preview" },
      }))).result,
    "skipped",
  );
});

Deno.test("dispatch inputs preserve native values and provide string payload inputs", async () => {
  const flow = workflow("dispatch.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          enabled: { type: "boolean", default: true },
          count: { type: "number", default: 3 },
          stage: { type: "environment", default: "dev" },
          mode: { type: "choice", options: ["fast", "slow"], default: "fast" },
        },
      },
    },
  })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "run",
          name: "Run",
          run: "true",
          env: ({ github, inputs }) => ({
            NATIVE: inputs.enabled,
            WIRE: github.event.inputs.enabled,
            COUNT: inputs.count,
          }),
        }),
    );
  const result = await scenario(flow, (test, _check) => {
    test.github({ event_name: "workflow_dispatch" });
    test.job("test", (job) =>
      job.step("run").fixture(({ env }) => {
        assertEquals(env, { NATIVE: "true", WIRE: "true", COUNT: "3" });
        return {};
      }));
  });
  assertEquals(result.result, "success");
  await assertRejects(() =>
    scenario(flow, (test, _check) => {
      test.github({ event_name: "workflow_dispatch" });
      // @ts-expect-error runtime validation also rejects an untyped fixture
      test.inputs({ enabled: "yes" });
    }), ScenarioError);
});

Deno.test("event guards emit native conditions and remain enforced across later when calls", async () => {
  const flow = workflow("guard.yml", { on: { push: {}, issues: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .when(({ github }) => eventIs(github, "issues", "opened"))
        .when(() => literal(true))
        .run({
          id: "run",
          name: "Run",
          run: "true",
          env: ({ github }) => ({ TITLE: github.event.issue.title }),
        }),
  );
  assertEquals(
    (await scenario(
      flow,
      (test, _check) =>
        test.github({ event_name: "push", event: { ref: "refs/heads/main" } }),
    ))
      .result,
    "success",
  );
  const skipped = await scenario(
    flow,
    (test, _check) =>
      test.github({ event_name: "push", event: { ref: "refs/heads/main" } }),
  );
  assertEquals(skipped.jobs.test!.result, "skipped");
  const result = await scenario(flow, (test, _check) => {
    test.github({
      event_name: "issues",
      event: { action: "opened", issue: { title: "fixture" } },
    });
    test.job("test", (job) =>
      job.step("run").fixture(({ env }) => {
        assertEquals(env.TITLE, "fixture");
        return {};
      }));
  });
  assertEquals(result.result, "success");
  const missing = await assertRejects(() =>
    scenario(flow, (test, _check) => {
      test.github({ event_name: "issues", event: { action: "opened" } });
      test.job("test", (job) => job.step("run").fixture({}));
    }), ScenarioError);
  assertEquals((missing as ScenarioError).kind, "fixture_missing");
  assert((missing as ScenarioError).location.includes("env.TITLE"));
  assert((missing as Error).message.includes("github.event.issue"));
  const emitted = emitWorkflow(
    lowerProject(project({ workflows: [flow] }), entrypointUrl).workflows[0]
      .workflow,
  );
  assert(emitted.includes("github.event_name == 'issues'"));
  assert(emitted.includes("github.event.action == 'opened'"));
});

Deno.test("reusable defaults evaluate in inherited context without changing event identity", async () => {
  const callee = workflow(".github/workflows/callee.yml", {
    on: {
      workflow_call: {
        inputs: {
          sha: {
            type: "string",
            default: ({ github }) => github.sha,
          },
          enabled: { type: "boolean", default: literal(true) },
          count: { type: "number", default: literal(2) },
        },
      },
    },
  })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").when(({ github }) =>
          eventIs(github, "push")
        ).run({
          id: "run",
          name: "Run",
          run: "true",
          env: ({ github, inputs }) => ({
            REF: github.event.ref,
            SHA: inputs.sha,
          }),
        }),
    );
  const caller = workflow(".github/workflows/caller.yml", { on: { push: {} } })
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/callee.yml", callee, {}),
    );
  const result = await scenario(caller, (test, check) => {
    test.github({
      event_name: "push",
      sha: "abc",
      event: { ref: "refs/heads/main" },
    });
    test.job("call", (job) => {
      job.call(
        callee,
        (child) =>
          child.job("test", (job) =>
            job.step("run").fixture(({ env }) => {
              assertEquals(env, { REF: "refs/heads/main", SHA: "abc" });
              return {};
            })),
      );

      check((r) => {
        for (const i0 of r.jobs["call"]!.instances) {
          assertEntries(i0.callInputs!, {
            sha: "abc",
            enabled: true,
            count: 2,
          });
        }
      });
    });
  }, { config: project({ workflows: [caller, callee] }) });
  assertEquals(result.result, "success");
});

Deno.test("every frozen activity is accepted and an unselected activity skips", async () => {
  for (const [event, types] of Object.entries(activities)) {
    for (const action of types) {
      const on = {
        [event]: {
          types: [action],
          ...(event === "workflow_run" ? { workflows: ["Build"] } : {}),
        },
      } as WorkflowTriggers;
      for (
        const [fixtureAction, expected] of [[action, "success"], [
          "unselected",
          "skipped",
        ]] as const
      ) {
        const result = await scenario(make(on), (test, _check) => {
          // Exercise the runtime oracle for a dynamically enumerated catalog; static fixtures are checked separately.
          test.program.external.github = {
            event_name: event,
            event: { action: fixtureAction, workflow_run: { name: "Build" } },
          };
          test.job("test", (job) => job.step("run").fixture({}));
        });
        assertEquals(result.result, expected, `${event}.${action}`);
      }
    }
  }
});

Deno.test("escaped literal filter atoms can be repeated", async () => {
  const on = { push: { paths: ["file\\*?.txt"] } };
  assertEquals(validateTriggers(on), []);
  for (
    const [file, expected] of [["file.txt", "success"], [
      "file*.txt",
      "success",
    ], ["file**.txt", "skipped"]] as const
  ) {
    const result = await scenario(make(on), (test, _check) => {
      test.github({ event_name: "push", ref: "refs/heads/main" });
      test.changedFiles([file]);
      test.job("test", (job) => job.step("run").fixture({}));
    });
    assertEquals(result.result, expected);
  }
});

Deno.test("reusable workflows preserve arbitrary caller dispatch input strings", async () => {
  const callee = workflow(".github/workflows/callee.yml", {
    on: { workflow_call: {} },
  }).job("read", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .when(({ github }) => eventIs(github, "workflow_dispatch"))
      .run({
        id: "read",
        name: "Read",
        run: "true",
        env: ({ github }) => ({ WIRE: github.event.inputs.enabled }),
      }));
  const caller = workflow(".github/workflows/caller.yml", {
    on: {
      workflow_dispatch: {
        inputs: { enabled: { type: "boolean", default: true } },
      },
    },
  }).job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/callee.yml", callee, {}),
  );
  const result = await scenario(caller, (test, _check) => {
    test.github({ event_name: "workflow_dispatch" });
    test.job("call", (job) =>
      job.call(
        callee,
        (child) =>
          child.job("read", (job) =>
            job.step("read").fixture(({ env }) => {
              assertEquals(env.WIRE, "true");
              return {};
            })),
      ));
  }, { config: project({ workflows: [caller, callee] }) });
  assertEquals(result.result, "success");
});
