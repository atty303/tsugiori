import { assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "node:path";
import { defineTask } from "../packages/core/src/task/mod.ts";

Deno.test("defineTask keeps output declarations separate when reusing a function", () => {
  const run = async () => {};
  const first = defineTask({ outputs: ["first"], run });
  const second = defineTask({ outputs: ["second"], run });
  assertEquals(first.outputNames, ["first"]);
  assertEquals(second.outputNames, ["second"]);
  assertEquals(Object.hasOwn(run, "outputNames"), false);
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
    const program = `import {defineTask, defineTsugiori, pipeline} from ${
      JSON.stringify(core)
    };
import {runTsugiori} from ${JSON.stringify(runner)};
const task = defineTask({outputs:["written","omitted"], run: async ({outputs}) => {await outputs.set("written","first\\nsecond");}});
const config = defineTsugiori({pipelines:[pipeline("ci", {output:".github/workflows/ci.yml",events:["push"]}).job("test", ({job}) => job.runsOn("ubuntu-latest").task({id:"task",name:"Task",task}))]});
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
