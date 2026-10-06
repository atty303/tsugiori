import { assertEquals, assertThrows } from "@std/assert";
import {
  type ActionContract,
  definePipeline,
  defineTsugiori,
  literal,
  toJSON,
} from "../src/github_actions/mod.ts";

const contract = {
  uses: "acme/publish/path@v4",
  name: "Publish",
  description: "Publish",
  inputs: {
    target: { description: "Target", required: true },
    mode: { description: "Mode", required: true, default: "" },
  },
  outputs: { url: { description: "URL" } },
} as const satisfies ActionContract;
function steps(options: unknown, action: ActionContract | string = contract) {
  const pipeline = definePipeline("ci", { output: "ci.yml", on: { push: {} } })
    .job(
      "publish",
      ({ job }) =>
        Reflect.apply(job.runsOn("ubuntu-latest").uses, null, [
          action,
          options,
        ]),
    );
  return defineTsugiori({ pipelines: [pipeline] }).pipelines[0].jobs[0].steps;
}
Deno.test("direct action contracts retain uses and leave defaults to GitHub", () => {
  assertEquals(steps({ with: { target: "web" } })[0], {
    type: "uses",
    uses: contract.uses,
    with: { target: "web" },
  });
  assertEquals(
    steps({
      uses: "./local/action",
      with: () => ({ target: literal("web") }),
    })[0],
    { type: "uses", uses: "./local/action", with: { target: "${{ 'web' }}" } },
  );
  assertEquals(
    steps({ with: { target: literal("a").eq("b").and("yes").or("no") } })[0]
      .type,
    "uses",
  );
  const defaults = {
    ...contract,
    inputs: { mode: { description: "Mode", required: true, default: false } },
  } as const;
  assertEquals(steps(undefined, defaults)[0], {
    type: "uses",
    uses: defaults.uses,
  });
  assertEquals(steps(undefined, "acme/noop@v1")[0], {
    type: "uses",
    uses: "acme/noop@v1",
  });
  assertEquals(
    steps({ with: { count: toJSON(literal(3)) } }, "acme/noop@v1")[0],
    { type: "uses", uses: "acme/noop@v1", with: { count: "${{ toJSON(3) }}" } },
  );
});
Deno.test("direct actions reject invalid values even when type checks are bypassed", () => {
  for (const options of [undefined, {}, { with: {} }]) {
    assertThrows(() => steps(options), TypeError, "Required action input");
  }
  for (
    const value of [
      true,
      3,
      Infinity,
      null,
      undefined,
      {},
      literal(true),
      literal(3),
      literal("a").eq("b"),
      literal(1).or("fallback"),
      literal(false).and("value"),
      literal("a").eq("b").or("value"),
    ]
  ) {
    for (const action of [contract, "acme/noop@v1"]) {
      assertThrows(
        () => steps({ with: { target: value } }, action),
        TypeError,
        "must be a string",
      );
    }
  }
  for (
    const withInputs of [{ target: "web", toString: "bad" }, {
      target: "web",
      missing: "bad",
    }]
  ) assertThrows(() => steps({ with: withInputs }), TypeError, "not declared");
  assertThrows(
    () => steps({ with: () => ({ target: "web", missing: "bad" }) }),
    TypeError,
    "not declared",
  );
  assertThrows(
    () => steps({ uses: "./other" }, "acme/noop@v1"),
    TypeError,
    "cannot be overridden",
  );
  assertThrows(
    () =>
      steps({}, {
        ...contract,
        outputs: { "bad output": { description: "Invalid" } },
        inputs: {},
      }),
    TypeError,
    "Action output names",
  );
  assertThrows(
    () => steps(undefined, { uses: "acme/action@v1" } as never),
    TypeError,
    "requires name and description",
  );
});
