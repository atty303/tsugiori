import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { parse } from "../src/deps.ts";
import { defineProject, defineWorkflow } from "../src/github_actions/mod.ts";
import { generateFiles } from "../src/compiler/generator.ts";

Deno.test("prepare Action installs the repository's verified toolchain and forwards inputs/output", async () => {
  const action = parse(
    await Deno.readTextFile("actions/task-prepare/action.yml"),
  ) as {
    inputs: Record<string, unknown>;
    outputs: Record<string, { value: string }>;
    runs: { using: string; steps: { env: Record<string, string> }[] };
  };
  const toolchain = await Deno.readTextFile("mise.toml");
  assertEquals(action.runs.using, "composite");
  const env = action.runs.steps[0].env;
  assertEquals(
    env.TSUGIORI_INSTALL_DENO_VERSION,
    toolchain.match(/^deno = "([^"]+)"$/m)?.[1],
  );
  for (const input of Object.keys(action.inputs)) {
    assert(Object.values(env).includes(`\${{ inputs.${input} }}`));
  }
  assertEquals(
    action.outputs["runtime-path"].value,
    "${{ steps.prepare.outputs.runtime-path }}",
  );
});

Deno.test("generation requires release identity for tasks, accepts explicit local Action, and leaves native-only jobs alone", async () => {
  const ci = defineWorkflow("ci.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        name: "Task",
        inputs: {},
        outputs: {},
        run: () => {},
      }),
  );
  await assertRejects(
    () =>
      generateFiles(
        defineProject({ workflows: [ci] }),
        "./workflows.ts",
        "source",
      ),
    Error,
    "localTaskPrepareAction",
  );
  const [file] = await generateFiles(
    defineProject({
      workingDirectory: "project",
      localTaskPrepareAction: "./actions/task-prepare",
      workflows: [ci],
    }),
    "./workflows.ts",
    "source",
  );
  assert(file.content.includes("uses: ./actions/task-prepare"));
  assert(file.content.includes("project-directory: project"));
  assert(!file.content.includes("deno_binary"));
  const native = defineWorkflow("ci.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" }),
  );
  assertEquals(
    (await generateFiles(
      defineProject({ workflows: [native] }),
      "./workflows.ts",
      "source",
    )).length,
    1,
  );
  for (
    const path of [
      "actions/prepare",
      "../prepare",
      "./../prepare",
      "./actions/../prepare",
      "./a@main",
      "./a\nrun: bad",
    ]
  ) {
    assertThrows(
      () => defineProject({ localTaskPrepareAction: path, workflows: [ci] }),
      TypeError,
    );
  }
});
