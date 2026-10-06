import { assertEquals, assertRejects } from "@std/assert";
import {
  always,
  definePipeline,
  defineTsugiori,
  jsonValue,
  rawExpression,
  scenario,
  textValue,
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

const wired = definePipeline("wired", {
  output: ".github/workflows/wired.yml",
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
      outputs: { count: { contract: countValue, required: true } },
      run: taskMustNotRun,
    }).outputs(({ steps }) => ({ count: steps.number.outputs.count })))
  .job(
    "consume",
    ({ job, jobs }) =>
      job.needs(jobs.produce).runsOn("ubuntu-latest")
        .task({
          id: "read",
          name: "Read number",
          inputs: {
            count: {
              contract: countValue,
              from: ({ needs }) => needs.produce.outputs.count,
            },
          },
          outputs: {},
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
          inputs: {
            token: {
              contract: textValue(),
              from: ({ steps }) => steps.action.outputs.token,
            },
          },
          outputs: {},
          run: taskMustNotRun,
        }),
  );

Deno.test("harness wires typed task values, action strings, and evaluated inputs", async () => {
  const result = await scenario(wired, (test) => {
    test.github({ event_name: "workflow_dispatch", event: {} });
    test.inputs({ value: "request" });
    test.job("produce", (job) => {
      job.step("number").fixture({ outputs: { count: 7 } });
      job.expectOutputs({ count: "7" });
    });
    test.job("consume", (job) => {
      job.step("read").fixture(({ inputs }) => {
        assertEquals(inputs.count, 7);
        return {};
      }).expectInputs({ count: 7 });
      job.step("action").fixture(({ inputs }) => {
        assertEquals(inputs.value, "request");
        return { outputs: { token: "literal-token" } };
      }).expectInputs({ value: "request" });
      job.step("after").fixture({}).expectInputs({ token: "literal-token" });
      job.expectStepOrder("read", "action", "after");
    });
  });
  assertEquals(result.jobs.produce.outputs.count, "7");
});

Deno.test("harness rejects missing dispatch inputs and invalid task output contracts", async () => {
  const missing = await assertRejects(() =>
    scenario(wired, (test) => {
      test.github({ event_name: "workflow_dispatch", event: {} });
    })
  );
  assertEquals((missing as { kind?: string }).kind, "fixture_missing");

  const invalid = await assertRejects(() =>
    scenario(wired, (test) => {
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

const statuses = definePipeline("statuses", {
  output: ".github/workflows/statuses.yml",
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
          if: rawExpression("unknownPredicate(github.event_name)"),
        }),
  );

Deno.test("harness keeps outcome and conclusion distinct and overrides raw fields by ID", async () => {
  const unsupported = await assertRejects(() =>
    scenario(statuses, (test) => {
      test.github({ event_name: "push", event: {} });
      test.job("first", (job) => {
        job.step("fallible").fixture({ outcome: "failure" }).expectOutcome(
          "failure",
        ).expectConclusion("success");
        job.step("normal").fixture({}).expectRun();
      });
    })
  );
  assertEquals(
    (unsupported as { kind?: string }).kind,
    "expression_unsupported",
  );
  assertEquals(
    (unsupported as { location?: string }).location?.endsWith(
      "second[{}].check.if",
    ),
    true,
  );

  const result = await scenario(statuses, (test) => {
    test.github({ event_name: "push", event: {} });
    test.job("first", (job) => {
      job.step("fallible").fixture({ outcome: "failure" }).expectOutcome(
        "failure",
      ).expectConclusion("success");
      job.step("normal").fixture({}).expectRun();
      job.expectResult("success");
    });
    test.job("second", (job) => {
      job.step("check").expression("if", true).fixture({}).expectRun();
    });
    test.expectResult("success");
  });
  assertEquals(
    result.jobs.first.instances[0].steps.fallible.conclusion,
    "success",
  );
});

const matrix = definePipeline("matrix", {
  output: ".github/workflows/matrix.yml",
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const }, failFast: false })
    .task({
      id: "execute",
      name: "Execute",
      inputs: {
        stage: { contract: textValue(), from: ({ matrix }) => matrix.stage },
      },
      outputs: {},
      run: taskMustNotRun,
    }));

Deno.test("harness chooses fixture and expectation independently for each matrix value", async () => {
  await scenario(matrix, (test) => {
    test.github({ event_name: "push", event: {} });
    test.job("split", (job) => {
      job.expectMatrix([{ stage: "dev" }, { stage: "prd" }]);
      job.eachMatrix(({ stage }, instance) => {
        instance.step("execute").fixture({
          outcome: stage === "prd" ? "failure" : "success",
        })
          .expectInputs({ stage });
        instance.expectResult(stage === "prd" ? "failure" : "success");
      });
      job.expectResult("failure");
    });
  });
});

const includedMatrix = definePipeline("included-matrix", {
  output: ".github/workflows/included-matrix.yml",
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy(() => ({ matrix: rawExpression("customMatrix()") }))
    .run({ id: "execute", name: "Execute", run: "true" }));

Deno.test("harness applies matrix include to every compatible original combination", async () => {
  const result = await scenario(includedMatrix, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.expression("strategy.matrix", {
        stage: ["dev", "prd"],
        include: [{ region: "us" }],
      });
      job.expectMatrix([
        { stage: "dev", region: "us" },
        { stage: "prd", region: "us" },
      ]);
      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });
    });
  });
  assertEquals(result.jobs.split.instances.length, 2);
  const includeOnly = await scenario(includedMatrix, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.expression("strategy.matrix", {
        include: [{ stage: "dev" }, { stage: "prd" }],
      });
      job.expectMatrix([{ stage: "dev" }, { stage: "prd" }]);
      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });
    });
  });
  assertEquals(includeOnly.jobs.split.instances.length, 2);
  const excludedThenIncluded = await scenario(includedMatrix, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.expression("strategy.matrix", {
        stage: ["dev", "prd"],
        exclude: [{ stage: "dev" }],
        include: [{ stage: "dev", region: "us" }],
      });
      job.expectMatrix([{ stage: "prd" }, { stage: "dev", region: "us" }]);
      job.eachMatrix((_matrix, instance) => {
        instance.step("execute").fixture({});
      });
    });
  });
  assertEquals(excludedThenIncluded.jobs.split.instances.length, 2);
});

const mergedOutputs = definePipeline("merged-outputs", {
  output: ".github/workflows/merged-outputs.yml",
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
  const result = await scenario(mergedOutputs, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix((_matrix, instance) => {
        instance.step("emit").fixture({ outputs: { value: "shared" } });
      });
      job.expectOutputs({ value: "shared" });
    });
    test.job("after", (job) => {
      job.step("consume").fixture({}).expectInputs({ value: "shared" });
    });
  });
  assertEquals(result.jobs.split.outputs.value, "shared");

  const ambiguous = await assertRejects(() =>
    scenario(mergedOutputs, (test) => {
      test.github({ event_name: "push" });
      test.job("split", (job) => {
        job.eachMatrix(({ stage }, instance) => {
          instance.step("emit").fixture({ outputs: { value: stage } });
        });
      });
    })
  );
  assertEquals((ambiguous as { kind?: string }).kind, "expression_unsupported");
});

const distinctOutputs = definePipeline("distinct-outputs", {
  output: ".github/workflows/distinct-outputs.yml",
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const } })
    .run({ id: "emit", name: "Emit", run: "true", outputs: ["dev", "prd"] })
    .outputs(({ steps }) => ({
      dev: steps.emit.outputs.dev,
      prd: steps.emit.outputs.prd,
    })));

Deno.test("harness combines distinct nonempty matrix output names", async () => {
  const result = await scenario(distinctOutputs, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix(({ stage }, instance) => {
        instance.step("emit").fixture({
          outputs: stage === "dev"
            ? { dev: "dev-value" }
            : { prd: "prd-value" },
        });
      });
      job.expectOutputs({ dev: "dev-value", prd: "prd-value" });
    });
  });
  assertEquals(result.jobs.split.outputs, {
    dev: "dev-value",
    prd: "prd-value",
  });
});

const filtered = definePipeline("filtered", {
  output: ".github/workflows/filtered.yml",
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
  const excluded = await scenario(filtered, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/releases/next-alpha" });
    test.expectResult("skipped");
  });
  assertEquals(excluded.result, "skipped");
  const included = await scenario(filtered, (test) => {
    test.github({
      event_name: "push",
      ref: "refs/heads/releases/reinclude-alpha",
    });
    test.job("check", (job) => job.step("inspect").fixture({}).expectRun());
  });
  assertEquals(included.result, "success");
});

const versionFiltered = definePipeline("version-filtered", {
  output: ".github/workflows/version-filtered.yml",
  on: { push: { branches: ["v[12].[0-9]+.[0-9]+"] } },
}).job("check", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .run({ id: "inspect", name: "Inspect", run: "true" }));

Deno.test("harness evaluates GitHub branch character classes and repetition", async () => {
  const result = await scenario(versionFiltered, (test) => {
    test.github({ event_name: "push", ref: "refs/heads/v2.10.1" });
    test.job("check", (job) => job.step("inspect").fixture({}).expectRun());
  });
  assertEquals(result.result, "success");
});

const matrixRaw = definePipeline("matrix-raw", {
  output: ".github/workflows/matrix-raw.yml",
  on: { push: {} },
}).job("split", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] as const } })
    .run({
      id: "conditional",
      name: "Conditional",
      run: "true",
      if: rawExpression("custom(matrix.stage)"),
    }));

Deno.test("harness selects unsupported expression values at each matrix step", async () => {
  const result = await scenario(matrixRaw, (test) => {
    test.github({ event_name: "push" });
    test.job("split", (job) => {
      job.eachMatrix(({ stage }, instance) => {
        const step = instance.step("conditional").expression(
          "if",
          stage === "dev",
        );
        if (stage === "dev") step.fixture({}).expectRun();
        else step.expectSkip();
      });
    });
  });
  assertEquals(
    result.jobs.split.instances[0].steps.conditional.outcome,
    "success",
  );
  assertEquals(
    result.jobs.split.instances[1].steps.conditional.outcome,
    "skipped",
  );
});

Deno.test("common input references follow each trigger and call defaults", async () => {
  const mixed = definePipeline("mixed", {
    output: ".github/workflows/mixed.yml",
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
        env: {
          shared: ({ inputs }) => inputs.shared,
          dispatchOnly: ({ inputs }) => inputs.dispatchOnly,
          count: ({ inputs }) => inputs.count,
        },
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
    await scenario(mixed, (test) => {
      test.github({ event_name: event });
      test.inputs({});
      test.job("read", (job) =>
        job.step("read").fixture(({ env }) => {
          assertEquals(env, expected);
          return {};
        }));
    });
  }
  const caller = definePipeline("caller-defaults", {
    output: ".github/workflows/caller-defaults.yml",
    on: { push: {} },
  })
    .job("call", ({ job }) => job.reusable().call(mixed, {}));
  await scenario(caller, (test) => {
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
  }, { config: defineTsugiori({ pipelines: [mixed, caller] }) });
});
