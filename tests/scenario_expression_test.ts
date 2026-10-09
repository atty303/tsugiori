import { checkedScenario as scenario } from "./scenario_checks.ts";
import { project } from "../src/github_actions/mod.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import {
  fromJSON,
  literal,
  rawExpression,
  toJSON,
  workflow,
} from "../src/github_actions.ts";
import { githubActionsSpec } from "../src/github_actions/github_spec.ts";
import {
  evaluateExpression,
  MissingContextError,
  MissingHashFilesError,
} from "../src/testing/expression.ts";

const status = { success: true, failure: false, cancelled: false };
const context = {
  github: { ref: "main", event: { labels: [{ name: "bug" }] } },
  matrix: { key: "ref" },
  env: {},
  vars: {},
};
const evaluate = (source: string) =>
  evaluateExpression(`\${{ ${source} }}`, context, status);

// Expectations follow the fixed expression article and pinned runner SDK, not
// JavaScript's built-in conversion, indexing, formatting or equality rules.
Deno.test("native scalar expressions preserve literals, precedence, coercion and lazy evaluation", () => {
  const cases: readonly (readonly [string, unknown])[] = [
    ["0xff", 255],
    ["0xffffffff", -1],
    ["0o10", 8],
    ["-2.99e-2", -0.0299],
    [".5", 0.5],
    ["'It''s open source!'", "It's open source!"],
    ["1 == 2 < 3", true],
    ["'B' > 'a'", true],
    ["'ß' == 'ss'", false],
    ["'2' > '10'", true],
    ["null == 0", true],
    ["false == ''", true],
    ["' 2 ' == 2", true],
    ["'0xff' == 255", true],
    ["'0b10' == 2", false],
    ["fromJSON('[]') == 0", false],
    ["github.event == github.event", true],
    ["fromJSON('[]') == fromJSON('[]')", false],
    ["!NaN", true],
    ["NaN <= 0", false],
    ["true || hashFiles('file')", true],
    ["false && vars.MISSING", false],
    ["contains(null, 'null')", false],
    ["startsWith(null, 'n')", false],
    ["endsWith(null, '')", true],
    ["contains(fromJSON('{}'), 'Object')", false],
    ["contains(fromJSON('[]'), vars.MISSING)", false],
    ["contains(fromJSON('[true]'), 1)", true],
    ["contains('HELLO', 'ell')", true],
    ["join(fromJSON('[null,true,{},[]]'), '|')", "|true|Object|Array"],
    ["join(fromJSON('{}'))", ""],
    ["join(fromJSON('[1]'), vars.MISSING)", "1"],
    ["format('{{{0}}}', null)", "{}"],
    ["format('{0}', 'used', vars.MISSING)", "used"],
    ["format('{0:}', 22)", "22"],
    ["case(false, vars.MISSING, true, 'selected', vars.MISSING)", "selected"],
    ["success() && !failure() && !cancelled() && always()", true],
  ];
  for (const [source, expected] of cases) {
    assertEquals(evaluate(source), expected, source);
  }
  for (
    const source of [
      "contains('x')",
      "always(false)",
      "format('{1}', 'x')",
      "format('{x}', 0)",
      "format('}', 0)",
      "fromJSON('not-json')",
      "case(true, 1, false, 2)",
    ]
  ) {
    assertThrows(() => evaluate(source), Error, undefined, source);
  }
});

Deno.test("native dereferences and filtered arrays distinguish known absence from incomplete fixtures", () => {
  const cases: readonly (readonly [string, unknown])[] = [
    ["github[matrix.key]", "main"],
    ["github.event.labels[9]", null],
    ["GITHUB.EVENT.labels[0].NAME", "bug"],
    ["fromJSON('{\"Version\":22}').version", 22],
    ["(fromJSON('[10,20]'))[1.9]", 20],
    ["fromJSON('[10]')[-1]", null],
    ["fromJSON('{\"x\":1}').missing", null],
    ["null.x", null],
    ["fromJSON('null')[fromJSON('bad')]", null],
    ["github.ref[vars.MISSING]", null],
    ["false[hashFiles('unused')]", null],
    ["null.*.missing", []],
    ['fromJSON(\'[{"name":"a"},{"other":1},{"name":"b"}]\').*.name', [
      "a",
      "b",
    ]],
    ['fromJSON(\'[{"x":[{"v":1},{"v":2}]},{"x":[{"v":3}]}]\').*.x.*.v', [
      1,
      2,
      3,
    ]],
    ['fromJSON(\'{"a":{"x":[1,2]},"b":{"x":[3]}}\').*.x', [[1, 2], [3]]],
    [
      "toJSON(fromJSON('{\"x\":[1,true,null]}'))",
      '{\n  "x": [\n    1,\n    true,\n    null\n  ]\n}',
    ],
  ];
  for (const [source, expected] of cases) {
    assertEquals(evaluate(source), expected, source);
  }
  for (
    const source of ["github.missing", "github.event.missing", "vars.MISSING"]
  ) assertThrows(() => evaluate(source), MissingContextError);
  assertThrows(() => evaluate("hashFiles('file')"), MissingHashFilesError);
  assertEquals(
    evaluateExpression("a${{ '}}' }}${{ 'x' }}z", context, status),
    "a}}xz",
  );
  assertEquals(evaluateExpression("${{ '${{' }}", context, status), "${{");
});

Deno.test("public DSL dereferences parsed values and native strategy, while quoted status names retain the success gate", async () => {
  const flow = workflow("expressions.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").strategy({
        matrix: { n: [1, 2] },
        maxParallel: 2,
        failFast: false,
      })
        .run({
          id: "read",
          name: "read",
          run: "true",
          if: rawExpression("fromJSON('null')[fromJSON('bad')] == null"),
          env: ({ strategy }) => ({
            VALUE: toJSON(
              fromJSON(literal('{"version":22}')).as<{ version: number }>().at(
                "version",
              ),
            ),
            INDEX: toJSON(strategy["job-index"]),
            TOTAL: toJSON(strategy["job-total"]),
            MAX: toJSON(strategy["max-parallel"]),
            FAIL: toJSON(strategy["fail-fast"]),
          }),
        })
        .run({
          id: "null",
          name: "null",
          run: "true",
          if: rawExpression("contains(null, 'null')"),
        })
        .run({ id: "failed", name: "failed", run: "false" })
        .run({
          id: "quoted",
          name: "quoted",
          run: "true",
          if: rawExpression("contains('failure()', 'failure')"),
        })
        .run({
          id: "recover",
          name: "recover",
          run: "true",
          if: rawExpression("failure()"),
        }),
  );
  const lowered =
    lowerProject(project({ workflows: [flow] }), "./workflows.ts").workflows[0]
      .workflow;
  const env = parse(emitWorkflow(lowered)).jobs.test!.steps[0].env;
  for (
    const [name, key] of [["INDEX", "job-index"], ["TOTAL", "job-total"], [
      "MAX",
      "max-parallel",
    ], ["FAIL", "fail-fast"]]
  ) {
    assertEquals(env[name], `\${{ toJSON(strategy.${key}) }}`);
    const row = githubActionsSpec.coverage.find((row) =>
      row.domain === "context" && row.key === `strategy.${key}`
    )!;
    assertEquals(
      row.status,
      "implemented",
    );
  }
  assertEquals(env.VALUE, `\${{ toJSON(fromJSON('{"version":22}').version) }}`);
  const result = await scenario(flow, (test, check) => {
    test.github({ event_name: "push" });
    test.job("test", (job) => {
      job.eachMatrix(({ n }, instance) =>
        instance.step("read").fixture(({ env }) => {
          assertEquals(env, {
            VALUE: "22",
            INDEX: String(n - 1),
            TOTAL: "2",
            MAX: "2",
            FAIL: "false",
          });
          return {};
        })
      );
      job.step("null");
      job.step("failed").fixture({ outcome: "failure" });
      job.step("quoted");
      job.step("recover").fixture({});

      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["null"]!.outcome !== "skipped", false);
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["quoted"]!.outcome !== "skipped", false);
        }
      });
      check((r) => {
        for (const i0 of r.jobs["test"]!.instances) {
          assertEquals(i0.steps["recover"]!.outcome !== "skipped", true);
        }
      });
    });
  });
  assertEquals(result.result, "failure");
  const missing = workflow("strict.yml", {
    on: { push: {} },
    vars: ["UNOBSERVED"],
  }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read",
        run: "true",
        env: ({ vars }) => ({ VALUE: vars.UNOBSERVED }),
      }),
  );
  const error = await assertRejects(() =>
    scenario(missing, (t, _check) => {
      t.github({ event_name: "push" });
      t.vars({});
      t.job("test", (j) => j.step("read").fixture({}));
    })
  );
  assertEquals((error as { kind: string }).kind, "fixture_missing");
});
