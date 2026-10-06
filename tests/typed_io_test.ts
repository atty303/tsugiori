import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  defineProject,
  defineWorkflow,
  fromJSON,
  jsonValue,
  present,
  textValue,
} from "../src/github_actions/mod.ts";
import { parseWireValue, serializeValue } from "../src/task/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { resolve } from "node:path";

const names = jsonValue({
  parse(value: unknown): readonly string[] {
    if (
      !Array.isArray(value) || !value.every((item) => typeof item === "string")
    ) {
      throw new TypeError("Expected an array of names.");
    }
    return value;
  },
});

Deno.test("text and JSON contracts preserve wire values and reserve absence", () => {
  assertEquals(serializeValue(names, ["dev", "stg"]), '["dev","stg"]');
  assertEquals(parseWireValue(names, "[]"), []);
  assertEquals(parseWireValue(names, ""), null);
  assertEquals(parseWireValue(textValue(), ""), null);
  assertThrows(() => serializeValue(textValue(), ""), TypeError);
  assertThrows(() => serializeValue(names, null as never), TypeError);
  assertThrows(() => parseWireValue(names, "null"), TypeError);
  assertThrows(
    () => jsonValue({ parse: () => ["changed"] }).parse(["original"]),
    TypeError,
  );
  assertThrows(
    () =>
      serializeValue(jsonValue({ parse: (value) => value }), {
        lost: undefined,
      }),
    TypeError,
  );
});

Deno.test("typed detect to matrix to task input lowers to ordinary Actions steps", async () => {
  const first = defineWorkflow(".github/workflows/deploy.yml", {
    on: { push: {} },
  }).job("detect", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "find",
        name: "Find",
        inputs: {},
        outputs: { targets: { contract: names, required: false } },
        run: async ({ outputs }) => {
          await outputs.set("targets", ["dev"]);
        },
      })
      .outputs(({ steps }) => ({ targets: steps.find.outputs.targets })));

  const complete = first.job(
    "deploy",
    ({ job, jobs }) =>
      job.needs(jobs.detect).runsOn("ubuntu-latest")
        .when(({ needs }) => present(needs.detect.outputs.targets))
        .strategy(({ needs }) => ({
          matrix: { target: fromJSON(needs.detect.outputs.targets) },
        }))
        .task({
          name: "Deploy",
          outputs: {},
          inputs: {
            targets: {
              contract: names,
              from: ({ needs }) => needs.detect.outputs.targets,
            },
          },
          env: { REGION: "ap-northeast-1" },
          run: ({ inputs }) => {
            assertEquals(inputs.targets, ["dev"]);
          },
        }),
  );

  const lowered = await lowerProject(
    defineProject({ workflows: [complete] }),
    "./tsugiori.ts",
  );
  const yaml = emitWorkflow(lowered.workflows[0].workflow);
  assertStringIncludes(yaml, "fromJSON(needs.detect.outputs.targets)");
  assertStringIncludes(yaml, "needs.detect.outputs.targets != ''");
  assertStringIncludes(
    yaml,
    'TSUGIORI_INPUT_TARGETS: "${{ needs.detect.outputs.targets }}"',
  );
  assertStringIncludes(yaml, "REGION: ap-northeast-1");
  assertEquals(lowered.tasks.length, 2);
});

Deno.test("typed input requires the source contract object and rejects env collision", () => {
  const other = jsonValue({ parse: names.parse });
  const first = defineWorkflow(".github/workflows/check.yml", {
    on: { push: {} },
  }).job("source", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "produce",
        name: "Produce",
        inputs: {},
        outputs: { result: { contract: names, required: true } },
        run: async ({ outputs }) => {
          await outputs.set("result", []);
        },
      })
      .outputs(({ steps }) => ({ result: steps.produce.outputs.result })));
  assertThrows(
    () =>
      first.job(
        "bad",
        ({ job, jobs }) =>
          job.needs(jobs.source).runsOn("ubuntu-latest").task({
            name: "Bad",
            outputs: {},
            inputs: {
              result: {
                contract: other,
                from: ({ needs }) => needs.source.outputs.result,
              },
            },
            run: () => {},
          }),
      ),
    TypeError,
    "different contract object",
  );
  assertThrows(
    () =>
      first.job(
        "collision",
        ({ job, jobs }) =>
          job.needs(jobs.source).runsOn("ubuntu-latest").task({
            name: "Collision",
            outputs: {},
            inputs: {
              result: {
                contract: names,
                from: ({ needs }) => needs.source.outputs.result,
              },
            },
            env: { TSUGIORI_INPUT_RESULT: "other" },
            run: () => {},
          }),
      ),
    TypeError,
    "conflicts with env",
  );
  assertThrows(
    () =>
      first.job(
        "case-collision",
        ({ job, jobs }) =>
          job.needs(jobs.source).runsOn("ubuntu-latest").task({
            name: "Collision",
            outputs: {},
            inputs: {
              foo: {
                contract: names,
                from: ({ needs }) => needs.source.outputs.result,
              },
              FOO: {
                contract: names,
                from: ({ needs }) => needs.source.outputs.result,
              },
            },
            run: () => {},
          }),
      ),
    TypeError,
    "conflicts with env",
  );
});

Deno.test("typed contracts follow bracket-rendered job and step references", () => {
  const other = jsonValue({ parse: names.parse });
  const first = defineWorkflow(".github/workflows/check.yml", {
    on: { push: {} },
  }).job("source-job", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .task({
        id: "produce-step",
        name: "Produce",
        inputs: {},
        outputs: { "result-list": { contract: names, required: true } },
        run: async ({ outputs }) => {
          await outputs.set("result-list", []);
        },
      })
      .outputs(({ steps }) => ({
        "result-list": steps["produce-step"].outputs["result-list"],
      })));
  assertThrows(
    () =>
      first.job(
        "consumer",
        ({ job, jobs }) =>
          job.needs(jobs["source-job"]).runsOn("ubuntu-latest").task({
            name: "Consume",
            inputs: {
              result: {
                contract: other,
                from: ({ needs }) => needs["source-job"].outputs["result-list"],
              },
            },
            outputs: {},
            run: () => {},
          }),
      ),
    TypeError,
    "different contract object",
  );
});

Deno.test("computed job outputs do not retain task contracts", () => {
  const other = jsonValue({ parse: names.parse });
  const first = defineWorkflow(".github/workflows/computed.yml", {
    on: { push: {} },
  }).job("source", ({ job }) =>
    job.runsOn("ubuntu-latest").task({
      id: "produce",
      name: "Produce",
      inputs: {},
      outputs: { result: { contract: names, required: false } },
      run: () => {},
    }).outputs(({ steps }) => ({
      result: steps.produce.outputs.result.or("[]"),
    })));
  first.job(
    "consumer",
    ({ job, jobs }) =>
      job.needs(jobs.source).runsOn("ubuntu-latest")
        .task({
          name: "Consume",
          outputs: {},
          inputs: {
            result: {
              contract: other,
              from: ({ needs }) => needs.source.outputs.result,
            },
          },
          run: () => {},
        }),
  );
});

Deno.test("runner passes null for an omitted optional typed source", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const resultPath = resolve(directory, "parsed.json");
    const core = new URL("../src/github_actions/mod.ts", import.meta.url)
      .href;
    const runner = new URL("../src/runner/main.ts", import.meta.url).href;
    const program = `import {defineProject,defineWorkflow,jsonValue} from ${
      JSON.stringify(core)
    };
import {runProject} from ${JSON.stringify(runner)};
const contract=jsonValue({parse(value){if(!Array.isArray(value))throw new TypeError();return value;}});
const first=defineWorkflow(".github/workflows/ci.yml", {on: { push: {  } },}).job("source",({job})=>job.runsOn("ubuntu-latest").task({id:"emit",name:"Emit",inputs:{},outputs:{targets:{contract,required:false}},run:()=>{}}).outputs(({steps})=>({targets:steps.emit.outputs.targets})));
const project=defineProject({workflows:[first.job("consumer",({job,jobs})=>job.needs(jobs.source).runsOn("ubuntu-latest").task({name:"Consume",inputs:{targets:{contract,from:({needs})=>needs.source.outputs.targets}},outputs:{},run:async({inputs})=>{await Deno.writeTextFile(${
      JSON.stringify(resultPath)
    },JSON.stringify(inputs.targets));}}))]});
Deno.exitCode=await runProject({project,entrypointUrl:import.meta.url},[".github/workflows/ci.yml/consumer/task-1"]);`;
    const result = await new Deno.Command(Deno.execPath(), {
      args: ["eval", program],
      env: { ...Deno.env.toObject(), TSUGIORI_INPUT_TARGETS: "" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
    assertEquals(await Deno.readTextFile(resultPath), "null");
    for (
      const producerOption of [
        'if:rawNode("false"),',
        "continueOnError:true,",
      ]
    ) {
      const skippable = program
        .replace(
          "defineWorkflow,jsonValue}",
          "defineWorkflow,jsonValue,rawNode}",
        )
        .replace('name:"Emit",inputs:', `name:"Emit",${producerOption}inputs:`)
        .replace("required:false", "required:true");
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["eval", skippable],
        env: { ...Deno.env.toObject(), TSUGIORI_INPUT_TARGETS: "" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
      assertEquals(await Deno.readTextFile(resultPath), "null");
    }
    const withPresent = program.replace(
      "defineWorkflow,jsonValue}",
      "defineWorkflow,jsonValue,present}",
    );
    const guardedPrograms = [
      withPresent.replace(
        'job.needs(jobs.source).runsOn("ubuntu-latest").task(',
        'job.needs(jobs.source).runsOn("ubuntu-latest").when(({needs})=>present(needs.source.outputs.targets)).task(',
      ),
      withPresent.replace(
        'task({name:"Consume",inputs:',
        'task({name:"Consume",if:({needs})=>present(needs.source.outputs.targets),inputs:',
      ),
    ];
    for (const guardedProgram of guardedPrograms) {
      const guarded = await new Deno.Command(Deno.execPath(), {
        args: ["eval", guardedProgram],
        env: { ...Deno.env.toObject(), TSUGIORI_INPUT_TARGETS: "" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(guarded.code, 1);
      assertStringIncludes(
        new TextDecoder().decode(guarded.stderr),
        "is absent",
      );
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("runner parses JSON input and rejects absent or invalid wire values", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const resultPath = resolve(directory, "parsed.json");
    const core = new URL("../src/github_actions/mod.ts", import.meta.url)
      .href;
    const runner = new URL("../src/runner/main.ts", import.meta.url).href;
    const program =
      `import {defineProject,defineWorkflow,jsonValue,rawNode} from ${
        JSON.stringify(core)
      };
import {runProject} from ${JSON.stringify(runner)};
const contract=jsonValue({parse(value){if(!Array.isArray(value)||!value.every(item=>typeof item==="string"))throw new TypeError("invalid names");return value;}});
const project=defineProject({workflows:[defineWorkflow(".github/workflows/ci.yml", {on: { push: {  } },}).job("consumer",({job})=>job.runsOn("ubuntu-latest").task({name:"Consume",inputs:{targets:{contract,from:rawNode("matrix.targets")}},outputs:{},run:async({inputs})=>{await Deno.writeTextFile(${
        JSON.stringify(resultPath)
      },JSON.stringify(inputs.targets));}}))]});
Deno.exitCode=await runProject({project,entrypointUrl:import.meta.url},[".github/workflows/ci.yml/consumer/task-1"]);`;
    for (
      const [wire, expectedCode] of [["[]", 0], ["", 1], ["null", 1], [
        "{}",
        1,
      ]] as const
    ) {
      const result = await new Deno.Command(Deno.execPath(), {
        args: ["eval", program],
        env: { ...Deno.env.toObject(), TSUGIORI_INPUT_TARGETS: wire },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(result.code, expectedCode);
      if (expectedCode === 0) {
        assertEquals(await Deno.readTextFile(resultPath), "[]");
      }
    }
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});
