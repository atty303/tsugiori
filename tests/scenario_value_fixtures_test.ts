import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  format,
  jsonValue,
  literal,
  project,
  rawExpression,
  toJSON,
  workflow,
} from "../src/github_actions/mod.ts";
import { ScenarioError, StepScenario } from "../src/testing/mod.ts";

const hashes = workflow("hashes.yml", { on: { push: {} }, vars: ["PATTERN"] })
  .job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({
        matrix: { stage: ["dev", "prd"] },
      }).run({
        id: "read",
        name: "Read",
        run: "true",
        shell: rawExpression("hashFiles('shell')"),
        if: ({ hashFiles }) => hashFiles("condition").eq("run"),
        env: ({ hashFiles, vars, matrix, strategy }) => ({
          KEY: format("key-{0}", hashFiles(vars.PATTERN, "!vendor/**")),
          EMPTY: rawExpression("hashFiles('empty') || 'fallback'"),
          CASE: hashFiles("Lock"),
          STAGE: matrix.stage,
          MAX: toJSON(strategy["max-parallel"]),
        }),
      }),
  );

Deno.test("step hash return fixtures preserve expressions, inheritance and strategy inspection", async () => {
  const result = await scenario(hashes, (test, check) => {
    test.github({ event_name: "push" });
    test.vars({ PATTERN: "deno.lock" });
    test.job("build", (job) => {
      job.step("read").hashFiles(["condition"], "run")
        .hashFiles(["deno.lock", "!vendor/**"], "common")
        .hashFiles(["empty"], "").hashFiles(["Lock"], "case-sensitive")
        .hashFiles(["shell"], "bash")
        .fixture(({ env, strategy, matrix, tokenPermissions }) => {
          assertEquals(
            env.KEY,
            `key-${matrix.stage === "prd" ? "specific" : "common"}`,
          );
          assertEquals(env.EMPTY, "fallback");
          assertEquals(env.CASE, "case-sensitive");
          assertEquals(env.MAX, String(strategy["max-parallel"]));
          assertEquals(strategy["max-parallel"], 2);
          assertEquals(Object.isFrozen(strategy), true);
          assertEquals(tokenPermissions, undefined);
          return {};
        });
      job.eachMatrix(({ stage }, instance) => {
        if (stage === "prd") {
          instance.step("read").hashFiles(
            ["deno.lock", "!vendor/**"],
            "specific",
          );
        }
      });

      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEntries(i0.steps["read"]!.run!, { shell: "bash" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  assertEquals(
    result.jobs.build!.instances.map((i) => i.strategy["job-index"]),
    [0, 1],
  );
  assertEquals(result.jobs.build!.instances[0].strategy["max-parallel"], 2);
});

Deno.test("hash fixture missing errors identify the reached field", async () => {
  for (const paths of [[], ["condition"]] as const) {
    const error = await assertRejects(() =>
      scenario(hashes, (t, _check) => {
        t.github({ event_name: "push" });
        t.vars({ PATTERN: "deno.lock" });
        t.job("build", (j) => {
          const step = j.step("read").fixture({});
          if (paths.length) step.hashFiles(["condition"], "run");
        });
      }), ScenarioError);
    assertEquals(error.kind, "fixture_missing");
    assertEquals(
      error.location.endsWith(paths.length ? "read.env.KEY" : "read.if"),
      true,
    );
  }
});

Deno.test("lazy and skipped hash calls need no fixture; argument order/case remain exact", async () => {
  const flow = workflow("lazy.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "lazy",
          name: "Lazy",
          run: "true",
          if: rawExpression("true || hashFiles('unused')"),
          env: { VALUE: rawExpression("false && hashFiles('unused') || 'ok'") },
        })
        .run({
          id: "skip",
          name: "Skip",
          run: "true",
          if: rawExpression("false"),
          env: { VALUE: rawExpression("hashFiles('unused')") },
        }),
  );
  await scenario(flow, (t, check) => {
    t.github({ event_name: "push" });
    t.job("test", (j) => {
      j.step("lazy").fixture(({ env }) => {
        assertEquals(env.VALUE, "ok");
        return {};
      });
      j.step("skip");

      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["skip"]!.outcome !== "skipped", false);
        }
      });
    });
  });
  for (
    const args of [["!vendor/**", "deno.lock"], [
      "DENO.lock",
      "!vendor/**",
    ]] as const
  ) {
    const error = await assertRejects(() =>
      scenario(hashes, (t, _check) => {
        t.github({ event_name: "push" });
        t.vars({ PATTERN: "deno.lock" });
        t.job("build", (j) =>
          j.step("read").hashFiles(["condition"], "run").hashFiles(
            args,
            "wrong",
          ).fixture({}));
      }), ScenarioError);
    assertEquals(error.location.endsWith("read.env.KEY"), true);
  }
});

Deno.test("step named maps merge by key and keep JSON values atomic; explicit replacement drops all inherited rules", async () => {
  const flow = workflow("merge.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({ matrix: { n: [0, 1] } })
        .run({
          id: "read",
          name: "Read",
          run: "true",
          shell: "bash",
          workingDirectory: "src",
          outputs: ["a", "b"],
          env: ({ github, hashFiles }) => ({
            PATH: github.artifacts,
            HASH: hashFiles("file"),
          }),
        }),
  );
  await scenario(flow, (t, check) => {
    t.github({ event_name: "push" });
    t.job("test", (j) => {
      j.step("read").github({
        artifacts: "common",
        action_path: "common-action",
      }).hashFiles(["file"], "common")
        .fixture(({ env }) => {
          assertEquals(env.PATH, "common");
          return { outputs: { a: "A", b: "B" } };
        });
      j.eachMatrix(({ n }, i) => {
        if (n === 1) {
          i.step("read").github({ artifacts: "instance" })
            .hashFiles(["file"], "specific")
            .fixture(({ env }) => {
              assertEquals(env, { PATH: "instance", HASH: "specific" });
              return { outputs: { a: "A", b: "B" } };
            });
        }

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["test"]!.instances, { n })
          ) assertEntries(i0.steps["read"]!.typedOutputs, { b: "B" });
        });
      });

      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEntries(i0.steps["read"]!.run!, { shell: "bash" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEntries(i0.steps["read"]!.run!, {
            workingDirectory: "src",
          });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEntries(i0.steps["read"]!.typedOutputs, { a: "A" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  await scenario(flow, (t, check) => {
    t.github({ event_name: "push" });
    t.job("test", (j) => {
      j.step("read").github({ artifacts: "common" }).hashFiles(
        ["file"],
        "common",
      ).fixture(() => {
        throw Error("must be replaced");
      });
      j.eachMatrix((_, i) => {
        i.step("read").replaceInherited().github({ artifacts: "own" })
          .hashFiles(["file"], "own").fixture({});
        check((r) => {
          for (const i0 of r.jobs["test"]!.instances) {
            assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
          }
        });
      });

      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  const error = await assertRejects(() =>
    scenario(flow, (t, _check) => {
      t.github({ event_name: "push" });
      t.job("test", (j) => j.step("read").replaceInherited().fixture({}));
    }), ScenarioError);
  assertEquals(error.message.includes("eachMatrix"), true);
});

Deno.test("same-scope step registrations reject duplicate keys/scalars but permit disjoint names", () => {
  const cases: ((
    s: StepScenario<
      Record<string, string>,
      Record<string, string>,
      Record<string, never>
    >,
  ) => void)[] = [
    (s) => {
      s.fixture({});
      s.fixture({});
    },

    (s) => {
      s.github({ artifacts: "x" });
      s.github({ artifacts: "y" });
    },

    (s) => {
      s.hashFiles(["file"], "x");
      s.hashFiles(["file"], "y");
    },
    (s) => {
      s.replaceInherited();
      s.replaceInherited();
    },
  ];
  for (const define of cases) {
    assertThrows(() => define(new StepScenario({})), ScenarioError);
  }
});

Deno.test("max-parallel defaults do not become authored settings, and explicit limits are not clamped", async () => {
  for (
    const maxParallel of [
      undefined,
      9,
      rawExpression("fromJSON(vars.LIMIT)"),
    ] as const
  ) {
    const flow = workflow("strategy.yml", { on: { push: {} }, vars: ["LIMIT"] })
      .job(
        "test",
        ({ job }) =>
          job.runsOn("ubuntu-latest").strategy({
            matrix: { n: [0, 1] },
            ...(maxParallel === undefined ? {} : { maxParallel }),
          }).run({ id: "read", name: "Read", run: "true" }),
      );
    const result = await scenario(flow, (t, check) => {
      t.github({ event_name: "push" });
      t.vars({ LIMIT: "7" });
      t.job("test", (j) => {
        j.step("read").fixture({});

        check((r) => {
          for (const i0 of r.jobs["test"]!.instances) {
            assertEntries(i0.settings, {
              strategy: maxParallel === undefined
                ? {}
                : { maxParallel: typeof maxParallel === "number" ? 9 : 7 },
            });
          }
        });
      });
    });
    assertEquals(
      result.jobs.test!.instances[0].strategy["max-parallel"],
      maxParallel === undefined ? 2 : typeof maxParallel === "number" ? 9 : 7,
    );
    assertEquals(
      Object.hasOwn(
        result.jobs.test!.instances[0].settings!.strategy!,
        "maxParallel",
      ),
      maxParallel !== undefined,
    );
  }
});

const callee = workflow(".github/workflows/callee.yml", {
  on: {
    workflow_call: { inputs: { value: { type: "string", required: true } } },
  },
})
  .job(
    "work",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "value",
        name: "Value",
        run: "true",
        outputs: ["value"],
        env: ({ inputs }) => ({ VALUE: inputs.value }),
      }).outputs(({ steps }) => ({ value: steps.value.outputs.value })),
  )
  .workflowOutputs(({ jobs }) => ({ value: jobs.work.outputs.value }));
const calls = workflow(".github/workflows/calls.yml", { on: { push: {} } }).job(
  "call",
  ({ job }) =>
    job.reusable().strategy({ matrix: { value: ["first", "second", ""] } })
      .call("./.github/workflows/callee.yml", callee, {
        with: ({ matrix }) => ({ value: matrix.value }),
      }),
)
  .job(
    "consume",
    ({ job, jobs }) =>
      job.needs(jobs.call).runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
        env: ({ needs }) => ({ VALUE: needs.call.outputs.value }),
      }),
  );

Deno.test("reusable matrix output completion selects last successful nonempty output and propagates needs", async () => {
  for (
    const [order, expected] of [[[0, 1, 2], "second"], [
      [1, 0, 2],
      "first",
    ]] as const
  ) {
    const result = await scenario(calls, (t, _check) => {
      t.github({ event_name: "push" });
      t.job("call", (j) => {
        j.completionOrder(order);
        j.call(
          callee,
          (child) =>
            child.job(
              "work",
              (work) =>
                work.step("value").fixture(({ env }) => ({
                  outputs: { value: env.VALUE },
                })),
            ),
        );
      });
      t.job("consume", (j) =>
        j.step("read").fixture(({ env }) => {
          assertEquals(env.VALUE, expected);
          return {};
        }));
    }, { config: project({ workflows: [calls, callee] }) });
    assertEquals(result.jobs.call!.outputs.value, expected);
    assertEquals(
      result.jobs.call!.instances.map((i) => i.strategy["job-index"]),
      [0, 1, 2],
    );
  }
  const result = await scenario(calls, (t, check) => {
    t.github({ event_name: "push" });
    t.job("call", (j) => {
      j.completionOrder([0, 2, 1]);
      j.eachMatrix(({ value }, i) =>
        i.call(
          callee,
          (child) =>
            child.job("work", (work) =>
              work.step("value").fixture({
                outcome: value === "second" ? "failure" : "success",
                outputs: { value },
              })),
        )
      );
    });
    t.job("consume", (j) => {
      j.step("read");
      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
        }
      });
    });
  }, { config: project({ workflows: [calls, callee] }) });
  assertEquals(result.jobs.call!.outputs.value, "first");
});

Deno.test("ordinary matrix outputs accept supplied completion order without filtering failed jobs", async () => {
  const flow = workflow("ordinary.yml", { on: { push: {}, workflow_call: {} } })
    .job(
      "work",
      ({ job }) =>
        job.runsOn("ubuntu-latest").strategy({ matrix: { n: [0, 1] } }).run({
          id: "value",
          name: "Value",
          run: "true",
          outputs: ["value"],
        }).outputs(({ steps }) => ({ value: steps.value.outputs.value })),
    ).workflowOutputs(({ jobs }) => ({ value: jobs.work.outputs.value }));
  const result = await scenario(flow, (t, _check) => {
    t.github({ event_name: "push" });
    t.job("work", (j) => {
      j.completionOrder([0, 1]);
      j.eachMatrix(({ n }, i) =>
        i.step("value").fixture({
          outcome: n === 1 ? "failure" : "success",
          outputs: { value: String(n) },
        })
      );
    });
  });
  assertEquals(result.jobs.work!.outputs.value, "1");
  assertEquals(result.outputs?.value, "1");
  assertEquals(result.result, "failure");
  await assertRejects(
    () =>
      scenario(flow, (t, _check) => {
        t.github({ event_name: "push" });
        t.job("work", (j) => {
          j.eachMatrix(({ n }, i) =>
            i.step("value").fixture({ outputs: { value: String(n) } })
          );
        });
      }),
    ScenarioError,
    "different values",
  );
  for (const order of [[0], [0, 0], [0, 2], [-1, 0], [0, 0.5]]) {
    const error = await assertRejects(() =>
      scenario(flow, (t, _check) => {
        t.github({ event_name: "push" });
        t.job("work", (j) => {
          j.completionOrder(order);
          j.step("value").fixture({});
        });
      }), ScenarioError);
    assertEquals(error.kind, "fixture_invalid");
  }
});

Deno.test("ordinary assertions compare complete named JSON values", async () => {
  const record = jsonValue({
    parse(value: unknown): { left: number; right: number } {
      if (
        !value || typeof value !== "object" || !("left" in value) ||
        !("right" in value) || typeof value.left !== "number" ||
        typeof value.right !== "number"
      ) throw new TypeError();
      return { left: value.left, right: value.right };
    },
  });
  const flow = workflow("atomic.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({ matrix: { n: [0, 1] } }).task({
        id: "read",
        name: "Read",
        inputs: () => ({
          json: { from: literal('{"left":1,"right":2}'), contract: record },
          label: { from: literal("typed") },
        }),
        outputs: {},
        run: () => {},
      }),
  );
  await scenario(flow, (t, check) => {
    t.github({ event_name: "push" });
    t.job("build", (j) => {
      j.step("read").fixture({});
      j.eachMatrix((_, i) => {
        i.step("read");
        check((r) => {
          for (const i0 of r.jobs["build"]!.instances) {
            assertEntries(i0.steps["read"]!.inputs, {
              json: { left: 1, right: 2 },
            });
          }
        });
      });

      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEntries(i0.steps["read"]!.inputs, {
            label: "typed",
            json: { left: 1, right: 2 },
          });
        }
      });
    });
  });
  const error = await assertRejects(() =>
    scenario(flow, (t, check) => {
      t.github({ event_name: "push" });
      t.job("build", (j) => {
        j.step("read").fixture({});
        j.eachMatrix((_, i) => {
          i.step("read");
          check((r) => {
            for (const i0 of r.jobs["build"]!.instances) {
              assertEntries(i0.steps["read"]!.inputs, {
                json: { left: 1, right: 0 },
              });
            }
          });
        });

        check((r) => {
          for (const i0 of r.jobs["build"]!.instances) {
            assertEntries(i0.steps["read"]!.inputs, {
              label: "typed",
              json: { left: 1, right: 2 },
            });
          }
        });
      });
    })
  );
  assertEquals((error as Error).name, "AssertionError");
});

Deno.test("invalid native expressions fail instead of accepting field result overrides", async () => {
  const flow = workflow("invalid.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
        if: rawExpression("unknownPredicate()"),
      }),
  );
  const error = await assertRejects(() =>
    scenario(flow, (t, _check) => {
      t.github({ event_name: "push" });
      t.job("build", (j) => j.step("read").fixture({}));
    }), ScenarioError);
  assertEquals(error.kind, "expression_error");
  assertEquals(error.location.endsWith("read.if"), true);
  assertEquals(error.cause instanceof SyntaxError, true);
});

Deno.test("matrix reusable output selection is per-name and ignores later unsuccessful values", async () => {
  const flow = workflow("external-matrix.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable().strategy({ matrix: { n: [0, 1, 2, 3] } }).rawCall(
        "owner/repo/.github/workflows/callee.yml@v1",
        {},
      ),
  );
  const values = [
    { a: "a0", b: "b0" },
    { a: "a1", b: "" },
    { a: "", b: "b2" },
    { a: "failed", b: "failed" },
  ];
  const result = await scenario(flow, (t, _check) => {
    t.github({ event_name: "push" });
    t.job("call", (j) => {
      j.completionOrder([0, 1, 2, 3]);
      j.callFixture(({ matrix }) => ({
        outcome: matrix.n === 3 ? "failure" : "success",
        outputs: values[Number(matrix.n)],
      }));
    });
  });
  assertEquals(result.jobs.call!.outputs, { a: "a1", b: "b2" });
  assertEquals(result.result, "failure");
});

Deno.test("one step hash return fixture is shared across condition, env and Action inputs", async () => {
  const action = {
    name: "Cache",
    description: "Test metadata",
    uses: "actions/cache@v4",
    inputs: { key: { required: true, description: "Key" } },
    outputs: {},
  } as const;
  const flow = workflow("action-hash.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").uses(action, {
        id: "cache",
        name: "Cache",
        if: ({ hashFiles }) => hashFiles("deno.lock").ne(""),
        env: ({ hashFiles }) => ({ HASH: hashFiles("deno.lock") }),
        with: ({ hashFiles }) => ({
          key: format("deps-{0}", hashFiles("deno.lock")),
        }),
      }),
  );
  await scenario(flow, (t, _check) => {
    t.github({ event_name: "push" });
    t.job(
      "build",
      (j) =>
        j.step("cache").hashFiles(["deno.lock"], "fixture").fixture(
          ({ inputs, env }) => {
            assertEquals(inputs.key, "deps-fixture");
            assertEquals(env.HASH, "fixture");
            return {};
          },
        ),
    );
  });
});
