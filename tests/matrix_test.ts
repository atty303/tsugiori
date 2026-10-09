import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  always,
  failure,
  fromJSON,
  literal,
  project,
  rawExpression,
  workflow,
} from "../src/github_actions.ts";
import {
  AuthoringValidationError,
  lowerProject,
} from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { MatrixError, matrixRows } from "../src/github_actions/matrix.ts";

Deno.test("native matrix include augments original rows, excludes first, and never augments appended rows", () => {
  assertEquals(
    matrixRows({
      fruit: ["apple", "pear"],
      animal: ["cat", "dog"],
      include: [
        { color: "green" },
        { color: "pink", animal: "cat" },
        { fruit: "apple", shape: "circle" },
        { fruit: "banana" },
        { fruit: "banana", animal: "cat" },
      ],
    }),
    [
      { fruit: "apple", animal: "cat", color: "pink", shape: "circle" },
      { fruit: "apple", animal: "dog", color: "green", shape: "circle" },
      { fruit: "pear", animal: "cat", color: "pink" },
      { fruit: "pear", animal: "dog", color: "green" },
      { fruit: "banana" },
      { fruit: "banana", animal: "cat" },
    ],
  );
  assertEquals(
    matrixRows({
      os: ["linux", "mac"],
      node: [{ version: 20 }, { version: 22 }],
      exclude: [{ os: "mac" }],
      include: [{ os: "linux", node: { version: 22 }, report: true }, {
        os: "mac",
        node: { version: 24 },
      }],
    }),
    [
      { os: "linux", node: { version: 20 } },
      { os: "linux", node: { version: 22 }, report: true },
      { os: "mac", node: { version: 24 } },
    ],
  );
  assertEquals(matrixRows({ include: [{ a: 1 }, { b: 2 }] }), [{ a: 1 }, {
    b: 2,
  }]);
  assertEquals(
    matrixRows({ OS: ["linux"], include: [{ os: "linux", flag: true }] }),
    [{ OS: "linux", flag: true }],
  );
});

Deno.test("matrix limits apply after exclusion and include, also to resolved expression matrices", () => {
  const numbers = Array.from({ length: 257 }, (_, i) => i);
  assertEquals(matrixRows({ n: numbers, exclude: [{ n: 256 }] })!.length, 256);
  assertThrows(() => matrixRows({ n: numbers }), MatrixError, "256");
  assertThrows(
    () => matrixRows({ n: numbers.slice(0, 256), include: [{ n: 257 }] }),
    MatrixError,
    "256",
  );
  for (
    const value of [{ n: [] }, { n: [NaN] }, { n: [null] }, { include: [1] }, {
      exclude: [{ n: () => {} }],
    }, { N: [1], n: [2] }]
  ) assertThrows(() => matrixRows(value), MatrixError);
  assertEquals(matrixRows({ n: "${{ inputs.values }}" }, true), undefined);
  assertThrows(
    () => matrixRows({ n: "${{ inputs.values }}", include: [1] }, true),
    MatrixError,
  );
});

Deno.test("object matrix controls generate native YAML and interpret per-member step/job failure tolerance", async () => {
  const ci = workflow("matrix.yml", { on: { push: {} } })
    .job("build", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({
          matrix: {
            target: [{ runner: "ubuntu-latest", experimental: false }, {
              runner: "macos-latest",
              experimental: true,
            }],
            exclude: [{
              target: { runner: "ubuntu-latest", experimental: false },
            }],
          },
          failFast: literal(false),
          maxParallel: literal(2),
        })
        .runsOn(({ matrix }) => matrix.target.runner)
        .continueOnError(({ matrix }) => matrix.target.experimental)
        .timeoutMinutes(720)
        .run({
          id: "probe",
          name: "Probe",
          run: "probe",
          outputs: ["version"],
          continueOnError: () => literal(false),
        })
        .run({ id: "skipped", name: "Skipped", run: "true" })
        .run({
          id: "recover",
          name: "Recover",
          if: () => failure(),
          run: "true",
          env: ({ job }) => ({ STATUS: job.status }),
        })
        .outputs(({ steps }) => ({ version: steps.probe.outputs.version })))
    .job(
      "next",
      ({ job, jobs }) =>
        job.needs(jobs.build).runsOn("ubuntu-latest")
          .run({
            id: "next",
            name: "Next",
            run: "true",
            env: ({ needs }) => ({
              RESULT: needs.build.result,
              VERSION: needs.build.outputs.version,
            }),
          }),
    );
  const yaml = emitWorkflow(
    lowerProject(project({ workflows: [ci] }), "workflows.ts").workflows[0]
      .workflow,
  );
  for (
    const field of [
      "max-parallel: ${{ 2 }}",
      "fail-fast: ${{ false }}",
      "continue-on-error: ${{ matrix.target.experimental }}",
      "timeout-minutes: 720",
      "exclude:",
      "experimental: true",
    ]
  ) assertStringIncludes(yaml, field);
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => {
      job;
      job.step("probe").fixture({
        outcome: "failure",
        outputs: { version: "v1" },
      });
      job.step("skipped");
      job.step("recover").fixture(({ env }) => {
        assertEquals(env.STATUS, "failure");
        return {};
      });

      check((r) => {
        assertEquals(r.jobs["build"]!.instances.map((i) => i.matrix), [{
          target: { runner: "macos-latest", experimental: true },
        }]);
      });
      check((r) => {
        assertEquals(r.jobs["build"]!.result, "success");
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEntries(i0.settings, {
            runsOn: "macos-latest",
            strategy: { failFast: false, maxParallel: 2 },
            continueOnError: true,
            timeoutMinutes: 720,
          });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEquals(i0.steps["probe"]!.outcome, "failure");
        }
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEquals(i0.steps["probe"]!.conclusion, "failure");
        }
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEquals(i0.steps["skipped"]!.outcome !== "skipped", false);
        }
      });
    });
    test.job("next", (job) =>
      job.step("next").fixture(({ env }) => {
        assertEquals(env.RESULT, "success");
        assertEquals(env.VERSION, "v1");
        return {};
      }));

    check((r) => {
      assertEquals(r.result, "success");
    });
  });
  assertEquals(result.jobs.build!.instances[0].outcome, "failure");
  assertEquals(result.jobs.build!.instances[0].result, "success");
});

Deno.test("step failure tolerance evaluates boolean expressions rather than expression-string truthiness", async () => {
  const ci = workflow("step.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({ matrix: { tolerant: [true, false] } })
        .run({
          id: "probe",
          name: "Probe",
          run: "true",
          continueOnError: ({ matrix }) => matrix.tolerant,
        })
        .run({ id: "next", name: "Next", run: "true" })
        .run({
          id: "cleanup",
          name: "Cleanup",
          run: "true",
          if: () => always(),
        }),
  );
  await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("test", (job) =>
      job.eachMatrix(({ tolerant }, member) => {
        member;
        member.step("probe").fixture({ outcome: "failure" });
        if (tolerant) member.step("next").fixture({});
        else member.step("next");
        member.step("cleanup").fixture({});

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["test"]!.instances, {
              tolerant,
            })
          ) assertEquals(i0.result, tolerant ? "success" : "failure");
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["test"]!.instances, {
              tolerant,
            })
          ) {
            assertEquals(
              i0.steps["probe"]!.conclusion,
              tolerant ? "success" : "failure",
            );
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["test"]!.instances, {
              tolerant,
            })
          ) assertEquals(i0.steps["next"]!.outcome !== "skipped", tolerant);
        });
      }));

    check((r) => {
      assertEquals(r.result, "failure");
    });
  });
});

Deno.test("resolved strategy controls, timeout and matrix shapes reject invalid values at their field", async () => {
  const matrix = { n: Array.from({ length: 257 }, (_, i) => i) };
  const dynamic = workflow("dynamic.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy(() => ({
          matrix: fromJSON(literal(JSON.stringify(matrix))).as<{ n: number }>(),
        }))
        .run({ id: "probe", name: "Probe", run: "true" }),
  );
  await assertRejects(
    () =>
      scenario(dynamic, (test, _check) => {
        test.github({ event_name: "push" });
      }),
    Error,
    "256",
  );
  for (
    const [field, expression] of [
      ["maxParallel", "0"],
      ["maxParallel", "1.5"],
      ["failFast", "'false'"],
    ] as const
  ) {
    const ci = workflow("bad.yml", { on: { push: {} } }).job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest")
          .strategy({ matrix: { n: [1] }, [field]: rawExpression(expression) })
          .run({ id: "probe", name: "Probe", run: "true" }),
    );
    await assertRejects(
      () =>
        scenario(ci, (test, _check) => {
          test.github({ event_name: "push" });
        }),
      Error,
      "Setting must resolve",
    );
  }
  for (const n of [0, -1, 1.5, NaN, Infinity]) {
    const ci = workflow("invalid.yml", { on: { push: {} } }).job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").timeoutMinutes(n).run({
          name: "Test",
          run: "true",
        }),
    );
    assertThrows(
      () => lowerProject(project({ workflows: [ci] }), "workflows.ts"),
      AuthoringValidationError,
    );
  }
  const step = workflow("step-limit.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        name: "Test",
        run: "true",
        timeoutMinutes: 361,
      }),
  );
  assertThrows(
    () => lowerProject(project({ workflows: [step] }), "workflows.ts"),
    AuthoringValidationError,
  );
});

Deno.test("task and uses failure policies retain scoped expressions through lowering, and cancellation is never tolerated", async () => {
  const ci = workflow("task-policy.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .continueOnError(true)
        .task({
          id: "probe",
          name: "Probe",
          outputs: { value: { required: true } },
          continueOnError: () => literal(true),
          run: () => {
            throw new Error("Must not execute");
          },
        })
        .uses("owner/action@v1", {
          id: "uses",
          name: "Uses",
          continueOnError: ({ steps }) => steps.probe.outcome.eq("failure"),
        })
        .run({ id: "cancel", name: "Cancel", run: "true" }),
  );
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => {
      job.step("probe").fixture({ outcome: "failure" });
      job.step("uses").fixture({ outcome: "failure" });
      job.step("cancel").fixture({ outcome: "cancelled" });

      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["probe"]!.conclusion, "success");
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["uses"]!.conclusion, "success");
        }
      });
    });

    check((r) => {
      assertEquals(r.result, "cancelled");
    });
  });
  assertEquals(result.jobs.test!.instances[0].outcome, "cancelled");
});

Deno.test("job failure tolerance expressions must resolve to boolean, and timeout getters expose resolved requests", async () => {
  for (
    const field of [
      "continue-on-error",
      "timeout-minutes",
    ] as const
  ) {
    const ci = workflow("invalid-controls.yml", { on: { push: {} } }).job(
      "test",
      ({ job }) => {
        let exec = job.runsOn("ubuntu-latest");
        if (field === "continue-on-error") {
          exec = exec.continueOnError(rawExpression("'false'"));
        }
        if (field === "timeout-minutes") {
          exec = exec.timeoutMinutes(rawExpression("0"));
        }
        return exec.run({
          id: "probe",
          name: "Probe",
          run: "true",
        });
      },
    );
    await assertRejects(
      () =>
        scenario(ci, (test, check) => {
          test.github({ event_name: "push" });
          test.job("test", (job) => {
            job.step("probe").fixture({});

            check((r) => {
              for (const i0 of r.jobs["test"]!.instances) {
                assertEntries(i0.settings, { timeoutMinutes: 1 });
              }
            });
          });
        }),
      Error,
      "Setting must resolve",
    );
  }
});

Deno.test("missing matrix properties are native empty values, not missing external fixtures", async () => {
  const ci = workflow("optional-matrix.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({
          matrix: {
            target: [{ version: 20 }, { version: 22, experimental: true }],
          },
        })
        .continueOnError(({ matrix }) => matrix.target.experimental.or(false))
        .run({ id: "probe", name: "Probe", run: "true" }),
  );
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("test", (job) =>
      job.eachMatrix(({ target }, instance) => {
        instance.step("probe").fixture({ outcome: "failure" });
        instance;

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["test"]!.instances, { target })
          ) {
            assertEquals(
              i0.result,
              target.experimental ? "success" : "failure",
            );
          }
        });
      }));
  });
  assertEquals(result.result, "failure");
});

Deno.test("matrix outputs evaluate the corresponding member's strategy context", async () => {
  const ci = workflow("indices.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({ matrix: { n: [1, 2] } })
        .run({ id: "probe", name: "Probe", run: "true" })
        .outputs(() => ({
          a: rawExpression(
            "matrix.n == 1 && format('{0}', strategy['job-index']) || ''",
          ),
          b: rawExpression(
            "matrix.n == 2 && format('{0}', strategy['job-index']) || ''",
          ),
        })),
  );
  const result = await scenario(ci, (test, _check) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => job.step("probe").fixture({}));
  });
  assertEquals(result.jobs.test!.outputs, { a: "0", b: "1" });
});
