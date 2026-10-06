import { assertEquals, assertRejects } from "@std/assert";
import {
  always,
  defineWorkflow,
  fromJSON,
  hashFiles,
  jsonValue,
  present,
  scenario,
  textValue,
  toJSON,
} from "../src/github_actions.ts";

const strings = jsonValue({
  parse(value: unknown): string[] {
    if (
      !Array.isArray(value) || !value.every((item) => typeof item === "string")
    ) {
      throw new TypeError("Expected strings.");
    }
    return value;
  },
});
const stageValue = jsonValue({
  parse(value: unknown): string {
    if (typeof value !== "string") throw new TypeError("Expected stage.");
    return value;
  },
});
const detected = defineWorkflow(".github/workflows/sample.yml", {
  on: { push: { branches: ["main"] } },
}).job("detect", ({ job }) =>
  job.runsOn("ubuntu-24.04").task({
    id: "plan",
    name: "Plan",
    inputs: {},
    outputs: {
      commits: { contract: strings, required: true },
      stages: { contract: strings, required: false },
    },
    run: () => {
      throw new Error("Task body must not run.");
    },
  }).outputs(({ steps }) => ({
    commits: steps.plan.outputs.commits,
    stages: steps.plan.outputs.stages,
  })));
const deployed = detected.job(
  "deploy",
  ({ job, jobs }) =>
    job.needs(jobs.detect).runsOn("ubuntu-24.04")
      .when(({ needs }) => present(needs.detect.outputs.stages))
      .strategy(({ needs }) => ({
        matrix: { stage: fromJSON(needs.detect.outputs.stages) },
        failFast: false,
      }))
      .task({
        id: "run-deploy",
        name: "Deploy",
        inputs: ({ needs, matrix }) => ({
          commits: {
            contract: strings,
            from: needs.detect.outputs.commits,
          },
          stage: {
            contract: stageValue,
            from: toJSON(matrix.stage),
          },
        }),
        outputs: {},
        run: () => {
          throw new Error("Deploy must not run.");
        },
      }),
);
const sample = deployed.job(
  "complete",
  ({ job, jobs }) =>
    job.needs(jobs.detect, jobs.deploy).runsOn("ubuntu-24.04")
      .when(() => always())
      .task({
        id: "notify",
        name: "Notify",
        inputs: ({ needs }) => ({
          deployResult: {
            contract: textValue(),
            from: needs.deploy.result,
          },
        }),
        outputs: {},
        run: () => {
          throw new Error("Notify must not run.");
        },
      }),
);

Deno.test("scenario interprets matrix failure and downstream inputs without executing tasks", async () => {
  const commits = ["a".repeat(40)];
  const result = await scenario(sample, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
    test.job("detect", (job) => {
      job.step("plan").fixture({
        outputs: { commits, stages: ["dev", "prd"] },
      });
    });
    test.job("deploy", (job) => {
      job.expectMatrix([{ stage: "dev" }, { stage: "prd" }]);
      job.eachMatrix(({ stage }, run) => {
        run.step("run-deploy")
          .fixture({ outcome: stage === "prd" ? "failure" : "success" })
          .expectRun()
          .expectInputs({ commits, stage });
      });
      job.expectResult("failure");
    });
    test.job("complete", (job) => {
      job.step("notify").fixture({}).expectRun().expectInputs({
        deployResult: "failure",
      });
    });
  });
  assertEquals(result.result, "failure");
  assertEquals(result.jobs.deploy.instances.length, 2);
});

Deno.test("scenario requires fixtures only for reached steps", async () => {
  const result = await scenario(sample, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
    test.job("detect", (job) => {
      job.step("plan").fixture({ outputs: { commits: [], stages: undefined } });
    });
    test.job("deploy", (job) => job.expectResult("skipped"));
    test.job("complete", (job) => {
      job.step("notify").fixture({}).expectInputs({ deployResult: "skipped" });
    });
  });
  assertEquals(result.jobs.deploy.result, "skipped");
});

Deno.test("scenario reports an absent reached fixture", async () => {
  await assertRejects(
    () =>
      scenario(sample, (test) => {
        test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
      }),
    Error,
    "Reached authored step has no fixture",
  );
});

Deno.test("scenario distinguishes expectation failures from fixture errors", async () => {
  const commits = ["a".repeat(40)];
  const mismatch = await assertRejects(() =>
    scenario(sample, (test) => {
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
      test.job("detect", (job) => {
        job.step("plan").fixture({ outputs: { commits, stages: undefined } })
          .expectOutputs({ commits: ["b".repeat(40)] });
      });
    })
  );
  assertEquals((mismatch as { kind?: string }).kind, "expectation_failed");
  assertEquals(
    (mismatch as { location?: string }).location?.includes("detect"),
    true,
  );

  const invalid = await assertRejects(() =>
    scenario(sample, (test) => {
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
      test.job("detect", (job) => {
        job.step("plan").fixture({ outputs: { commits, stages: ["dev"] } });
      });
      test.job("deploy", (job) =>
        job.eachMatrix((_, run) => {
          run.step("run-deploy").fixture({});
        }));
    })
  );
  assertEquals((invalid as { kind?: string }).kind, "fixture_missing");
});

const unsupported = defineWorkflow(".github/workflows/unsupported.yml", {
  on: { push: {} },
}).job("check", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({
      id: "inspect",
      name: "Inspect",
      run: "true",
      if: () => hashFiles("**/*.ts").eq("abc"),
    }));

Deno.test("unsupported hashFiles requires a field override", async () => {
  const error = await assertRejects(() =>
    scenario(unsupported, (test) => {
      test.github({ event_name: "push", event: {} });
    })
  );
  assertEquals((error as { kind?: string }).kind, "expression_unsupported");
  assertEquals(
    (error as { location?: string }).location?.endsWith("inspect.if"),
    true,
  );
  await scenario(unsupported, (test) => {
    test.github({ event_name: "push", event: {} });
    test.job("check", (job) => {
      job.step("inspect").expression("if", true).fixture({}).expectRun();
    });
  });
});

Deno.test("branch filters skip the workflow without requiring step fixtures", async () => {
  const result = await scenario(sample, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/other", event: {} });
    test.expectResult("skipped");
  });
  assertEquals(result.jobs, {});
});
