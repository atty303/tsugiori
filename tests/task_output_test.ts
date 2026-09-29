import { assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "node:path";
import { textValue } from "../packages/core/src/task/mod.ts";

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
    const core =
      new URL("../packages/core/src/github_actions/mod.ts", import.meta.url)
        .href;
    const runner =
      new URL("../packages/runner/src/main.ts", import.meta.url).href;
    const program = `import {textValue, defineTsugiori, pipeline} from ${
      JSON.stringify(core)
    };
import {runTsugiori} from ${JSON.stringify(runner)};
const config = defineTsugiori({pipelines:[pipeline("ci", {output:".github/workflows/ci.yml",events:["push"]}).job("test", ({job}) => job.runsOn("ubuntu-latest").task({id:"task",name:"Task",inputs:{},outputs:{written:{contract:textValue(),required:true},omitted:{contract:textValue(),required:false}},run: async ({outputs}) => {await outputs.set("written","first\\nsecond");}}))]});
Deno.exitCode = await runTsugiori({config,configUrl:import.meta.url,root:import.meta.url},["ci/test/task-1"]);`;
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
  const core =
    new URL("../packages/core/src/github_actions/mod.ts", import.meta.url).href;
  const runner =
    new URL("../packages/runner/src/main.ts", import.meta.url).href;
  const program = `import {textValue,defineTsugiori,pipeline} from ${
    JSON.stringify(core)
  };
import {runTsugiori} from ${JSON.stringify(runner)};
const config=defineTsugiori({pipelines:[pipeline("ci",{output:".github/workflows/ci.yml",events:["push"]}).job("test",({job})=>job.runsOn("ubuntu-latest").task({name:"Task",inputs:{},outputs:{result:{contract:textValue(),required:true}},run:()=>{}}))]});
Deno.exitCode=await runTsugiori({config,configUrl:import.meta.url,root:import.meta.url},["ci/test/task-1"]);`;
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
