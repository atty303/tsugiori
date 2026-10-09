import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  type CacheMode,
  project,
  rawExpression,
  startsWith,
  workflow,
} from "../src/github_actions/mod.ts";
import {
  AuthoringValidationError,
  lowerProject,
} from "../src/compiler/authoring.ts";
import { validateWorkflow } from "../src/compiler/github_actions/validation.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import { ScenarioError } from "../src/testing/mod.ts";

Deno.test("cache modes and snapshot forms survive immutable lowering to native YAML, including task preparation", () => {
  const image = {
    imageName: "ci-image",
    version: "2.*",
    if: rawExpression("!startsWith(github.ref, 'refs/tags/')"),
  };
  const ci = workflow("settings.yml", { on: { push: {} }, cacheMode: "read" })
    .job(
      "image",
      ({ job }) =>
        job.runsOn("image-generation").cacheMode("write-only").snapshot(image)
          .run({ name: "Setup", run: "true" }),
    )
    .job(
      "short",
      ({ job }) =>
        job.runsOn("image-generation").snapshot("other-image").run({
          name: "Setup",
          run: "true",
        }),
    )
    .job("task", ({ job }) => {
      const before = job.runsOn("ubuntu-latest");
      const ignored = before.cacheMode("write");
      void ignored;
      return before.cacheMode("none").task({
        id: "task",
        name: "Task",
        run: () => {},
      });
    });
  image.imageName = "mutated";
  const lowered = lowerProject(project({ workflows: [ci] }), "./entry.ts");
  const yaml = parse(emitWorkflow(lowered.workflows[0].workflow)) as {
    "cache-mode": string;
    jobs: Record<
      string,
      {
        "cache-mode"?: string;
        snapshot?: unknown;
        steps: readonly { uses?: string; name?: string; if?: string }[];
      }
    >;
  };
  assertEquals(yaml["cache-mode"], "read");
  assertEquals(yaml.jobs.image!["cache-mode"], "write-only");
  assertEquals(yaml.jobs.image!.snapshot, {
    "image-name": "ci-image",
    version: "2.*",
    if: "${{ !startsWith(github.ref, 'refs/tags/') }}",
  });
  assertEquals(yaml.jobs.short!.snapshot, "other-image");
  assertEquals(yaml.jobs.task!["cache-mode"], "none");
  assert(
    yaml.jobs.task!.steps.some((s: { uses?: string }) =>
      s.uses?.startsWith("actions/cache@")
    ),
  );
  assert(
    yaml.jobs.task!.steps.some((s: { name?: string; if?: string }) =>
      s.name === "Prepare task artifact" && s.if === undefined
    ),
  );
});

Deno.test("reusable cache limits form a capability subset, apply statically and follow each call path", () => {
  const modes = ["none", "read", "write-only", "write"] as const;
  const grants = {
    none: [],
    read: ["restore"],
    "write-only": ["save"],
    write: ["restore", "save"],
  } as const;
  for (const limit of modes) {
    for (const requested of modes) {
      const leaf = workflow(".github/workflows/leaf.yml", {
        on: { workflow_call: {} },
        cacheMode: requested,
      })
        .job(
          "build",
          ({ job }) =>
            job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }),
        );
      const middle = workflow(".github/workflows/middle.yml", {
        on: { workflow_call: {} },
      })
        .job(
          "call",
          ({ job }) =>
            job.reusable().call("./.github/workflows/leaf.yml", leaf, {}),
        );
      const root = workflow(".github/workflows/root.yml", {
        on: { push: {} },
        cacheMode: limit,
      })
        .job(
          "call",
          ({ job }) =>
            job.reusable().call("./.github/workflows/middle.yml", middle, {}),
        );
      const lower = () =>
        lowerProject(project({ workflows: [root, middle, leaf] }), "entry.ts");
      const allowed = grants[requested].every((cap) =>
        (grants[limit] as readonly string[]).includes(cap)
      );
      if (allowed) {
        lower();
      } else {assertThrows(
          lower,
          AuthoringValidationError,
          `exceeds explicit caller limit ${limit}`,
        );}
    }
  }
  const leaf = workflow(".github/workflows/leaf.yml", {
    on: { workflow_call: {} },
  })
    .job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").cacheMode("write").run({
          name: "Build",
          run: "true",
        }),
    );
  const root = workflow("root.yml", { on: { issue_comment: {} } })
    .job(
      "unrestricted",
      ({ job }) =>
        job.reusable().call("./.github/workflows/leaf.yml", leaf, {}),
    )
    .job(
      "restricted",
      ({ job }) =>
        job.reusable().cacheMode("read").call(
          "./.github/workflows/leaf.yml",
          leaf,
          {},
        ),
    );
  assertThrows(
    () => lowerProject(project({ workflows: [root, leaf] }), "entry.ts"),
    AuthoringValidationError,
    "leaf.yml.build: cache-mode write",
  );
});

Deno.test("cache access defaults stay distinct from explicit ceilings through nested scenarios", async () => {
  const leaf = workflow(".github/workflows/leaf.yml", {
    on: { workflow_call: {} },
  })
    .job(
      "inherited",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    )
    .job(
      "override",
      ({ job }) =>
        job.runsOn("ubuntu-latest").cacheMode("write").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    );
  const root = workflow("root.yml", { on: { issue_comment: {} } })
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/leaf.yml", leaf, {}),
    );
  const result = await scenario(root, (test, check) => {
    test.github({ event_name: "issue_comment", event: { action: "created" } });
    test.job("call", (job) => {
      job
        .call(leaf, (child) => {
          child.job("inherited", (job) => {
            job.step("build").fixture({});

            check((r) => {
              for (const i0 of r.jobs["call"]!.instances) {
                for (const i1 of i0.call!.jobs["inherited"]!.instances) {
                  assertEntries(i1.settings, {
                    cacheMode: "read",
                    cacheModeSource: "trigger",
                  });
                }
              }
            });
          });
          child.job("override", (job) => {
            job.step("build").fixture({});

            check((r) => {
              for (const i0 of r.jobs["call"]!.instances) {
                for (const i1 of i0.call!.jobs["override"]!.instances) {
                  assertEntries(i1.settings, {
                    cacheMode: "write",
                    cacheModeSource: "job",
                  });
                }
              }
            });
          });
        });
      check((r) => {
        for (const i0 of r.jobs["call"]!.instances) {
          assertEntries(i0.settings, {
            cacheMode: "read",
            cacheModeSource: "trigger",
          });
        }
      });
    });
  }, { config: project({ workflows: [root, leaf] }) });
  assertEquals(result.jobs.call!.result, "success");
  const cappedLeaf = workflow(".github/workflows/capped.yml", {
    on: { workflow_call: {} },
  })
    .job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    );
  const middle = workflow(".github/workflows/middle.yml", {
    on: { workflow_call: {} },
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().call("./.github/workflows/capped.yml", cappedLeaf, {}),
    );
  const cappedRoot = workflow("capped-root.yml", {
    on: { push: {} },
    cacheMode: "write",
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().cacheMode("none").call(
          "./.github/workflows/middle.yml",
          middle,
          {},
        ),
    );
  await scenario(cappedRoot, (test, check) => {
    test.github({ event_name: "push" });
    test.job("call", (job) => {
      job.call(
        middle,
        (child) => {
          child.job(
            "call",
            (job) => {
              job
                .call(cappedLeaf, (child) => {
                  child.job("build", (job) => {
                    job.step("build").fixture({});

                    check((r) => {
                      for (const i0 of r.jobs["call"]!.instances) {
                        for (const i1 of i0.call!.jobs["call"]!.instances) {
                          for (const i2 of i1.call!.jobs["build"]!.instances) {
                            assertEntries(i2.settings, {
                              cacheMode: "none",
                              cacheModeSource: "caller",
                            });
                          }
                        }
                      }
                    });
                  });
                });
              check((r) => {
                for (const i0 of r.jobs["call"]!.instances) {
                  for (const i1 of i0.call!.jobs["call"]!.instances) {
                    assertEntries(i1.settings, {
                      cacheMode: "none",
                      cacheModeSource: "caller",
                    });
                  }
                }
              });
            },
          );
        },
      );
      check((r) => {
        for (const i0 of r.jobs["call"]!.instances) {
          assertEntries(i0.settings, {
            cacheMode: "none",
            cacheModeSource: "job",
          });
        }
      });
    });
  }, { config: project({ workflows: [cappedRoot, middle, cappedLeaf] }) });
});

Deno.test("snapshot requests follow actual success, conditions and captured settings without running images", async () => {
  let bodies = 0;
  const ci = workflow("snapshots.yml", { on: { push: {} } })
    .job("image", ({ job }) =>
      job.runsOn("image-generation")
        .strategy({ matrix: { outcome: ["success", "failure", "cancelled"] } })
        .continueOnError(true)
        .snapshot({
          imageName: "ci-image",
          version: "2.*",
          if: ({ github }) => startsWith(github.ref, "refs/tags/").not(),
        })
        .task({
          id: "setup",
          name: "Setup",
          run: () => {
            bodies++;
          },
        }));
  for (const ref of ["refs/heads/main", "refs/tags/v1"]) {
    const result = await scenario(ci, (test, check) => {
      test.github({ event_name: "push", ref });
      test.job("image", (job) =>
        job.eachMatrix(({ outcome }, instance) => {
          instance;
          instance.step("setup").fixture({
            outcome: outcome as "success" | "failure" | "cancelled",
          });

          check((r) => {
            for (
              const i0 of matchingInstances(r.jobs["image"]!.instances, {
                outcome,
              })
            ) {
              assertEntries(i0.settings, {
                cacheMode: "write",
                cacheModeSource: "trigger",
                snapshot: outcome === "success" && ref === "refs/heads/main"
                  ? { imageName: "ci-image", version: "2.*" }
                  : undefined,
              });
            }
          });
          check((r) => {
            for (
              const i0 of matchingInstances(r.jobs["image"]!.instances, {
                outcome,
              })
            ) {
              assertEquals(
                i0.steps["setup"]!.outcome,
                outcome as "success" | "failure" | "cancelled",
              );
            }
          });
        }));
    });
    assertEquals(result.jobs.image!.instances.length, 3);
  }
  assertEquals(bodies, 0);
  const unused = workflow("unused.yml", { on: { push: {} } }).job(
    "image",
    ({ job }) =>
      job.runsOn("image-generation")
        .snapshot({ imageName: "ci", if: rawExpression("vars.MAKE_IMAGE") })
        .run({ id: "setup", name: "Setup", run: "true" }),
  );
  const result = await scenario(unused, (test, _check) => {
    test.github({ event_name: "push" });
    test.job("image", (job) => job.step("setup").fixture({}));
  });
  assertThrows(
    () => result.jobs.image!.instances[0].settings.snapshot,
    ScenarioError,
  );
  await assertRejects(
    () =>
      scenario(unused, (test, check) => {
        test.github({ event_name: "push" });
        test.job("image", (job) => {
          job.step("setup").fixture({});

          check((r) => {
            for (const i0 of r.jobs["image"]!.instances) {
              assertEquals(i0.settings.snapshot, undefined);
            }
          });
        });
      }),
    ScenarioError,
    "snapshot.if",
  );
});

Deno.test("invalid native settings and caller snapshots cannot reach YAML", () => {
  for (const mode of ["invalid", "${{ github.ref }}", null]) {
    const ci = workflow("invalid.yml", {
      on: { push: {} },
      cacheMode: mode as CacheMode,
    }).job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }),
    );
    assertThrows(
      () => lowerProject(project({ workflows: [ci] }), "entry.ts"),
      AuthoringValidationError,
      "cache-mode.invalid",
    );
  }
  for (
    const value of ["", { imageName: " " }, {
      imageName: "ci",
      version: "2.1.3",
    }, { imageName: "ci", version: "" }]
  ) {
    const ci = workflow("invalid.yml", { on: { push: {} } }).job(
      "image",
      ({ job }) =>
        job.runsOn("image-generation").snapshot(value).run({
          name: "Setup",
          run: "true",
        }),
    );
    assertThrows(
      () => lowerProject(project({ workflows: [ci] }), "entry.ts"),
      AuthoringValidationError,
      "job.snapshot.invalid",
    );
  }
});

Deno.test("trigger cache defaults and explicit overrides retain native precedence", async () => {
  for (
    const event of ["push", "pull_request", "pull_request_target"] as const
  ) {
    const ci = workflow("defaults.yml", {
      on: { push: {}, pull_request: {}, pull_request_target: {} },
    }).job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    );
    await scenario(ci, (test, check) => {
      if (event === "push") test.github({ event_name: "push" });
      else if (event === "pull_request") {
        test.github({
          event_name: "pull_request",
          event: { action: "opened" },
        });
      } else {test.github({
          event_name: "pull_request_target",
          event: { action: "opened" },
        });}
      test.job("build", (job) => {
        job.step("build").fixture({});

        check((r) => {
          for (const i0 of r.jobs["build"]!.instances) {
            assertEntries(i0.settings, {
              cacheMode: event === "pull_request_target" ? "read" : "write",
              cacheModeSource: "trigger",
            });
          }
        });
      });
    });
  }
  const ci = workflow("explicit.yml", {
    on: { pull_request_target: {} },
    cacheMode: "read",
  })
    .job(
      "inherited",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    )
    .job(
      "override",
      ({ job }) =>
        job.runsOn("ubuntu-latest").cacheMode("write-only").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    );
  await scenario(ci, (test, check) => {
    test.github({
      event_name: "pull_request_target",
      event: { action: "opened" },
    });
    test.job("inherited", (job) => {
      job.step("build").fixture({});

      check((r) => {
        for (const i0 of r.jobs["inherited"]!.instances) {
          assertEntries(i0.settings, {
            cacheMode: "read",
            cacheModeSource: "workflow",
          });
        }
      });
    });
    test.job("override", (job) => {
      job.step("build").fixture({});

      check((r) => {
        for (const i0 of r.jobs["override"]!.instances) {
          assertEntries(i0.settings, {
            cacheMode: "write-only",
            cacheModeSource: "job",
          });
        }
      });
    });
  });
});

Deno.test("snapshot is absent after environment rejection and initialization failure", async () => {
  const ci = workflow("gated.yml", { on: { push: {} } })
    .job(
      "rejected",
      ({ job }) =>
        job.runsOn("image-generation").environment("production").snapshot({
          imageName: "ci",
          if: rawExpression("vars.UNREAD"),
        }).run({ id: "build", name: "Build", run: "true" }),
    )
    .job(
      "initialization",
      ({ job }) =>
        job.runsOn("image-generation").container("node:22").snapshot({
          imageName: "ci",
          if: rawExpression("vars.UNREAD"),
        }).run({ id: "build", name: "Build", run: "true" }),
    );
  await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });

    test.job("rejected", (job) => {
      job.environmentProtection("rejected");
      job.step("build");

      check((r) => {
        for (const i0 of r.jobs["rejected"]!.instances) {
          assertEntries(i0.settings, {
            snapshot: undefined,
          });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["rejected"]!.instances) {
          assertEquals(i0.steps["build"]?.outcome ?? "skipped", "skipped");
        }
      });
    });
    test.job("initialization", (job) => {
      job.containerInitialization("failure");
      job.step("build");

      check((r) => {
        for (const i0 of r.jobs["initialization"]!.instances) {
          assertEntries(i0.settings, {
            snapshot: undefined,
          });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["initialization"]!.instances) {
          assertEquals(i0.steps["build"]?.outcome ?? "skipped", "skipped");
        }
      });
    });

    check((r) => {
      assertEquals(r.result, "failure");
    });
  });
});

Deno.test("native caller validation rejects snapshot even when untyped data bypasses builders", () => {
  const root = workflow("root.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable().cacheMode("read").rawCall(
        "owner/repo/.github/workflows/ci.yml@v1",
        {},
      ),
  );
  const native =
    lowerProject(project({ workflows: [root] }), "entry.ts").workflows[0]
      .workflow;
  const result = validateWorkflow({
    ...native,
    jobs: native.jobs.map((job) => ({ ...job, snapshot: "ci" })),
  });
  assert(!result.ok);
  assert(result.diagnostics.some((d) => d.code === "job.call.invalid"));
});
