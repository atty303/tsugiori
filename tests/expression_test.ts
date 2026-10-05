import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  always,
  cancelled,
  caseOf,
  contains,
  definePipeline,
  defineTsugiori,
  endsWith,
  failure,
  format,
  fromJSON,
  hashFiles,
  join,
  rawNode,
  startsWith,
  success,
  toJSON,
} from "@atty303/tsugiori/github-actions";
import { lowerConfig } from "../packages/compiler/src/authoring.ts";
import { emitWorkflow } from "../packages/compiler/src/github_actions/emitter.ts";
import { parse } from "../packages/core/src/deps.ts";
import { emitExpression } from "../packages/core/src/github_actions/expression.ts";

Deno.test("typed expressions compose across job and step fields", async () => {
  const action = {
    name: "Action",
    description: "Action metadata",
    uses: "example/action@sha",
    inputs: { value: { description: "Input", required: true } },
    outputs: { "result": { description: "Output" } },
  } as const;
  const first = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
    secrets: ["token"],
  })
    .job("prepare", ({ job }) => {
      const source = job.runsOn("ubuntu-latest").run({
        id: "source",
        outputs: ["matrix"],
        name: "Source",
        run: "echo 'matrix=[\"dev\"]' >> $GITHUB_OUTPUT",
      });
      assertEquals(
        source.steps.source.outputs.matrix,
        "${{ steps.source.outputs.matrix }}",
      );
      return source.outputs(({ steps }) => ({
        matrix: steps.source.outputs.matrix,
      }));
    });
  const config = defineTsugiori({
    pipelines: [
      first.job(
        "deploy",
        ({ job, jobs }) =>
          job.needs(jobs.prepare).runsOn("ubuntu-latest")
            .when(({ needs }) => contains(needs.prepare.outputs.matrix, "dev"))
            .strategy(({ needs }) => ({
              matrix: {
                stage: fromJSON(needs.prepare.outputs.matrix).as<
                  readonly string[]
                >(),
              },
            }))
            .concurrency({
              group: ({ matrix }) => format("deploy-{0}", matrix.stage),
              cancelInProgress: false,
            })
            .uses(action, {
              id: "run",
              name: "Run",
              env: {
                STAGE: ({ matrix }) => matrix.stage,
                TOKEN: ({ secrets }) => secrets.token,
              },
              with: ({ matrix }) => ({ value: matrix.stage }),
            })
            .run({
              name: "Check",
              run: "true",
              if: ({ steps }) =>
                steps.run.outputs.result.eq("ok").and(
                  rawNode<boolean>("custom()"),
                ),
            })
            .outputs(({ steps }) => ({
              result: caseOf(
                steps.run.outputs.result.eq("ok"),
                steps.run.outputs.result,
                "other",
              ),
            })),
      ),
    ],
  });
  const lowered = await lowerConfig(config, "./tsugiori.ts");
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertStringIncludes(yaml, "contains(needs.prepare.outputs.matrix, 'dev')");
  assertStringIncludes(yaml, "fromJSON(needs.prepare.outputs.matrix)");
  assertStringIncludes(yaml, "format('deploy-{0}', matrix.stage)");
  assertStringIncludes(
    yaml,
    "(steps.run.outputs.result == 'ok') && custom()",
  );
  assertStringIncludes(
    yaml,
    "case((steps.run.outputs.result == 'ok'), steps.run.outputs.result, 'other')",
  );
  assertStringIncludes(yaml, 'value: "${{ matrix.stage }}"');
  assertStringIncludes(yaml, 'STAGE: "${{ matrix.stage }}"');
  assertStringIncludes(yaml, 'TOKEN: "${{ secrets.token }}"');
  const parsed = parse(yaml) as { jobs: { deploy: { if: string } } };
  assertEquals(
    parsed.jobs.deploy.if,
    "${{ contains(needs.prepare.outputs.matrix, 'dev') }}",
  );
  assertEquals(lowered.pipelines[0].workflow.jobs[1].needs, ["prepare"]);
});

Deno.test("expression nodes cannot be interpolated as host strings", () => {
  assertThrows(() => `${rawNode<string>("github.ref")}`, TypeError);
});

Deno.test("a step ID colliding with an expression method is addressable", async () => {
  const config = defineTsugiori({
    pipelines: [
      definePipeline("ci", {
        output: ".github/workflows/ci.yml",
        on: { push: {} },
      }).job("test", ({ job }) =>
        job.runsOn("ubuntu-latest")
          .run({ id: "eq", name: "Produce", run: "true", outputs: ["result"] })
          .outputs(({ steps }) => ({
            result: steps.at("eq").at("outputs").at("result"),
          }))),
    ],
  });
  const lowered = await lowerConfig(config, "./tsugiori.ts");
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertStringIncludes(yaml, "steps.eq.outputs.result");
});

Deno.test("operators and built-ins retain GitHub expression syntax", () => {
  const value = rawNode<string>("github.ref");
  for (
    const [expression, syntax] of [
      [value.eq("It's"), "== 'It''s'"],
      [value.ne(""), "!= ''"],
      [value.lt("x"), "< 'x'"],
      [value.le("x"), "<= 'x'"],
      [value.gt("x"), "> 'x'"],
      [value.ge("x"), ">= 'x'"],
      [value.eq("x").or(value.eq("y")), "||"],
      [value.eq("x").not(), "!"],
    ] as const
  ) assertStringIncludes(emitExpression(expression), syntax);
  assertEquals(emitExpression(value), "${{ github.ref }}");
  assertEquals(
    emitExpression(
      rawNode<readonly { name: string }[]>("github.event.labels").filter(
        "name",
      ),
    ),
    "${{ github.event.labels.*.name }}",
  );
  assertEquals(
    emitExpression(rawNode<readonly string[]>("matrix.stage").at(0)),
    "${{ matrix.stage[0] }}",
  );
  for (
    const [expression, syntax] of [
      [contains(value, "main"), "contains(github.ref, 'main')"],
      [startsWith(value, "refs/"), "startsWith(github.ref, 'refs/')"],
      [endsWith(value, "main"), "endsWith(github.ref, 'main')"],
      [format("{0}", value), "format('{0}', github.ref)"],
      [join(value, ","), "join(github.ref, ',')"],
      [toJSON(value), "toJSON(github.ref)"],
      [fromJSON(value), "fromJSON(github.ref)"],
      [hashFiles("**/*.ts"), "hashFiles('**/*.ts')"],
      [
        caseOf(value.eq("x"), "yes", "no"),
        "case((github.ref == 'x'), 'yes', 'no')",
      ],
      [always(), "always()"],
      [cancelled(), "cancelled()"],
      [success(), "success()"],
      [failure(), "failure()"],
    ] as const
  ) assertStringIncludes(emitExpression(expression), syntax);
});

Deno.test("a complete matrix can come from one typed expression", async () => {
  const config = defineTsugiori({
    pipelines: [
      definePipeline("ci", {
        output: ".github/workflows/ci.yml",
        on: { push: {} },
      }).job("test", ({ job }) =>
        job.runsOn("ubuntu-latest")
          .strategy(() => ({
            matrix: fromJSON('[{"stage":"dev"}]').as<{ stage: string }>(),
          }))
          .run({ name: "Test", run: "true" })),
    ],
  });
  const lowered = await lowerConfig(config, "./tsugiori.ts");
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertStringIncludes(
    yaml,
    'matrix: "${{ fromJSON(\'[{\\"stage\\":\\"dev\\"}]\') }}"',
  );
  const parsed = parse(yaml) as {
    jobs: { test: { strategy: { matrix: string } } };
  };
  assertEquals(
    parsed.jobs.test.strategy.matrix,
    '${{ fromJSON(\'[{"stage":"dev"}]\') }}',
  );
});
