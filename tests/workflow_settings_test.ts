import {
  assertEntries,
  checkedScenario as scenario,
  matchingInstances,
} from "./scenario_checks.ts";
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  always,
  failure,
  literal,
  project,
  rawExpression,
  workflow,
  type WorkflowPermissions,
} from "../src/github_actions/mod.ts";
import { ScenarioError } from "../src/testing/mod.ts";
import {
  AuthoringValidationError,
  lowerProject,
} from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import { permissionLevels } from "../src/github_actions/permissions.ts";

Deno.test("fixed settings reach native YAML, preserving both permission shorthands and every map key", () => {
  const permissions = Object.fromEntries(
    Object.keys(permissionLevels).map(
      (key) => [key, key === "id-token" ? "write" : "read"],
    ),
  ) as WorkflowPermissions;
  for (const value of [permissions, "read-all", "write-all", {}] as const) {
    const ci = workflow(".github/workflows/settings.yml", {
      on: { push: {} },
      permissions: value,
      defaults: { shell: "bash", workingDirectory: "root" },
      concurrency: ({ github }) => ({
        group: github.ref,
        cancelInProgress: github.ref.ne("refs/heads/main"),
      }),
    }).job(
      "deploy",
      ({ job }) =>
        job.runsOn({ group: "deploy", labels: ["linux", "x64"] })
          .permissions(value).environment({
            name: "production",
            deployment: false,
          })
          .concurrency(({ github }) => ({
            group: github.ref,
            cancelInProgress: literal(false),
            queue: "max",
          }))
          .run({
            id: "deploy",
            name: "Deploy",
            run: "deploy",
            outputs: ["url"],
          })
          .environment({
            name: "production",
            deployment: false,
            url: ({ steps }) => steps.deploy.outputs.url,
          }),
    );
    const native =
      lowerProject(project({ workflows: [ci] }), "./tsugiori.ts").workflows[0]
        .workflow;
    const yaml = parse(emitWorkflow(native));
    assertEquals(yaml.permissions, value);
    assertEquals(yaml.jobs.deploy!.permissions, value);
    assertEquals(yaml.defaults, {
      run: { shell: "bash", "working-directory": "root" },
    });
    assertEquals(yaml.jobs.deploy!["runs-on"], {
      group: "deploy",
      labels: ["linux", "x64"],
    });
    assertEquals(yaml.jobs.deploy!.environment, {
      name: "production",
      deployment: false,
      url: "${{ steps.deploy.outputs.url }}",
    });
    assertEquals(
      yaml.concurrency["cancel-in-progress"],
      "${{ (github.ref != 'refs/heads/main') }}",
    );
    assertEquals(
      yaml.jobs.deploy!.concurrency["cancel-in-progress"],
      "${{ false }}",
    );
  }
  assertThrows(
    () =>
      workflow("invalid.yml", {
        on: { push: {} },
        permissions: {
          "vulnerability-alerts": "write",
        } as unknown as WorkflowPermissions,
      }),
    TypeError,
  );
  assertThrows(
    () =>
      workflow("invalid.yml", {
        on: { push: {} },
        permissions: { "id-token": "read" } as unknown as WorkflowPermissions,
      }),
    TypeError,
  );
});

Deno.test("scenario interprets requested settings and defaults without assigning runners or executing commands", async () => {
  const ci = workflow(".github/workflows/settings.yml", {
    on: { push: {} },
    defaults: { shell: "bash", workingDirectory: "root" },
    concurrency: ({ github }) => ({
      group: github.ref,
      cancelInProgress: github.ref.eq("refs/heads/main"),
    }),
  }).job("build", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .strategy({ matrix: { stage: ["dev", "production"] } })
      .runsOn(({ matrix }) => ({ group: matrix.stage, labels: ["linux"] }))
      .defaultsRun(({ matrix }) => ({ workingDirectory: matrix.stage }))
      .concurrency(({ matrix }) => ({
        group: matrix.stage,
        cancelInProgress: matrix.stage.eq("dev"),
      }))
      .environment({
        name: ({ matrix }) => matrix.stage,
        deployment: rawExpression("matrix.stage == 'production'"),
      })
      .run({
        id: "build",
        name: "Build",
        run: "must-not-execute",
        outputs: ["url"],
      })
      .run({
        id: "other",
        name: "Other",
        run: "must-not-execute",
        shell: "sh",
        workingDirectory: "step",
        env: { DIR: "step" },
      })
      .environment({
        name: ({ matrix }) => matrix.stage,
        deployment: rawExpression("matrix.stage == 'production'"),
        url: ({ steps }) => steps.build.outputs.url,
      }));
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push", ref: "refs/heads/main" });

    test.job("build", (job) =>
      job.eachMatrix(({ stage }, instance) => {
        instance.environmentProtection("passed");
        instance.step("build").fixture(({ run }) => {
          assertEquals(run, { shell: "bash", workingDirectory: stage });
          return { outputs: { url: `https://example.com/${stage}` } };
        });
        instance.step("other").fixture({});

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["build"]!.instances, { stage })
          ) {
            assertEntries(i0.settings, {
              runsOn: { group: stage, labels: ["linux"] },
              environment: {
                name: stage,
                deployment: stage === "production",
                url: `https://example.com/${stage}`,
              },
              concurrency: { group: stage, cancelInProgress: stage === "dev" },
            });
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["build"]!.instances, { stage })
          ) {
            assertEntries(i0.steps["build"]!.run!, {
              shell: "bash",
              workingDirectory: stage,
            });
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["build"]!.instances, { stage })
          ) {
            assertEntries(i0.steps["other"]!.run!, {
              shell: "sh",
              workingDirectory: "step",
            });
          }
        });
      }));

    check((r) => {
      assertEquals(r.concurrency, {
        group: "refs/heads/main",
        cancelInProgress: true,
      });
    });
  });
  assertEquals(result.concurrency, {
    group: "refs/heads/main",
    cancelInProgress: true,
  });
  assertEquals(result.jobs.build!.result, "success");
});

Deno.test("environment rejection skips all steps and outputs, propagating failure through needs and status checks", async () => {
  let fixtures = 0;
  const ci = workflow(".github/workflows/gate.yml", { on: { push: {} } })
    .job(
      "deploy",
      ({ job }) =>
        job.runsOn("ubuntu-latest").environment("production")
          .task({
            id: "deploy",
            name: "Deploy",
            outputs: { url: { required: true } },
            run: () => {
              throw new Error("Task body must not run");
            },
          })
          .outputs(({ steps }) => ({ url: steps.deploy.outputs.url })),
    )
    .job(
      "normal",
      ({ job, jobs }) =>
        job.needs(jobs.deploy).runsOn("ubuntu-latest").run({
          id: "normal",
          name: "Normal",
          run: "true",
        }),
    )
    .job(
      "failure",
      ({ job, jobs }) =>
        job.needs(jobs.deploy).runsOn("ubuntu-latest").when(() => failure())
          .run({
            id: "report",
            name: "Report",
            run: "true",
            env: ({ needs }) => ({ URL: needs.deploy.outputs.url }),
          }),
    )
    .job(
      "always",
      ({ job, jobs }) =>
        job.needs(jobs.deploy).runsOn("ubuntu-latest").when(() => always()).run(
          { id: "report", name: "Report", run: "true" },
        ),
    )
    .job(
      "ancestor",
      ({ job, jobs }) =>
        job.needs(jobs.normal).runsOn("ubuntu-latest").when(() => failure())
          .run({ id: "report", name: "Report", run: "true" }),
    );
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });

    test.job("deploy", (job) => {
      job.environmentProtection("rejected");
      job.step("deploy").fixture(() => {
        fixtures++;
        return { outputs: { url: "unexpected" } };
      });

      check((r) => {
        assertEquals(r.jobs["deploy"]!.result, "failure");
      });
      check((r) => {
        assertEntries(r.jobs["deploy"]!.outputs, {});
      });
      check((r) => {
        for (const i0 of r.jobs["deploy"]!.instances) {
          assertEquals(i0.stepOrder, []);
        }
      });
      check((r) => {
        for (const i0 of r.jobs["deploy"]!.instances) {
          assertEquals(i0.steps["deploy"]?.outcome ?? "skipped", "skipped");
        }
      });
    });
    test.job("normal", (_job) => {
      check((r) => {
        assertEquals(r.jobs["normal"]!.result, "skipped");
      });
    });
    for (const id of ["failure", "always", "ancestor"] as const) {
      test.job(id, (job) => {
        job.step("report").fixture({});
        check((r) => {
          for (const i0 of r.jobs[id]!.instances) {
            assertEquals(i0.steps["report"]!.outcome !== "skipped", true);
          }
        });
      });
    }

    check((r) => {
      assertEquals(r.result, "failure");
    });
  });
  assertEquals(fixtures, 0);
  assertEquals(result.jobs.deploy!.instances[0].steps, {});
  assertEquals(result.jobs.deploy!.outputs, {});
});

Deno.test("environment fixtures follow matrix instances, job conditions and optional gate omission", async () => {
  let fixtures = 0;
  const ci = workflow(".github/workflows/matrix.yml", { on: { push: {} } })
    .job(
      "deploy",
      ({ job }) =>
        job.runsOn("ubuntu-latest").strategy({
          matrix: { stage: ["dev", "production"] },
        }).environment({ name: ({ matrix }) => matrix.stage })
          .run({ id: "deploy", name: "Deploy", run: "true", outputs: ["url"] })
          .outputs(({ steps }) => ({ url: steps.deploy.outputs.url })),
    )
    .job(
      "skipped",
      ({ job }) =>
        job.runsOn("ubuntu-latest").when(() => literal(false)).environment(
          "production",
        ).run({ id: "never", name: "Never", run: "true" }),
    );
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("deploy", (job) =>
      job.eachMatrix(({ stage }, instance) => {
        if (stage === "production") {
          instance.environmentProtection("rejected")
            .step("deploy");
        } else {instance.step("deploy").fixture(() => {
            fixtures++;
            return { outputs: { url: "https://dev.example.com" } };
          });}

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["deploy"]!.instances, {
              stage,
            })
          ) {
            assertEquals(
              i0.result,
              stage === "production" ? "failure" : "success",
            );
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["deploy"]!.instances, {
              stage,
            })
          ) {
            assertEquals(
              i0.steps["deploy"]?.outcome ?? "skipped",
              stage === "production" ? "skipped" : "success",
            );
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["deploy"]!.instances, {
              stage,
            })
          ) {
            assertEquals(
              i0.result,
              stage === "production" ? "failure" : "success",
            );
          }
        });
      }));
    test.job("skipped", (job) => {
      job.environmentProtection("passed");
      check((r) => {
        assertEquals(r.jobs["skipped"]!.result, "skipped");
      });
    });
  });
  assertEquals(fixtures, 1);
  assertEquals(result.jobs.deploy!.outputs, { url: "https://dev.example.com" });
  assertEquals(
    result.jobs.deploy!.instances.map((instance) => instance.result),
    ["success", "failure"],
  );
});

Deno.test("environment rejection inside a local reusable workflow propagates without caller defaults leaking", async () => {
  const callee = workflow(".github/workflows/callee.yml", {
    on: { workflow_call: {} },
    defaults: { shell: "sh" },
  })
    .job(
      "deploy",
      ({ job }) =>
        job.runsOn("ubuntu-latest").environment("production").run({
          id: "deploy",
          name: "Deploy",
          run: "true",
          outputs: ["url"],
        }).outputs(({ steps }) => ({ url: steps.deploy.outputs.url })),
    )
    .workflowOutputs(({ jobs }) => ({ url: jobs.deploy.outputs.url }));
  const caller = workflow(".github/workflows/caller.yml", {
    on: { push: {} },
    defaults: { shell: "bash", workingDirectory: "caller" },
  })
    .job(
      "call",
      ({ job }) =>
        job.reusable().concurrency(({ github }) => ({
          group: github.event_name,
          cancelInProgress: github.ref.eq("refs/heads/main"),
        })).call("./.github/workflows/callee.yml", callee, {}),
    );
  for (const decision of ["passed", "rejected"] as const) {
    const result = await scenario(caller, (test, check) => {
      test.github({ event_name: "push", ref: "refs/heads/main" });
      test.job("call", (job) => {
        job.call(callee, (child) =>
          child.job("deploy", (deploy) => {
            deploy.environmentProtection(decision);
            if (decision === "passed") {
              deploy.step("deploy").fixture(
                ({ run }) => {
                  assertEquals(run, { shell: "sh" });
                  return { outputs: { url: "https://example.com" } };
                },
              );
            } else deploy.step("deploy");

            check((r) => {
              for (const i0 of r.jobs["call"]!.instances) {
                for (
                  const i1 of i0.call!.jobs["deploy"]!.instances
                ) {
                  if (decision === "passed") {
                    assertEntries(i1.steps["deploy"]!.run!, { shell: "sh" });
                  }
                }
              }
            });
            check((r) => {
              for (const i0 of r.jobs["call"]!.instances) {
                for (
                  const i1 of i0.call!.jobs["deploy"]!.instances
                ) {
                  assertEquals(
                    i1.steps["deploy"]?.outcome ?? "skipped",
                    decision === "passed" ? "success" : "skipped",
                  );
                }
              }
            });
          }));
        check((r) => {
          for (const i0 of r.jobs["call"]!.instances) {
            assertEntries(i0.settings, {
              concurrency: { group: "push", cancelInProgress: true },
            });
          }
        });
      });
    }, { config: project({ workflows: [caller, callee] }) });
    assertEquals(
      result.jobs.call!.result,
      decision === "passed" ? "success" : "failure",
    );
    assertEquals(result.jobs.call!.outputs, {
      url: decision === "passed" ? "https://example.com" : "",
    });
  }
});

Deno.test("workflow defaults forbid contexts and invalid maps, and dynamic queue conflicts remain runtime checks", async () => {
  const create = (defaults: unknown) =>
    workflow("ci.yml", {
      on: { push: {} },
      defaults: defaults as { shell: string },
    }).job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({
          id: "build",
          name: "Build",
          run: "true",
        }),
    );
  for (
    const defaults of [{ shell: "${{ github.ref }}" }, { shell: 4 }, {
      unrelated: "bash",
    }]
  ) {
    assertThrows(
      () =>
        lowerProject(
          project({ workflows: [create(defaults)] }),
          "./tsugiori.ts",
        ),
      AuthoringValidationError,
    );
  }
  const ci = workflow("ci.yml", {
    on: { push: {} },
    concurrency: {
      group: "ci",
      cancelInProgress: rawExpression("fromJSON(vars.CANCEL)"),
      queue: "max",
    },
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
  assert(lowerProject(project({ workflows: [ci] }), "./tsugiori.ts"));
  await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.vars({ CANCEL: "false" });

    test.job("build", (job) => job.step("build").fixture({}));

    check((r) => {
      assertEquals(r.concurrency, {
        group: "ci",
        cancelInProgress: false,
        queue: "max",
      });
    });
  });
  await assertRejects(
    () =>
      scenario(ci, (test, check) => {
        test.github({ event_name: "push" });
        test.vars({ CANCEL: "true" });

        check((r) => {
          assertEquals(r.concurrency, {
            group: "ci",
            cancelInProgress: true,
            queue: "max",
          });
        });
      }),
    ScenarioError,
    "queue max requires false",
  );
});

Deno.test("run settings use the explicit step env and environment URL observes final job status", async () => {
  const ci = workflow("ci.yml", {
    on: { push: {} },
    defaults: { shell: "bash", workingDirectory: "workflow" },
  })
    .job("build", ({ job }) =>
      job.runsOn({ group: "build", labels: "linux" })
        .env({ DIR: "job" }).defaultsRun(({ env }) => ({
          workingDirectory: env.DIR,
        }))
        .environment({ name: "dev", url: ({ job }) => job.status })
        .run({
          id: "build",
          name: "Build",
          run: "never executed",
          env: { DIR: "step" },
          workingDirectory: "${{ env.DIR }}",
        }));
  const result = await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => {
      job.step("build").fixture({ outcome: "failure" });

      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEntries(i0.settings, {
            runsOn: { group: "build", labels: ["linux"] },
            environment: { name: "dev", url: "failure" },
          });
        }
      });
      check((r) => {
        for (const i0 of r.jobs["build"]!.instances) {
          assertEntries(i0.steps["build"]!.run!, {
            shell: "bash",
            workingDirectory: "step",
          });
        }
      });
    });
  });
  assertEquals(result.jobs.build!.result, "failure");
});

Deno.test("matrix instance settings evaluate native expressions with instance context", async () => {
  const ci = workflow("ci.yml", { on: { push: {} } })
    .job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").strategy({
          matrix: { stage: ["dev", "prod"] },
        })
          .runsOn({
            group: rawExpression("matrix.stage"),
            labels: ["linux"],
          })
          .concurrency({
            group: rawExpression("matrix.stage"),
            cancelInProgress: rawExpression("false"),
            queue: "max",
          })
          .defaultsRun({ shell: rawExpression("'bash'") })
          .environment({
            name: rawExpression("matrix.stage"),
            deployment: rawExpression("false"),
          })
          .run({ id: "build", name: "Build", run: "never executed" }),
    );
  await scenario(ci, (test, check) => {
    test.github({ event_name: "push" });
    test.job("build", (job) =>
      job.eachMatrix(({ stage }, instance) => {
        instance;
        instance.step("build").fixture({});

        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["build"]!.instances, { stage })
          ) {
            assertEntries(i0.settings, {
              runsOn: { group: stage, labels: ["linux"] },
              concurrency: {
                group: stage,
                cancelInProgress: false,
                queue: "max",
              },
              environment: { name: stage, deployment: false },
            });
          }
        });
        check((r) => {
          for (
            const i0 of matchingInstances(r.jobs["build"]!.instances, { stage })
          ) assertEntries(i0.steps["build"]!.run!, { shell: "bash" });
        });
      }));
  });
});

Deno.test("settings capture fixture shortages and report them only when read", async () => {
  const ci = workflow("ci.yml", {
    on: { push: {} },
    vars: ["GROUP", "RUNNER", "DIR"],
    concurrency: ({ vars }) => ({ group: vars.GROUP, cancelInProgress: false }),
  }).job("build", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .runsOn(({ vars }) => vars.RUNNER)
      .defaultsRun(({ vars }) => ({ workingDirectory: vars.DIR }))
      .run({
        id: "build",
        name: "Build",
        run: "true",
        shell: "${{ runner.shell }}",
      }));
  const result = await scenario(ci, (test, _check) => {
    test.github({ event_name: "push" });
    test.job("build", (job) => job.step("build").fixture({}));
  });
  assertEquals(result.jobs.build!.result, "success");
  assertEquals(result.concurrency!.cancelInProgress, false);
  assertThrows(
    () => result.concurrency!.group,
    ScenarioError,
    "missing referenced context vars",
  );
  const instance = result.jobs.build!.instances[0];
  assertThrows(() => instance.settings.runsOn, ScenarioError);
  assertThrows(
    () => instance.steps.build!.run!.shell,
    ScenarioError,
    "runner.shell",
  );
  assertThrows(
    () => instance.steps.build!.run!.workingDirectory,
    ScenarioError,
    "vars",
  );
});
