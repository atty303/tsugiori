import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import { assertEquals, AssertionError, assertRejects } from "@std/assert";
import {
  always,
  fromJSON,
  hashFiles,
  jsonValue,
  present,
  textValue,
  toJSON,
  workflow,
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
const detected = workflow(".github/workflows/sample.yml", {
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
  const result = await scenario(sample, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
    test.job("detect", (job) => {
      job.step("plan").fixture({
        outputs: { commits, stages: ["dev", "prd"] },
      });
    });
    test.job("deploy", (job) => {
      job.eachMatrix(({ stage }, run) => {
        run.step("run-deploy")
          .fixture({ outcome: stage === "prd" ? "failure" : "success" });

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["deploy"]!.instances, {
              stage,
            })
          ) assertEquals(i0.steps["run-deploy"]!.outcome !== "skipped", true);
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["deploy"]!.instances, {
              stage,
            })
          ) assertEntries(i0.steps["run-deploy"]!.inputs, { commits, stage });
        });
      });

      check((r) => {
        assertEquals(r.jobs["deploy"]!.instances.map((i) => i.matrix), [{
          stage: "dev",
        }, { stage: "prd" }]);
      });
      check((r) => {
        assertEquals(r.jobs["deploy"]!.result, "failure");
      });
    });
    test.job("complete", (job) => {
      job.step("notify").fixture({});

      check((r) => {
        for (const i0 of r.jobs["complete"]!.instances) {
          assertEquals(i0.steps["notify"]!.outcome !== "skipped", true);
        }
      });
      check((r) => {
        for (const i0 of r.jobs["complete"]!.instances) {
          assertEntries(i0.steps["notify"]!.inputs, {
            deployResult: "failure",
          });
        }
      });
    });
  });
  assertEquals(result.result, "failure");
  assertEquals(result.jobs.deploy!.instances.length, 2);
});

Deno.test("scenario requires fixtures only for reached steps", async () => {
  const result = await scenario(sample, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
    test.job("detect", (job) => {
      job.step("plan").fixture({ outputs: { commits: [], stages: undefined } });
    });
    test.job("deploy", (_job) => {
      check((r) => {
        assertEquals(r.jobs["deploy"]!.result, "skipped");
      });
    });
    test.job("complete", (job) => {
      job.step("notify").fixture({});

      check((r) => {
        for (const i0 of r.jobs["complete"]!.instances) {
          assertEntries(i0.steps["notify"]!.inputs, {
            deployResult: "skipped",
          });
        }
      });
    });
  });
  assertEquals(result.jobs.deploy!.result, "skipped");
});

Deno.test("scenario reports an absent reached fixture", async () => {
  await assertRejects(
    () =>
      scenario(sample, (test, _check) => {
        test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
      }),
    Error,
    "Reached authored step has no fixture",
  );
});

Deno.test("ordinary assertions are distinct from fixture errors", async () => {
  const commits = ["a".repeat(40)];
  const mismatch = await assertRejects(() =>
    scenario(sample, (test, check) => {
      test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
      test.job("complete", (job) => job.step("notify").fixture({}));
      test.job("detect", (job) => {
        job.step("plan").fixture({ outputs: { commits, stages: undefined } });

        check((r) => {
          for (const i0 of r.jobs["detect"]!.instances) {
            assertEntries(i0.steps["plan"]!.typedOutputs, {
              commits: ["b".repeat(40)],
            });
          }
        });
      });
    })
  );
  assertEquals(mismatch instanceof AssertionError, true);

  const invalid = await assertRejects(() =>
    scenario(sample, (test, _check) => {
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

const unsupported = workflow(".github/workflows/unsupported.yml", {
  on: { push: {} },
}).job("check", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({
      id: "inspect",
      name: "Inspect",
      run: "true",
      if: () => hashFiles("**/*.ts").eq("abc"),
    }));

Deno.test("hashFiles requires a return-value fixture", async () => {
  const error = await assertRejects(() =>
    scenario(unsupported, (test, _check) => {
      test.github({ event_name: "push", event: {} });
    })
  );
  assertEquals((error as { kind?: string }).kind, "fixture_missing");
  assertEquals(
    (error as { location?: string }).location?.endsWith("inspect.if"),
    true,
  );
  await scenario(unsupported, (test, check) => {
    test.github({ event_name: "push", event: {} });
    test.job("check", (job) => {
      job.step("inspect").hashFiles(["**/*.ts"], "abc").fixture({});

      check((r) => {
        for (const i0 of r.jobs["check"]!.instances) {
          assertEquals(i0.steps["inspect"]!.outcome !== "skipped", true);
        }
      });
    });
  });
});

Deno.test("branch filters skip the workflow without requiring step fixtures", async () => {
  const result = await scenario(sample, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/other", event: {} });

    check((r) => {
      assertEquals(r.result, "skipped");
    });
  });
  assertEquals(result.jobs, {});
});
