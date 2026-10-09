import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  jsonValue,
  project,
  rawExpression,
  scenario,
  workflow,
} from "../src/github_actions.ts";
import { ScenarioError } from "../src/testing/mod.ts";

Deno.test("suppression applies per instance before aggregation without changing step outputs", async () => {
  const flow = workflow("suppression.yml", { on: { push: {} } })
    .job("produce", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({ matrix: { n: [0, 1, 2] } })
        .run({
          id: "write",
          name: "Write",
          run: "true",
          outputs: ["token", "safe", "empty"],
        })
        .outputs(({ steps }) => ({
          token: steps.write.outputs.token,
          safe: steps.write.outputs.safe,
          empty: steps.write.outputs.empty,
        })))
    .job(
      "read",
      ({ job, jobs }) =>
        job.needs(jobs.produce).runsOn("ubuntu-latest")
          .run({
            id: "read",
            name: "Read",
            run: "true",
            env: ({ needs }) => ({ TOKEN: needs.produce.outputs.token }),
          }),
    );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("produce", (job) => {
      job.suppressedOutputs(["token"]);
      job.eachMatrix(({ n }, instance) => {
        if (n === 1) instance.suppressedOutputs([]);
        if (n === 2) instance.suppressedOutputs(["token", "safe"]);
        instance.step("write").fixture({
          outputs: { token: `token-${n}`, safe: "safe", empty: "" },
        });
      });
    });
    test.job("read", (job) => job.step("read").fixture({}));
  });
  const produced = result.jobs.produce!;
  assertEquals(produced.outputs, { token: "token-1", safe: "safe", empty: "" });
  assertEquals(produced.instances[0].outputs, { safe: "safe", empty: "" });
  assertEquals(produced.instances[1].outputs, {
    token: "token-1",
    safe: "safe",
    empty: "",
  });
  assertEquals(produced.instances[2].outputs, { empty: "" });
  assertEquals(produced.instances[0].steps.write!.outputs.token, "token-0");
  assertEquals(result.jobs.read!.instances[0].steps.read!.env.TOKEN, "token-1");
  assertEquals(result.jobs.read!.needs, ["produce"]);
  assertEquals(produced.instances[0].stepOrder, ["write"]);
});

Deno.test("ordinary suppression withholds a key while an empty output remains present", async () => {
  const flow = workflow("ordinary.yml", { on: { push: {} } })
    .job("produce", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "write",
          name: "Write",
          run: "true",
          outputs: ["token", "empty"],
        })
        .outputs(({ steps }) => ({
          token: steps.write.outputs.token,
          empty: steps.write.outputs.empty,
        })))
    .job(
      "read",
      ({ job, jobs }) =>
        job.needs(jobs.produce).runsOn("ubuntu-latest")
          .run({
            id: "read",
            name: "Read",
            run: "true",
            env: ({ needs }) => ({ TOKEN: needs.produce.outputs.token }),
          }),
    );
  for (const suppress of [false, true]) {
    const result = await scenario(flow, (test) => {
      test.github({ event_name: "push" });
      test.job("produce", (job) => {
        if (suppress) job.suppressedOutputs(["token"]);
        job.step("write").fixture({ outputs: { token: "value", empty: "" } });
      });
      test.job("read", (job) => job.step("read").fixture({}));
    });
    assertEquals(
      Object.hasOwn(result.jobs.produce!.outputs, "token"),
      !suppress,
    );
    assertEquals(Object.hasOwn(result.jobs.produce!.outputs, "empty"), true);
    assertEquals(
      result.jobs.read!.instances[0].steps.read!.env.TOKEN,
      suppress ? "" : "value",
    );
  }
  for (const names of [["unknown"], ["token", "token"], [""]]) {
    await assertRejects(() =>
      scenario(flow, (test) => {
        test.github({ event_name: "push" });
        test.job("produce", (job) => job.suppressedOutputs(names));
      }), ScenarioError);
  }
  await assertRejects(() =>
    scenario(flow, (test) => {
      test.job("produce", (job) => {
        job.suppressedOutputs([]);
        job.suppressedOutputs([]);
      });
    }), ScenarioError);
});

Deno.test("callee suppression reaches reusable matrix aggregation and external fixtures are already delivered", async () => {
  const callee = workflow("callee.yml", {
    on: {
      workflow_call: {
        outputs: {
          token: {
            description: "Token",
            value: "${{ jobs.write.outputs.token }}",
          },
        },
      },
    },
  })
    .job("write", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({ id: "write", name: "Write", run: "true", outputs: ["token"] })
        .outputs(({ steps }) => ({ token: steps.write.outputs.token })));
  const caller = workflow("caller.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable()
        .strategy({ matrix: { n: [0, 1] } }).call(
          "./.github/workflows/callee.yml",
          callee,
          {},
        ),
  );
  const result = await scenario(caller, (test) => {
    test.github({ event_name: "push" });
    test.job("call", (job) => {
      job.completionOrder([0, 1]);
      job.eachMatrix(({ n }, instance) =>
        instance.call(callee, (child) => {
          child.job("write", (job) => {
            if (n === 1) job.suppressedOutputs(["token"]);
            job.step("write").fixture({ outputs: { token: `token-${n}` } });
          });
        })
      );
    });
  }, { config: project({ workflows: [caller, callee] }) });
  assertEquals(result.jobs.call!.outputs, { token: "token-0" });
  assertEquals(result.jobs.call!.instances[1].call!.jobs.write!.outputs, {});
  assertEquals(result.jobs.call!.instances[1].outputs, { token: "" });
  await assertRejects(() =>
    scenario(caller, (test) => {
      test.github({ event_name: "push" });
      test.job("call", (job) => job.suppressedOutputs(["token"]));
    }, { config: project({ workflows: [caller, callee] }) }), ScenarioError);
  const external = workflow("external.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable().rawCall("owner/repo/.github/workflows/ci.yml@v1", {}),
  );
  const observed = await scenario(external, (test) => {
    test.github({ event_name: "push" });
    test.job("call", (job) => job.callFixture({ outputs: { empty: "" } }));
  });
  assertEquals(observed.jobs.call!.outputs, { empty: "" });
});

Deno.test("settings getters retain independent eager outcomes and never rerun fixtures", async () => {
  let calls = 0;
  const flow = workflow("getters.yml", {
    on: { push: {} },
    vars: ["GROUP"],
    concurrency: ({ vars }) => ({ group: vars.GROUP, cancelInProgress: false }),
  })
    .job("build", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "first",
          name: "First",
          run: "true",
          shell: rawExpression("runner.os"),
          workingDirectory: "before",
        })
        .run({ id: "after", name: "After", run: "true" }));
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => {
      job.step("first").fixture(() => {
        calls++;
        return { environmentChanges: { DIR: "after" } };
      });
      job.step("after").fixture(() => {
        calls++;
        return {};
      });
    });
  });
  const first = result.jobs.build!.instances[0].steps.first!;
  const missing = assertThrows(
    () => first.run!.shell,
    ScenarioError,
    "runner.os",
  );
  assertEquals(assertThrows(() => first.run!.shell, ScenarioError), missing);
  assertEquals(first.run!.workingDirectory, "before");
  assertEquals(
    result.jobs.build!.instances[0].settings.runsOn,
    "ubuntu-latest",
  );
  assertEquals(result.concurrency!.cancelInProgress, false);
  assertThrows(() => result.concurrency!.group, ScenarioError, "vars");
  assertEquals(calls, 2);
  assertEquals(result.jobs.build!.instances[0].steps.after!.run, {});
  assert(Object.isFrozen(first.run));
  assertThrows(() => JSON.stringify(result), ScenarioError);
  assertEquals(Object.keys(first.run!), ["shell", "workingDirectory"]);
});

Deno.test("optional settings capture their original context and expose malformed expressions immediately", async () => {
  const flow = workflow("timing.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "first",
          name: "First",
          run: "true",
          env: { DIR: "before" },
          workingDirectory: rawExpression("env.DIR"),
        })
        .run({ id: "after", name: "After", run: "true" }),
  );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => {
      job.step("first").fixture({ environmentChanges: { DIR: "after" } });
      job.step("after").fixture({});
    });
  });
  assertEquals(
    result.jobs.build!.instances[0].steps.first!.run!.workingDirectory,
    "before",
  );
  const malformed = workflow("malformed.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "first",
          name: "First",
          run: "true",
          shell: rawExpression("runner.os +"),
        }),
  );
  await assertRejects(
    () =>
      scenario(malformed, (test) => {
        test.github({ event_name: "push" });
        test.job("build", (job) => job.step("first").fixture({}));
      }),
    ScenarioError,
    "Expression evaluation failed",
  );
});

Deno.test("typedOutputs preserve task contracts while wire outputs and skipped values remain separate", async () => {
  const list = jsonValue({
    parse: (value: unknown): readonly string[] => {
      if (
        !Array.isArray(value) || value.some((v) => typeof v !== "string")
      ) throw new TypeError();
      return value;
    },
  });
  const flow = workflow("typed.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .task({
          id: "write",
          name: "Write",
          inputs: {},
          outputs: {
            list: { contract: list, required: true },
            omitted: { contract: list, required: false },
          },
          run: () => {},
        })
        .task({
          id: "skip",
          name: "Skip",
          if: rawExpression("false"),
          inputs: {},
          outputs: { list: { contract: list, required: true } },
          run: () => {},
        }),
  );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("build", (job) =>
      job.step("write").fixture({ outputs: { list: ["one", "two"] } }));
  });
  const steps = result.jobs.build!.instances[0].steps;
  assertEquals(steps.write!.typedOutputs.list, ["one", "two"]);
  assertEquals(steps.write!.outputs.list, '["one","two"]');
  assertEquals(steps.skip!.typedOutputs, {});
  assertEquals(steps.skip!.outcome, "skipped");
  assertEquals(steps.write!.typedOutputs, { list: ["one", "two"] });
  assertEquals(steps.write!.outputs.omitted, "");
  assertEquals(result.jobs.build!.instances[0].stepOrder, ["write"]);

  const failed = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("build", (job) =>
      job.step("write").fixture({ outcome: "failure" }));
  });
  assertEquals(failed.jobs.build!.instances[0].steps.write!.typedOutputs, {});
  assertEquals(failed.jobs.build!.instances[0].steps.write!.outputs, {
    list: "",
    omitted: "",
  });
  assertEquals(failed.jobs.build!.instances[0].steps.skip!.outcome, "skipped");
  assertEquals(failed.jobs.build!.instances[0].stepOrder, ["write"]);
});

Deno.test("getter errors identify fields without exposing computed keys or matrix values", async () => {
  const value = "private-fixture-value";
  const flow = workflow("privacy.yml", {
    on: {
      workflow_dispatch: {
        inputs: { lookup: { type: "string", required: true } },
      },
    },
  }).job("build", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .strategy({ matrix: { marker: [value] } })
      .run({
        id: "read",
        name: "Read",
        run: "true",
        shell: rawExpression("vars[inputs.lookup]"),
      }));
  const events: unknown[] = [];
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "workflow_dispatch", event: {} });
    test.inputs({ lookup: value });
    test.vars({});
    test.job("build", (job) => job.step("read").fixture({}));
  }, { observe: (event) => events.push(event) });
  const error = assertThrows(
    () => result.jobs.build!.instances[0].steps.read!.run!.shell,
    ScenarioError,
  );
  assertEquals(error.location, "privacy.yml.build[0].read.shell");
  assert(error.message.includes("vars.<computed>"));
  assert(!error.message.includes(value));
  assert(!String(error.cause).includes(value));
  assert(!JSON.stringify(events).includes(value));
});

Deno.test("stepOrder includes only launched authored steps before failure and status recovery", async () => {
  const flow = workflow("order.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .run({
          id: "disabled",
          name: "Disabled",
          run: "true",
          if: rawExpression("false"),
        })
        .run({ id: "fail", name: "Fail", run: "false" })
        .run({ id: "after", name: "After", run: "true" })
        .run({
          id: "recover",
          name: "Recover",
          run: "true",
          if: rawExpression("always()"),
        }),
  );
  const result = await scenario(flow, (test) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => {
      job.step("fail").fixture({ outcome: "failure" });
      job.step("recover").fixture({});
    });
  });
  const instance = result.jobs.build!.instances[0];
  assertEquals(instance.stepOrder, ["fail", "recover"]);
  assertEquals(instance.steps.disabled!.outcome, "skipped");
  assertEquals(instance.steps.after!.outcome, "skipped");
});
