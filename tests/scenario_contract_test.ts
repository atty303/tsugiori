import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import { assertEquals, assertRejects } from "@std/assert";
import {
  always,
  jsonValue,
  project,
  rawExpression,
  textValue,
  workflow,
} from "../src/github_actions.ts";

const countValue = jsonValue({
  parse(value: unknown): number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error("Expected integer");
    }
    return value;
  },
});
const action = {
  name: "Action",
  description: "Action metadata",
  uses: "example/action@0123456789abcdef0123456789abcdef01234567",
  inputs: { value: { description: "Input", required: true } },
  outputs: { "token": { description: "Output" } },
} as const;
const taskMustNotRun = () => {
  throw new Error("Task body was executed");
};

const wired = workflow(".github/workflows/wired.yml", {
  on: {
    workflow_dispatch: {
      inputs: { value: { type: "string", required: true } },
    },
  },
}).job("produce", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .task({
      id: "number",
      name: "Number",
      inputs: {},
      outputs: {
        count: { contract: countValue, required: true },
        label: { required: false },
      },
      run: taskMustNotRun,
    }).outputs(({ steps }) => ({
      count: steps.number.outputs.count,
      label: steps.number.outputs.label,
    })))
  .job(
    "consume",
    ({ job, jobs }) =>
      job.needs(jobs.produce).runsOn("ubuntu-latest")
        .task({
          id: "read",
          name: "Read number",
          inputs: ({ needs }) => ({
            count: {
              from: needs.produce.outputs.count,
            },
            label: { from: needs.produce.outputs.label },
          }),
          outputs: { reply: { required: true }, omitted: { required: false } },
          run: taskMustNotRun,
        })
        .uses(action, {
          id: "action",
          name: "Use action",
          with: ({ inputs }) => ({ value: inputs.value }),
        })
        .task({
          id: "after",
          name: "After action",
          if: () => always(),
          inputs: ({ steps }) => ({
            token: {
              from: steps.action.outputs.token,
            },
          }),
          outputs: {},
          run: taskMustNotRun,
        }),
  );

Deno.test("harness wires typed task values, action strings, and evaluated inputs", async () => {
  const result = await scenario(wired, (test, check) => {
    test.github({ event_name: "workflow_dispatch", event: {} });
    test.inputs({ value: "request" });
    test.job("produce", (job) => {
      job.step("number").fixture({ outputs: { count: 7 } });

      check((r) => {
        assertEntries(r.jobs["produce"]!.outputs, { count: "7", label: "" });
      });
    });
    test.job("consume", (job) => {
      job.step("read").fixture(({ inputs }) => {
        assertEquals(inputs.count, 7);
        assertEquals(inputs.label, null);
        return { outputs: { reply: "ok" } };
      });
      job.step("action").fixture(({ inputs }) => {
        assertEquals(inputs.value, "request");
        return { outputs: { token: "literal-token" } };
      });
      job.step("after").fixture({});

      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEntries(i0.steps["read"]!.inputs, { count: 7, label: null });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEntries(i0.steps["read"]!.typedOutputs, { reply: "ok" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEntries(i0.steps["action"]!.inputs, { value: "request" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEntries(i0.steps["after"]!.inputs, { token: "literal-token" });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["consume"]!.instances) {
          assertEquals(i0.stepOrder, ["read", "action", "after"]);
        }
      });
    });
  });
  assertEquals(result.jobs.produce!.outputs.count, "7");
});

Deno.test("harness rejects missing dispatch inputs and invalid task output contracts", async () => {
  const missing = await assertRejects(() =>
    scenario(wired, (test, _check) => {
      test.github({ event_name: "workflow_dispatch", event: {} });
    })
  );
  assertEquals((missing as { kind?: string }).kind, "fixture_missing");

  const invalid = await assertRejects(() =>
    scenario(wired, (test, _check) => {
      test.github({ event_name: "workflow_dispatch", event: {} });
      test.inputs({ value: "request" });
      test.job("produce", (job) => {
        job.step("number").fixture({ outputs: { count: 1.5 } });
      });
    })
  );
  assertEquals((invalid as { kind?: string }).kind, "fixture_invalid");
  assertEquals(
    (invalid as { location?: string }).location?.endsWith(
      "number.outputs.count",
    ),
    true,
  );
});

const statuses = workflow(".github/workflows/statuses.yml", {
  on: { push: {} },
}).job("first", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({
      id: "fallible",
      name: "Fallible",
      run: "false",
      continueOnError: true,
    })
    .run({ id: "normal", name: "Normal", run: "true" }))
  .job(
    "second",
    ({ job, jobs }) =>
      job.needs(jobs.first).runsOn("ubuntu-latest")
        .run({
          id: "check",
          name: "Check",
          run: "true",
          if: rawExpression("github.event_name == 'push'"),
        }),
  );

Deno.test("harness keeps outcome and conclusion distinct while evaluating native conditions", async () => {
  const result = await scenario(statuses, (test, check) => {
    test.github({ event_name: "push", event: {} });
    test.job("first", (job) => {
      job.step("fallible").fixture({ outcome: "failure" });
      job.step("normal").fixture({});

      check((r) => {
        for (const i0 of r.jobs["first"]!.instances) {
          assertEquals(i0.steps["fallible"]!.outcome, "failure");
        }
      });
      check((r) => {
        for (const i0 of r.jobs["first"]!.instances) {
          assertEquals(i0.steps["fallible"]!.conclusion, "success");
        }
      });
      check((r) => {
        for (const i0 of r.jobs["first"]!.instances) {
          assertEquals(i0.steps["normal"]!.outcome !== "skipped", true);
        }
      });
      check((r) => {
        assertEquals(r.jobs["first"]!.result, "success");
      });
    });
    test.job("second", (job) => {
      job.step("check").fixture({});

      check((r) => {
        for (const i0 of r.jobs["second"]!.instances) {
          assertEquals(i0.steps["check"]!.outcome !== "skipped", true);
        }
      });
    });

    check((r) => {
      assertEquals(r.result, "success");
    });
  });
  assertEquals(
    result.jobs.first!.instances[0].steps.fallible!.conclusion,
    "success",
  );
});

const matrix = workflow(".github/workflows/matrix.yml", {
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const }, failFast: false })
    .task({
      id: "execute",
      name: "Execute",
      inputs: ({ matrix }) => ({
        stage: { contract: textValue(), from: matrix.stage },
      }),
      outputs: {},
      run: taskMustNotRun,
    }));

Deno.test("harness chooses fixture and assertions independently for each matrix value", async () => {
  await scenario(matrix, (test, check) => {
    test.github({ event_name: "push", event: {} });
    test.job("split", (job) => {
      job.eachMatrix(({ stage }, instance) => {
        instance.step("execute").fixture({
          outcome: stage === "prd" ? "failure" : "success",
        });
        instance;

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["split"]!.instances, { stage })
          ) assertEntries(i0.steps["execute"]!.inputs, { stage });
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["split"]!.instances, { stage })
          ) assertEquals(i0.result, stage === "prd" ? "failure" : "success");
        });
      });

      check((r) => {
        assertEquals(r.jobs["split"]!.instances.map((i) => i.matrix), [{
          stage: "dev",
        }, { stage: "prd" }]);
      });
      check((r) => {
        assertEquals(r.jobs["split"]!.result, "failure");
      });
    });
  });
});

const includedMatrix = workflow(".github/workflows/included-matrix.yml", {
  on: { push: {} },
  vars: ["MATRIX"],
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy(() => ({ matrix: rawExpression("fromJSON(vars.MATRIX)") }))
    .run({ id: "execute", name: "Execute", run: "true" }));

Deno.test("harness applies matrix include to every compatible original combination", async () => {
  const result = await scenario(includedMatrix, (test, check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      test.vars({
        MATRIX: JSON.stringify({
          stage: ["dev", "prd"],
          include: [{ region: "us" }],
        }),
      });

      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });

      check((r) => {
        assertEquals(r.jobs["split"]!.instances.map((i) => i.matrix), [
          { stage: "dev", region: "us" },
          { stage: "prd", region: "us" },
        ]);
      });
    });
  });
  assertEquals(result.jobs.split!.instances.length, 2);
  const includeOnly = await scenario(includedMatrix, (test, check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      test.vars({
        MATRIX: JSON.stringify({
          include: [{ stage: "dev" }, { stage: "prd" }],
        }),
      });

      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });

      check((r) => {
        assertEquals(r.jobs["split"]!.instances.map((i) => i.matrix), [{
          stage: "dev",
        }, { stage: "prd" }]);
      });
    });
  });
  assertEquals(includeOnly.jobs.split!.instances.length, 2);
  const excludedThenIncluded = await scenario(includedMatrix, (test, check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      test.vars({
        MATRIX: JSON.stringify({
          stage: ["dev", "prd"],
          exclude: [{ stage: "dev" }],
          include: [{ stage: "dev", region: "us" }],
        }),
      });

      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });

      check((r) => {
        assertEquals(r.jobs["split"]!.instances.map((i) => i.matrix), [{
          stage: "prd",
        }, { stage: "dev", region: "us" }]);
      });
    });
  });
  assertEquals(excludedThenIncluded.jobs.split!.instances.length, 2);
});

const mergedOutputs = workflow(".github/workflows/merged-outputs.yml", {
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const } })
    .run({ id: "emit", name: "Emit", run: "true", outputs: ["value"] })
    .outputs(({ steps }) => ({ value: steps.emit.outputs.value })))
  .job("after", ({ job, jobs }) =>
    job.needs(jobs.split).runsOn("ubuntu-latest")
      .uses(action, {
        id: "consume",
        name: "Consume",
        with: ({ needs }) => ({ value: needs.split.outputs.value }),
      }));

Deno.test("harness propagates deterministic matrix job outputs to needs", async () => {
  const result = await scenario(mergedOutputs, (test, check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix((_matrix, instance) => {
        instance.step("emit").fixture({ outputs: { value: "shared" } });
      });

      check((r) => {
        assertEntries(r.jobs["split"]!.outputs, { value: "shared" });
      });
    });
    test.job("after", (job) => {
      job.step("consume").fixture({});

      check((r) => {
        for (const i0 of r.jobs["after"]!.instances) {
          assertEntries(i0.steps["consume"]!.inputs, { value: "shared" });
        }
      });
    });
  });
  assertEquals(result.jobs.split!.outputs.value, "shared");

  const ambiguous = await assertRejects(() =>
    scenario(mergedOutputs, (test, _check) => {
      test.github({ event_name: "push" });
      test.job("split", (job) => {
        job.eachMatrix(({ stage }, instance) => {
          instance.step("emit").fixture({ outputs: { value: stage } });
        });
      });
    })
  );
  assertEquals((ambiguous as { kind?: string }).kind, "fixture_missing");
});

const distinctOutputs = workflow(
  ".github/workflows/distinct-outputs.yml",
  {
    on: { push: {} },
  },
).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const } })
    .run({ id: "emit", name: "Emit", run: "true", outputs: ["dev", "prd"] })
    .outputs(({ steps }) => ({
      dev: steps.emit.outputs.dev,
      prd: steps.emit.outputs.prd,
    })));

Deno.test("harness combines distinct nonempty matrix output names", async () => {
  const result = await scenario(distinctOutputs, (test, check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix(({ stage }, instance) => {
        instance.step("emit").fixture({
          outputs: stage === "dev"
            ? { dev: "dev-value" }
            : { prd: "prd-value" },
        });
      });

      check((r) => {
        assertEntries(r.jobs["split"]!.outputs, {
          dev: "dev-value",
          prd: "prd-value",
        });
      });
    });
  });
  assertEquals(result.jobs.split!.outputs, {
    dev: "dev-value",
    prd: "prd-value",
  });
});

const filtered = workflow(".github/workflows/filtered.yml", {
  on: {
    push: {
      branches: [
        "releases/**",
        "!releases/**-alpha",
        "releases/reinclude-alpha",
      ],
    },
  },
}).job("check", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({ id: "inspect", name: "Inspect", run: "true" }));

Deno.test("harness respects ordered positive and negative branch filters", async () => {
  const excluded = await scenario(filtered, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/releases/next-alpha" });

    check((r) => {
      assertEquals(r.result, "skipped");
    });
  });
  assertEquals(excluded.result, "skipped");
  const included = await scenario(filtered, (test, check) => {
    test.github({
      event_name: "push",
      ref: "refs/heads/releases/reinclude-alpha",
    });
    test.job("check", (job) => {
      job.step("inspect").fixture({});
      check((r) => {
        for (const i0 of r.jobs["check"]!.instances) {
          assertEquals(i0.steps["inspect"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  assertEquals(included.result, "success");
});

const versionFiltered = workflow(
  ".github/workflows/version-filtered.yml",
  {
    on: { push: { branches: ["v[12].[0-9]+.[0-9]+"] } },
  },
).job("check", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({ id: "inspect", name: "Inspect", run: "true" }));

Deno.test("harness evaluates GitHub branch character classes and repetition", async () => {
  const result = await scenario(versionFiltered, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/v2.10.1" });
    test.job("check", (job) => {
      job.step("inspect").fixture({});
      check((r) => {
        for (const i0 of r.jobs["check"]!.instances) {
          assertEquals(i0.steps["inspect"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  assertEquals(result.result, "success");
});

const matrixRaw = workflow(".github/workflows/matrix-raw.yml", {
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const } })
    .run({
      id: "conditional",
      name: "Conditional",
      run: "true",
      if: rawExpression("matrix.stage == 'dev'"),
    }));

Deno.test("harness evaluates native expressions at each matrix step", async () => {
  const result = await scenario(matrixRaw, (test, _check) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix(({ stage }, instance) => {
        const step = instance.step("conditional");
        if (stage === "dev") step.fixture({});
      });
    });
  });
  assertEquals(
    result.jobs.split!.instances[0].steps.conditional!.outcome,
    "success",
  );
  assertEquals(
    result.jobs.split!.instances[1].steps.conditional!.outcome,
    "skipped",
  );
});

Deno.test("common input references follow each trigger and call defaults", async () => {
  const mixed = workflow(".github/workflows/mixed.yml", {
    on: {
      push: {},
      workflow_dispatch: {
        inputs: {
          shared: { type: "string", default: "dispatch" },
          dispatchOnly: { type: "choice", options: ["x"], default: "x" },
        },
      },
      workflow_call: {
        inputs: {
          shared: { type: "boolean", default: false },
          count: { type: "number", default: 7 },
        },
      },
    },
  }).job(
    "read",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
        env: ({ inputs }) => ({
          shared: inputs.shared,
          dispatchOnly: inputs.dispatchOnly,
          count: inputs.count,
        }),
      }),
  );
  for (
    const [event, expected] of [["push", {
      shared: "",
      dispatchOnly: "",
      count: "",
    }], ["workflow_dispatch", {
      shared: "dispatch",
      dispatchOnly: "x",
      count: "",
    }]] as const
  ) {
    await scenario(mixed, (test, _check) => {
      test.github({ event_name: event });
      test.inputs({});
      test.job("read", (job) =>
        job.step("read").fixture(({ env }) => {
          assertEquals(env, expected);
          return {};
        }));
    });
  }
  const caller = workflow(".github/workflows/caller-defaults.yml", {
    on: { push: {} },
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/mixed.yml", mixed, {}),
    );
  await scenario(caller, (test, _check) => {
    test.github({ event_name: "push" });
    test.job("call", (job) =>
      job.call(mixed, (child) => {
        child.job("read", (job) =>
          job.step("read").fixture(({ env }) => {
            assertEquals(env, {
              shared: "false",
              dispatchOnly: "",
              count: "7",
            });
            return {};
          }));
      }));
  }, { config: project({ workflows: [mixed, caller] }) });
});
