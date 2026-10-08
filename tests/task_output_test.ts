import { assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "node:path";
import { textValue } from "../src/task/mod.ts";

Deno.test("shared run can be spread with distinct output declarations", () => {
  const run = async () => {};
  const first = {
    outputs: { first: { contract: textValue(), required: true } },
    run,
  };
  const second = {
    outputs: { second: { contract: textValue(), required: false } },
    run,
  };
  assertEquals(Object.keys(first.outputs), ["first"]);
  assertEquals(Object.keys(second.outputs), ["second"]);
});

Deno.test("task output writer writes declared multiline values and permits omitted outputs", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const output = resolve(directory, "github-output");
    await Deno.writeTextFile(output, "");
    const core = new URL("../src/github_actions/mod.ts", import.meta.url)
      .href;
    const runner = new URL("../src/runner/main.ts", import.meta.url).href;
    const program =
      `import {textValue, project as makeProject, workflow} from ${
        JSON.stringify(core)
      };
import {runProject} from ${JSON.stringify(runner)};
Deno.exitCode = await runProject({project: makeProject({workflows:[workflow(".github/workflows/ci.yml", {on: { push: {  } },}).job("test", ({job}) => job.runsOn("ubuntu-latest").task({id:"task",name:"Task",inputs:{},outputs:{written:{required:true},omitted:{required:false}},run: async ({outputs}) => {await outputs.set("written","first\\nsecond");}}))]}),entrypointUrl:import.meta.url},[".github/workflows/ci.yml/test/task"]);`;
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["eval", program],
      env: { ...Deno.env.toObject(), GITHUB_OUTPUT: output },
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
    const value = await Deno.readTextFile(output);
    assertStringIncludes(value, "written<<tsugiori_");
    assertStringIncludes(value, "first\nsecond\n");
    assertEquals(value.includes("omitted<<"), false);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("runner rejects a required task output that was not set", async () => {
  const core = new URL("../src/github_actions/mod.ts", import.meta.url).href;
  const runner = new URL("../src/runner/main.ts", import.meta.url).href;
  const program = `import {textValue,project as makeProject,workflow} from ${
    JSON.stringify(core)
  };
import {runProject} from ${JSON.stringify(runner)};
Deno.exitCode=await runProject({project: makeProject({workflows:[workflow(".github/workflows/ci.yml", {on: { push: {  } },}).job("test",({job})=>job.runsOn("ubuntu-latest").task({name:"Task",inputs:{},outputs:{result:{required:true}},run:()=>{}}))]}),entrypointUrl:import.meta.url},[".github/workflows/ci.yml/test/task-1"]);`;
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", program],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(result.code, 1);
  assertStringIncludes(
    new TextDecoder().decode(result.stderr),
    "Required task output",
  );
});

Deno.test("runner keeps the empty task context when both contracts are omitted", async () => {
  const core = new URL("../src/github_actions/mod.ts", import.meta.url).href;
  const runner = new URL("../src/runner/main.ts", import.meta.url).href;
  const program = `import {project as makeProject,workflow} from ${
    JSON.stringify(core)
  };
import {runProject} from ${JSON.stringify(runner)};
const run = ({inputs, outputs}) => {
  if (Object.keys(inputs).length !== 0 || typeof outputs.set !== "function") throw new Error("Invalid empty context");
};
const project = makeProject({workflows:[workflow("ci.yml", {on:{push:{}}}).job("test", ({job}) => job.runsOn("ubuntu-latest").task({name:"Omitted",run}).task({name:"Explicit",inputs:{},outputs:{},run}))]});
for (const entry of ["ci.yml/test/task-1", "ci.yml/test/task-2"]) {
  if (await runProject({project,entrypointUrl:import.meta.url},[entry]) !== 0) Deno.exit(1);
}`;
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", program],
    env: { TSUGIORI_DIAGNOSTICS: "0" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
});
