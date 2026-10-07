import { assertInlineSnapshot } from "@std/testing/unstable-snapshot";
import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  defineCompositeAction,
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
  assertEquals(serializeValue(textValue(), "  "), "  ");
  assertEquals(parseWireValue(textValue(), "  "), "  ");
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

Deno.test("hyphenated step and needs references retain JSON contracts and presence proofs", async () => {
  const producer = defineWorkflow("ci.yml", { on: { push: {} } })
    .job("detect-targets", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .task({
          id: "find-targets",
          name: "Find",
          outputs: { "target-names": { contract: names, required: false } },
          run: () => {},
        })
        .task({
          id: "inspect-targets",
          name: "Inspect",
          if: ({ steps }) =>
            present(steps["find-targets"].outputs["target-names"]),
          inputs: ({ steps }) => ({
            targets: {
              contract: names,
              from: steps["find-targets"].outputs["target-names"],
            },
          }),
          run: () => {},
        })
        .outputs(({ steps }) => ({
          "target-names": steps["find-targets"].outputs["target-names"],
        })));
  const workflow = producer.job(
    "deploy",
    ({ job, jobs }) =>
      job.needs(jobs["detect-targets"]).runsOn("ubuntu-latest")
        .when(({ needs }) =>
          present(needs["detect-targets"].outputs["target-names"])
        )
        .strategy(({ needs }) => ({
          matrix: {
            target: fromJSON(needs["detect-targets"].outputs["target-names"]),
          },
        }))
        .run({ name: "Deploy", run: "true" }),
  );
  const lowered = await lowerProject(
    defineProject({
      workflows: [workflow],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "./tsugiori.ts",
    "fixture-source",
  );
  const yaml = emitWorkflow(lowered.workflows[0].workflow);
  assertStringIncludes(
    yaml,
    "target-names: ${{ steps.find-targets.outputs.target-names }}",
  );
  assertStringIncludes(
    yaml,
    "if: ${{ (steps.find-targets.outputs.target-names != '') }}",
  );
  assertStringIncludes(
    yaml,
    "target: ${{ fromJSON(needs.detect-targets.outputs.target-names) }}",
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
          inputs: ({ needs }) => ({
            targets: {
              contract: names,
              from: needs.detect.outputs.targets,
            },
          }),
          env: { REGION: "ap-northeast-1" },
          run: ({ inputs }) => {
            assertEquals(inputs.targets, ["dev"]);
          },
        }),
  );

  const lowered = await lowerProject(
    defineProject({
      workflows: [complete],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "./tsugiori.ts",
    "fixture-source",
  );
  const yaml = emitWorkflow(lowered.workflows[0].workflow);
  assertInlineSnapshot(
    yaml,
    `name: .github/workflows/deploy.yml
on:
  push: {}
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      targets: \${{ steps.find.outputs.targets }}
    steps:
      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          entrypoint: ./tsugiori.ts
          project-directory: .
          source-key: fixture-source

      - name: Find
        id: find
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/deploy.yml/detect/task-1'"

  deploy:
    runs-on: ubuntu-latest
    needs:
      - detect
    if: \${{ (needs.detect.outputs.targets != '') }}
    strategy:
      matrix:
        target: \${{ fromJSON(needs.detect.outputs.targets) }}
    steps:
      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          entrypoint: ./tsugiori.ts
          project-directory: .
          source-key: fixture-source

      - name: Deploy
        env:
          REGION: ap-northeast-1
          TSUGIORI_INPUT_TARGETS: \${{ needs.detect.outputs.targets }}
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/deploy.yml/deploy/task-1'"
`,
    { serializer: (yaml) => yaml },
  );
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
            inputs: ({ needs }) => ({
              result: {
                contract: other,
                from: needs.source.outputs.result,
              },
            }),
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
            inputs: ({ needs }) => ({
              result: {
                contract: names,
                from: needs.source.outputs.result,
              },
            }),
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
            inputs: ({ needs }) => ({
              foo: {
                contract: names,
                from: needs.source.outputs.result,
              },
              FOO: {
                contract: names,
                from: needs.source.outputs.result,
              },
            }),
            run: () => {},
          }),
      ),
    TypeError,
    "conflicts with env",
  );
});

Deno.test("typed contracts follow hyphenated job and step references", () => {
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
            inputs: ({ needs }) => ({
              result: {
                contract: other,
                from: needs["source-job"].outputs["result-list"],
              },
            }),
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
          inputs: ({ needs }) => ({
            result: {
              contract: other,
              from: needs.source.outputs.result,
            },
          }),
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
const project=defineProject({workflows:[first.job("consumer",({job,jobs})=>job.needs(jobs.source).runsOn("ubuntu-latest").task({name:"Consume",inputs:({ needs }) => ({targets:{contract,from:needs.source.outputs.targets}}),outputs:{},run:async({inputs})=>{await Deno.writeTextFile(${
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

Deno.test("omitted task contracts lower identically to explicit empty contracts", () => {
  const run = () => {};
  const text = textValue();
  const projects = [false, true].map((explicit) =>
    defineProject({
      localTaskPrepareAction: "./actions/task-prepare",
      workflows: [
        defineWorkflow("optional.yml", { on: { push: {} } }).job(
          "test",
          ({ job }) =>
            job.runsOn("ubuntu-latest")
              .task({
                name: "Empty",
                ...(explicit ? { inputs: {}, outputs: {} } : {}),
                run,
              })
              .task({
                name: "Produce",
                ...(explicit ? { inputs: {} } : {}),
                outputs: { value: { contract: names, required: true } },
                run,
              })
              .task({
                name: "Consume",
                inputs: ({ github }) => ({
                  value: { contract: text, from: github.sha },
                }),
                ...(explicit ? { outputs: {} } : {}),
                run,
              }),
        ),
      ],
      actions: [
        defineCompositeAction("actions/optional/action.yml", {
          name: "Optional",
          description: "Optional contracts",
        }).steps(({ step }) =>
          step.task({
            name: "Empty",
            ...(explicit ? { inputs: {}, outputs: {} } : {}),
            run,
          })
            .task({
              name: "Produce",
              ...(explicit ? { inputs: {} } : {}),
              outputs: { value: { contract: names, required: true } },
              run,
            })
            .task({
              name: "Consume",
              inputs: ({ github }) => ({
                value: { contract: text, from: github.sha },
              }),
              ...(explicit ? { outputs: {} } : {}),
              run,
            })
            .outputs(() => ({}))
        ),
      ],
    })
  );
  const lowered = projects.map((project) =>
    lowerProject(project, "./tsugiori.ts", "fixture-source")
  );
  assertEquals(lowered[0], lowered[1]);
  assertEquals(lowered[0].tasks.length, 6);
});
