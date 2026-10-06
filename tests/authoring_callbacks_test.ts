import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  defineCompositeAction,
  defineProject,
  defineWorkflow,
  rawNode,
  textValue,
} from "../src/github_actions/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";

Deno.test("whole callbacks execute once in their own scope and preserve generated YAML", () => {
  const counts = new Map<string, number>();
  const record = (field: string) =>
    counts.set(field, (counts.get(field) ?? 0) + 1);
  const text = textValue();
  const build = (callbacks: boolean) => {
    const composite = defineCompositeAction("actions/echo/action.yml", {
      name: "Echo",
      description: "Echo input",
      inputs: { value: { description: "Value" } },
    }).steps(({ step }) =>
      step.run({
        name: "Echo",
        shell: "bash",
        run: 'echo "$VALUE"',
        env: callbacks
          ? ({ inputs }) => {
            record("composite-env");
            return { VALUE: inputs.value };
          }
          : { VALUE: rawNode<string>("inputs.value") },
      }).task({
        name: "Composite task",
        outputs: {},
        inputs: callbacks
          ? ({ inputs }) => {
            record("composite-inputs");
            return { value: { contract: text, from: inputs.value } };
          }
          : {
            value: {
              contract: text,
              from: rawNode<string>("inputs.value"),
            },
          },
        env: callbacks
          ? ({ inputs }) => {
            record("composite-task-env");
            return { VALUE: inputs.value };
          }
          : { VALUE: rawNode<string>("inputs.value") },
        run: () => {
          throw new Error("Task bodies must not execute during authoring");
        },
      })
    );
    const callee = defineWorkflow(".github/workflows/callee.yml", {
      on: {
        workflow_call: {
          inputs: { revision: { type: "string", required: true } },
          secrets: { token: { required: true } },
        },
      },
    }).job(
      "build",
      ({ job }) =>
        job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }),
    );
    const workflow = defineWorkflow(".github/workflows/caller.yml", {
      on: { push: {} },
      secrets: ["TOKEN"],
    }).job("build", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .env(
          callbacks
            ? ({ github }) => {
              record("job-env");
              return { SHA: github.sha };
            }
            : { SHA: rawNode<string>("github.sha") },
        )
        .defaultsRun(
          callbacks
            ? ({ github }) => {
              record("defaults");
              return { shell: "bash", workingDirectory: github.workspace };
            }
            : {
              shell: "bash",
              workingDirectory: rawNode<string>("github.workspace"),
            },
        )
        .concurrency(
          callbacks
            ? ({ github }) => {
              record("concurrency");
              return {
                group: github.ref,
                cancelInProgress: false,
                queue: "max",
              };
            }
            : {
              group: rawNode<string>("github.ref"),
              cancelInProgress: false,
              queue: "max",
            },
        )
        .uses(composite, {
          with: { value: "value" },
          env: callbacks
            ? ({ github }) => {
              record("uses-env");
              return { SHA: github.sha };
            }
            : { SHA: rawNode<string>("github.sha") },
        })
        .run({
          name: "Run",
          run: "true",
          env: callbacks
            ? ({ github }) => {
              record("run-env");
              return { SHA: github.sha };
            }
            : { SHA: rawNode<string>("github.sha") },
        })
        .task({
          name: "Task",
          outputs: {},
          inputs: callbacks
            ? ({ github }) => {
              record("task-inputs");
              return { sha: { contract: text, from: github.sha } };
            }
            : {
              sha: {
                contract: text,
                from: rawNode<string>("github.sha"),
              },
            },
          env: callbacks
            ? ({ github }) => {
              record("task-env");
              return { SHA: github.sha };
            }
            : { SHA: rawNode<string>("github.sha") },
          run: () => {
            throw new Error("Task bodies must not execute during authoring");
          },
        }))
      .job("call", ({ job }) =>
        job.reusable()
          .concurrency(
            callbacks
              ? ({ github }) => {
                record("reusable-concurrency");
                return { group: github.ref, cancelInProgress: false };
              }
              : {
                group: rawNode<string>("github.ref"),
                cancelInProgress: false,
              },
          )
          .call("./.github/workflows/callee.yml", callee, {
            with: callbacks
              ? (context) => {
                record("call-with");
                assertEquals("secrets" in context, false);
                return { revision: context.github.sha };
              }
              : { revision: rawNode<string>("github.sha") },
            secrets: callbacks
              ? ({ secrets }) => {
                record("call-secrets");
                return { token: secrets.TOKEN };
              }
              : { token: rawNode<string>("secrets.TOKEN") },
          }))
      .job(
        "raw",
        ({ job }) =>
          job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
            with: callbacks
              ? (context) => {
                record("raw-with");
                assertEquals("secrets" in context, false);
                return { revision: context.github.sha };
              }
              : { revision: rawNode<string>("github.sha") },
            secrets: callbacks
              ? ({ secrets }) => {
                record("raw-secrets");
                return { token: secrets.TOKEN };
              }
              : { token: rawNode<string>("secrets.TOKEN") },
          }),
      );
    return lowerProject(
      defineProject({
        workflows: [workflow, callee],
        actions: [composite],
        localTaskPrepareAction: "./actions/task-prepare",
      }),
      "./workflows.ts",
    );
  };
  const dynamic = build(true);
  const fixed = build(false);
  assertEquals(
    dynamic.workflows.map(({ workflow }) => emitWorkflow(workflow)),
    fixed.workflows.map(({ workflow }) => emitWorkflow(workflow)),
  );
  assertEquals(
    dynamic.actions.map(({ steps }) => steps),
    fixed.actions.map(({ steps }) => steps),
  );
  assertEquals(
    dynamic.tasks.map(({ task }) => task.inputs),
    fixed.tasks.map(({ task }) => task.inputs),
  );
  assertEquals(
    [...counts].sort(),
    [
      "composite-env",
      "composite-inputs",
      "composite-task-env",
      "job-env",
      "defaults",
      "concurrency",
      "uses-env",
      "run-env",
      "task-inputs",
      "task-env",
      "reusable-concurrency",
      "call-with",
      "call-secrets",
      "raw-with",
      "raw-secrets",
    ].sort().map((name) => [name, 1]),
  );
});

Deno.test("removed value and args callbacks fail without executing their bodies", () => {
  defineWorkflow(".github/workflows/invalid.yml", { on: { push: {} } }).job(
    "check",
    ({ job }) => {
      const start = job.runsOn("ubuntu-latest");
      const old = () => {
        throw new Error("Removed callback executed");
      };
      assertThrows(
        () => start.env({ VALUE: old } as never),
        TypeError,
        "complete map",
      );
      assertThrows(
        () => start.defaultsRun({ shell: old } as never),
        TypeError,
        "complete map",
      );
      assertThrows(
        () =>
          start.concurrency({ group: old, cancelInProgress: false } as never),
        TypeError,
        "complete map",
      );
      assertThrows(
        () =>
          start.task(
            {
              name: "Old",
              inputs: { value: { contract: textValue(), from: old } },
              outputs: {},
              run: () => {},
            } as never,
          ),
        TypeError,
        "inputs map callback",
      );
      assertThrows(
        () => job.reusable().rawCall("./callee.yml", old as never),
        TypeError,
        "separate with and secrets",
      );
      return start.run({ name: "End", run: "true" });
    },
  );
});

Deno.test("mismatched callback results preserve contextual typing in diagnostics", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "tsugiori-callback-diagnostics-",
  });
  try {
    const source = `import { defineWorkflow, textValue } from ${
      JSON.stringify(
        new URL("../src/github_actions/mod.ts", import.meta.url).href,
      )
    };
const callee = defineWorkflow("callee.yml", { on: { workflow_call: { inputs: { value: { type: "boolean", required: true } } } } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({name: "Build", run: "true"}));
defineWorkflow("caller.yml", { on: { push: {} } }).job("build", ({ job }) => {
  job.reusable().call("./callee.yml", callee, { with: ({ github }) => ({value: github.sha}) });
  job.reusable().call("./callee.yml", callee, { with: ({ github }) => ({value: true, unknown: github.sha}) });
  job.reusable().rawCall("./callee.yml", { with: ({ github }) => ({value: { bad: github.sha }}) });
  job.runsOn("ubuntu-latest").task({name: "Bad", inputs: ({ github }) => ({value: {contract: textValue(), from: 42}}), outputs: {}, run: () => {}});
  return job.runsOn("ubuntu-latest").run({name:"End", run:"true"});
});`;
    const path = `${directory}/invalid.ts`;
    await Deno.writeTextFile(path, source);
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["check", "--no-config", path],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const diagnostics = new TextDecoder().decode(result.stderr);
    assertEquals(result.success, false);
    assertStringIncludes(diagnostics, "TS2322");
    assertEquals(diagnostics.includes("TS7031"), false, diagnostics);
    assertEquals(diagnostics.includes("TS7006"), false, diagnostics);
    assertEquals(
      (diagnostics.match(/\[ERROR\]/g) ?? []).length,
      4,
      diagnostics,
    );
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
