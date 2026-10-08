import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  always,
  failure,
  project,
  toJSON,
  workflow,
} from "../src/github_actions/mod.ts";
import {
  AuthoringValidationError,
  lowerProject,
} from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import {
  scenario,
  ScenarioError,
  type ScenarioObservation,
} from "../src/testing/mod.ts";

Deno.test("container/services preserve native fields and immutable declarations in generated YAML", () => {
  const ci = workflow("containers.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) => {
      const before = job.runsOn("ubuntu-latest").strategy({
        matrix: { image: ["node:22"] },
      });
      const configured = before.container({
        image: ({ matrix }) => matrix.image,
        credentials: ({ github, secrets }) => ({
          username: github.actor,
          password: secrets.TOKEN,
        }),
        env: ({ secrets, runner }) => ({
          TOKEN: secrets.TOKEN,
          TEMP: runner.temp,
        }),
        ports: [8080, "9000:9000"],
        volumes: ["cache:/cache"],
        options: "--cpus 1",
      }).services({
        db: {
          image: "postgres:17",
          credentials: {
            username: "fixture-user",
            password: "fixture-password",
          },
          env: { POSTGRES_PASSWORD: "fixture" },
          ports: [5432, "9000:9000"],
          volumes: ["data:/data"],
          options: "--health-cmd pg_isready",
          command: "-c max_connections=100",
          entrypoint: "docker-entrypoint.sh",
        },
      });
      return configured.run({ name: "Test", run: "true" });
    },
  );
  const native =
    lowerProject(project({ workflows: [ci] }), "./workflows.ts").workflows[0]
      .workflow;
  const yaml = parse(emitWorkflow(native));
  assertEquals(yaml.jobs.test.container, {
    image: "${{ matrix.image }}",
    credentials: {
      username: "${{ github.actor }}",
      password: "${{ secrets.TOKEN }}",
    },
    env: { TOKEN: "${{ secrets.TOKEN }}", TEMP: "${{ runner.temp }}" },
    ports: [8080, "9000:9000"],
    volumes: ["cache:/cache"],
    options: "--cpus 1",
  });
  assertEquals(yaml.jobs.test.services.db, {
    image: "postgres:17",
    credentials: { username: "fixture-user", password: "fixture-password" },
    env: { POSTGRES_PASSWORD: "fixture" },
    ports: [5432, "9000:9000"],
    volumes: ["data:/data"],
    options: "--health-cmd pg_isready",
    command: "-c max_connections=100",
    entrypoint: "docker-entrypoint.sh",
  });
  const shorthand = workflow("short.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").container("node:22").run({
        name: "Test",
        run: "true",
      }),
  );
  assertEquals(
    parse(
      emitWorkflow(
        lowerProject(project({ workflows: [shorthand] }), "./w.ts").workflows[0]
          .workflow,
      ),
    ).jobs.test.container,
    "node:22",
  );
});

Deno.test("invalid container fields are rejected without claiming runner/image compatibility", () => {
  for (
    const config of [
      { image: "" },
      { image: "node:22", options: "--network host" },
      { image: "node:22", options: "--entrypoint=node" },
      { image: "node:22", ports: [0] },
      { image: "node:22", credentials: { username: "x" } },
    ]
  ) {
    const ci = workflow("invalid.yml", { on: { push: {} } }).job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").container(config as never).run({
          name: "Test",
          run: "true",
        }),
    );
    assertThrows(
      () => lowerProject(project({ workflows: [ci] }), "./w.ts"),
      AuthoringValidationError,
    );
  }
  const ci = workflow("task.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").container("alpine:3").services({
        db: { image: "" },
      }).task({ name: "Task", run: () => {} }),
  );
  const lowered = lowerProject(project({ workflows: [ci] }), "./w.ts");
  assertEquals(lowered.workflows[0].workflow.jobs[0].container, "alpine:3");
  assert(lowered.tasks.length === 1);
});

Deno.test("matrix settings and runtime service ports require only read fixture values", async () => {
  const ci = workflow("matrix-containers.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy({ matrix: { version: ["16", "17"] } }).container({
          image: ({ matrix }) => matrix.version,
        })
        .services({
          db: {
            image: ({ matrix }) => matrix.version,
            ports: [5432],
            env: ({ secrets }) => ({ PASSWORD: secrets.DB_PASSWORD }),
          },
        })
        .run({
          id: "test",
          name: "Test",
          run: "true",
          env: ({ job }) => ({ PORT: job.services.db.ports["5432"] }),
        })
        .outputs(({ job }) => ({ port: job.services.db.ports["5432"] })),
  );
  const result = await scenario(ci, (test) => {
    test.github({ event_name: "push" }).secrets({ DB_PASSWORD: "fixture" });
    test.job("test", (job) =>
      job.eachMatrix(({ version }, instance) => {
        instance.expectSettings({
          container: { image: version },
          services: {
            db: { image: version, ports: [5432], env: { PASSWORD: "fixture" } },
          },
        });
        instance.containerRuntime({
          services: { db: { ports: { "5432": "32768" } } },
        });
        instance.step("test").fixture(({ env }) => {
          assertEquals(env.PORT, "32768");
          return {};
        });
      }));
  });
  assertEquals(result.jobs.test.outputs, { port: "32768" });
  assertEquals(result.jobs.test.instances.length, 2);
  await assertRejects(
    () =>
      scenario(ci, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => job.step("test").fixture({}));
      }),
    ScenarioError,
    "job.services.db.ports",
  );
});

Deno.test("unused settings require no extra contexts; disabled services use native empty-property semantics", async () => {
  const ci = workflow("lazy.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .container({
          image: ({ vars }) => vars.IMAGE,
          credentials: ({ secrets }) => ({
            username: "fixture",
            password: secrets.TOKEN,
          }),
        })
        .services({ db: { image: ({ vars }) => vars.DB_IMAGE } }).run({
          id: "test",
          name: "Test",
          run: "true",
        }),
  );
  await scenario(ci, (test) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => job.step("test").fixture({}));
  });
  const disabled = workflow("disabled.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").services({ db: { image: "" } })
        .run({
          id: "test",
          name: "Test",
          run: "true",
          env: ({ job }) => ({ PORT: job.services.db.ports["5432"] }),
        }),
  );
  await scenario(disabled, (test) => {
    test.github({ event_name: "push" });
    test.job("test", (job) =>
      job.step("test").fixture(({ env }) => {
        assertEquals(env.PORT, "");
        return {};
      }));
  });
  await assertRejects(
    () =>
      scenario(disabled, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => {
          job.containerRuntime({ services: { db: { id: "fixture" } } });
          job.step("test").fixture({});
        });
      }),
    ScenarioError,
    "Disabled service",
  );
});

Deno.test("whole runtime object reads require complete fixtures instead of fabricated IDs", async () => {
  const ci = workflow("objects.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17" } })
        .run({
          id: "test",
          name: "Test",
          run: "true",
          env: ({ job }) => ({ DB: toJSON(job.services.db) }),
        }),
  );
  await assertRejects(
    () =>
      scenario(ci, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => {
          job.containerRuntime({ services: { db: { ports: {} } } });
          job.step("test").fixture({});
        });
      }),
    ScenarioError,
    "job.services.db.id",
  );
  await scenario(ci, (test) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => {
      job.containerRuntime({
        services: {
          db: { id: "fixture-id", network: "fixture-network", ports: {} },
        },
      });
      job.step("test").fixture({});
    });
  });
});

Deno.test("initialization failure preserves failure/always gates, job tolerance, outputs and dependency results", async () => {
  for (const tolerated of [false, true]) {
    const ci = workflow("failure.yml", { on: { push: {} } }).job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").container("node:22").continueOnError(
          tolerated,
        )
          .run({
            id: "normal",
            name: "Normal",
            run: "true",
            outputs: ["value"],
          })
          .run({
            id: "failed",
            name: "Failure",
            run: "true",
            if: () => failure(),
            outputs: ["value"],
          })
          .run({
            id: "always",
            name: "Always",
            run: "true",
            if: () => always(),
            env: ({ job }) => ({ STATUS: job.status }),
          })
          .outputs(({ steps }) => ({
            value: steps.failed.outputs.value,
            missing: steps.normal.outputs.value,
          })),
    )
      .job(
        "dependent",
        ({ job, jobs }) =>
          job.needs(jobs.test).runsOn("ubuntu-latest").run({
            id: "next",
            name: "Next",
            run: "true",
          }),
      );
    const events: ScenarioObservation[] = [];
    const result = await scenario(ci, (test) => {
      test.github({ event_name: "push" });
      test.job("test", (job) => {
        job.containerInitialization("failure").expectResult(
          tolerated ? "success" : "failure",
        );
        job.step("normal").expectSkip();
        job.step("failed").fixture({ outputs: { value: "after-failure" } })
          .expectRun();
        job.step("always").fixture(({ env }) => {
          assertEquals(env.STATUS, "failure");
          return {};
        });
      });
      test.job("dependent", (job) => {
        if (tolerated) job.step("next").fixture({}).expectRun();
        else job.step("next").expectSkip();
      });
      test.expectResult(tolerated ? "success" : "failure");
    }, { observe: (event) => events.push(event) });
    assertEquals(result.jobs.test.outputs, {
      value: "after-failure",
      missing: "",
    });
    assertEquals(result.jobs.test.instances[0].outcome, "failure");
    assert(
      events.some((e) =>
        e.stage === "container-initialization" && e.status === "failure" &&
        e.errorType === "initialization_failed"
      ),
    );
    assert(!JSON.stringify(events).includes("node:22"));
  }
});

Deno.test("initialization fixtures are per-matrix and observers cannot interfere", async () => {
  const ci = workflow("init.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({
        matrix: { broken: [false, true] },
      })
        .services({ db: { image: "postgres:17" } }).run({
          id: "test",
          name: "Test",
          run: "true",
        }),
  );
  const run = (observe?: () => void) =>
    scenario(ci, (test) => {
      test.github({ event_name: "push" });
      test.job("test", (job) =>
        job.eachMatrix(({ broken }, instance) => {
          instance.containerInitialization(broken ? "failure" : "success")
            .expectResult(broken ? "failure" : "success");
          if (broken) instance.step("test").expectSkip();
          else instance.step("test").fixture({});
        }));
    }, { observe });
  assertEquals(
    await run(() => {
      throw new Error("host failure");
    }),
    await run(),
  );
});

Deno.test("service-only jobs expose the runner network with no job container ID", async () => {
  const ci = workflow("network.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17" } })
        .run({
          id: "test",
          name: "Test",
          run: "true",
          env: ({ job }) => ({
            NETWORK: job.container.network,
            ID: job.container.id,
            CONTAINER: toJSON(job.container),
          }),
        }),
  );
  await assertRejects(
    () =>
      scenario(ci, (test) => {
        test.github({ event_name: "push" });
        test.job("test", (job) => job.step("test").fixture({}));
      }),
    ScenarioError,
    "job.container.network",
  );
  await scenario(ci, (test) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => {
      job.containerRuntime({ container: { network: "fixture-network" } });
      job.step("test").fixture(({ env }) => {
        assertEquals(env, {
          NETWORK: "fixture-network",
          ID: "",
          CONTAINER: '{"network":"fixture-network"}',
        });
        return {};
      });
    });
  });
});
