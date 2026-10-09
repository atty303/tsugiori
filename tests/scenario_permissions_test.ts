import { assertEquals, assertRejects } from "@std/assert";
import {
  project,
  workflow,
  type WorkflowPermissions,
} from "../src/github_actions/mod.ts";
import { scenario, ScenarioError } from "../src/testing/mod.ts";

Deno.test("root permissions use native replacement rules, shorthands and explicit post-declaration restrictions", async () => {
  const declarations: WorkflowPermissions[] = [{}, "read-all", "write-all", {
    contents: "write",
    "id-token": "write",
    "vulnerability-alerts": "read",
  }];
  for (const declaration of declarations) {
    for (const restrictWrites of [false, true]) {
      const flow = workflow("permissions.yml", {
        on: { push: {} },
        permissions: { contents: "read", issues: "write" },
      })
        .job(
          "test",
          ({ job }) =>
            job.runsOn("ubuntu-latest").permissions(declaration).run({
              id: "read",
              name: "Read",
              run: "true",
            }),
        );
      const result = await scenario(flow, (t) => {
        t.github({ event_name: "push" });
        t.tokenPermissions({
          defaults: { contents: "read", packages: "read" },
          restrictWrites,
        });
        t.job("test", (j) =>
          j.step("read").fixture(({ tokenPermissions }) => {
            assertEquals(Object.isFrozen(tokenPermissions), true);
            assertEquals(
              tokenPermissions?.packages,
              typeof declaration === "string"
                ? declaration === "write-all" && !restrictWrites
                  ? "write"
                  : "read"
                : "none",
            );
            assertEquals(
              tokenPermissions?.["id-token"],
              declaration === "write-all" ||
                typeof declaration === "object" &&
                  declaration["id-token"] === "write"
                ? restrictWrites ? "none" : "write"
                : "none",
            );
            return {};
          }));
      });
      assertEquals(
        Object.keys(result.jobs.test.instances[0].tokenPermissions!).length,
        16,
      );
    }
  }
  // Read defaults are not a ceiling: an explicit root declaration can request write.
  const flow = workflow("defaults.yml", {
    on: { push: {} },
    permissions: { contents: "write" },
  }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
      }),
  );
  const result = await scenario(flow, (t) => {
    t.github({ event_name: "push" });
    t.tokenPermissions({
      defaults: { contents: "read" },
      restrictWrites: false,
    });
    t.job("test", (j) => j.step("read").fixture({}));
  });
  assertEquals(
    result.jobs.test.instances[0].tokenPermissions?.contents,
    "write",
  );
  const legacy = await scenario(flow, (t) => {
    t.github({ event_name: "push" });
    t.job("test", (j) =>
      j.step("read").fixture(({ tokenPermissions }) => {
        assertEquals(tokenPermissions, undefined);
        return {};
      }));
  });
  assertEquals(legacy.jobs.test.instances[0].tokenPermissions, undefined);
});

const leaf = (permissions?: WorkflowPermissions) =>
  workflow(".github/workflows/leaf.yml", {
    on: { push: {}, workflow_call: {} },
    ...(permissions === undefined ? {} : { permissions }),
  })
    .job(
      "read",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "read",
          name: "Read",
          run: "true",
        }),
    );

Deno.test("nested local calls inherit authority, reduce it and reject effective excess demands with their path", async () => {
  for (
    const permission of [undefined, { contents: "read" }, {
      contents: "write",
    }] as const
  ) {
    const end = leaf(permission);
    const middle = workflow(".github/workflows/middle.yml", {
      on: { workflow_call: {} },
      permissions: { contents: "read" },
    })
      .job(
        "leaf",
        ({ job }) =>
          job.reusable().call("./.github/workflows/leaf.yml", end, {}),
      );
    const root = workflow(".github/workflows/root.yml", {
      on: { push: {} },
      permissions: { contents: "write", packages: "write" },
    })
      .job(
        "middle",
        ({ job }) =>
          job.reusable().call("./.github/workflows/middle.yml", middle, {}),
      );
    const run = () =>
      scenario(root, (t) => {
        t.github({ event_name: "push" });
        t.tokenPermissions({ defaults: {}, restrictWrites: false });
        t.job("middle", (j) =>
          j.call(middle, (m) =>
            m.job("leaf", (l) =>
              l.call(end, (e) =>
                e.job("read", (r) =>
                  r.step("read").fixture(({ tokenPermissions }) => {
                    assertEquals(tokenPermissions?.contents, "read");
                    assertEquals(tokenPermissions?.packages, "none");
                    return {};
                  }))))));
      }, { config: project({ workflows: [root, middle, end] }) });
    if (permission?.contents === "write") {
      const error = await assertRejects(run, ScenarioError);
      assertEquals(error.kind, "fixture_invalid");
      for (
        const part of [
          "root.yml.middle",
          "middle.yml.leaf",
          "leaf.yml.read",
          "requests write",
          "ceiling read",
          "contents",
        ]
      ) assertEquals(error.message.includes(part), true);
    } else {
      const result = await run();
      assertEquals(
        result.jobs.middle.instances[0].tokenPermissions?.contents,
        "write",
      );
      assertEquals(
        result.jobs.middle.instances[0].call?.jobs.leaf.instances[0]
          .tokenPermissions?.contents,
        "read",
      );
    }
  }
});

Deno.test("callee job declarations replace workflow defaults before comparing caller ceiling", async () => {
  const end = workflow(".github/workflows/leaf.yml", {
    on: { workflow_call: {} },
    permissions: "write-all",
  })
    .job(
      "read",
      ({ job }) =>
        job.runsOn("ubuntu-latest").permissions({ contents: "read" }).run({
          id: "read",
          name: "Read",
          run: "true",
        }),
    );
  const root = workflow(".github/workflows/root.yml", {
    on: { push: {} },
    permissions: { contents: "read" },
  }).job(
    "call",
    ({ job }) => job.reusable().call("./.github/workflows/leaf.yml", end, {}),
  );
  await scenario(root, (t) => {
    t.github({ event_name: "push" });
    t.tokenPermissions({ defaults: "write-all", restrictWrites: false });
    t.job(
      "call",
      (j) =>
        j.call(end, (e) => e.job("read", (r) => r.step("read").fixture({}))),
    );
  }, { config: project({ workflows: [root, end] }) });
});

Deno.test("nested initial fixtures are rejected, while standalone callee assumptions work", async () => {
  const end = leaf();
  const root = workflow(".github/workflows/root.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) => job.reusable().call("./.github/workflows/leaf.yml", end, {}),
  );
  const error = await assertRejects(() =>
    scenario(root, (t) => {
      t.github({ event_name: "push" });
      t.tokenPermissions({ defaults: "read-all", restrictWrites: false });
      t.job("call", (j) =>
        j.call(end, (e) => {
          e.tokenPermissions({ defaults: "read-all", restrictWrites: false });
          e.job("read", (r) => r.step("read").fixture({}));
        }));
    }, { config: project({ workflows: [root, end] }) }), ScenarioError);
  assertEquals(error.message.includes("Nested local"), true);
  const result = await scenario(end, (e) => {
    e.github({ event_name: "push" });
    e.tokenPermissions({ defaults: "read-all", restrictWrites: false });
    e.job("read", (r) => r.step("read").fixture({}));
  });
  assertEquals(
    result.jobs.read.instances[0].tokenPermissions?.contents,
    "read",
  );
});

Deno.test("external call callbacks expose incoming permissions and strategy, without claiming internal validation", async () => {
  const flow = workflow("external.yml", {
    on: { push: {} },
    permissions: { contents: "write", packages: "read", "id-token": "write" },
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().strategy({ matrix: { n: [0, 1] } }).rawCall(
          "other/repo/.github/workflows/build.yml@v1",
          {},
        ),
    );
  const events: unknown[] = [];
  const result = await scenario(flow, (t) => {
    t.github({ event_name: "push" });
    t.tokenPermissions({ defaults: {}, restrictWrites: true });
    t.job("call", (j) =>
      j.callFixture(({ strategy, tokenPermissions }) => {
        assertEquals(strategy["max-parallel"], 2);
        assertEquals(tokenPermissions?.contents, "read");
        assertEquals(tokenPermissions?.["id-token"], "none");
        return { outputs: { value: "same" } };
      }));
  }, { observe: (event) => events.push(event) });
  assertEquals(
    result.jobs.call.instances[0].tokenPermissions?.packages,
    "read",
  );
  assertEquals(result.jobs.call.instances[0].call?.jobs, {});
  assertEquals(JSON.stringify(events).includes("contents"), false);
  // Host observation failures leave modeled public results intact.
  await scenario(flow, (t) => {
    t.github({ event_name: "push" });
    t.tokenPermissions({ defaults: {}, restrictWrites: true });
    t.job("call", (j) => j.callFixture({}));
  }, {
    observe: () => {
      throw Error("sink");
    },
  });
});

Deno.test("permission fixture rejects unknown scopes, unsupported levels and duplicate root assumptions", async () => {
  const flow = leaf();
  for (
    const defaults of [{ "unknown": "read" }, { "id-token": "read" }, {
      "vulnerability-alerts": "write",
    }] as unknown as WorkflowPermissions[]
  ) {
    await assertRejects(() =>
      scenario(flow, (t) => {
        t.github({ event_name: "push" });
        t.tokenPermissions({ defaults, restrictWrites: false });
        t.job("read", (j) => j.step("read").fixture({}));
      }), ScenarioError);
  }
  await assertRejects(() =>
    scenario(flow, (t) => {
      t.tokenPermissions({ defaults: {}, restrictWrites: false });
      t.tokenPermissions({ defaults: {}, restrictWrites: false });
    }), ScenarioError);
});
