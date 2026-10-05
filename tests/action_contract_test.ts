import { assertEquals, assertThrows } from "@std/assert";
import {
  defineAction,
  literal,
} from "../packages/core/src/github_actions/mod.ts";

Deno.test("metadata contracts retain requested uses and leave defaults to GitHub", () => {
  const contract = {
    uses: "acme/publish/path@v4",
    name: "Publish",
    description: "Publish",
    inputs: {
      target: { description: "Target", required: true },
      mode: { description: "Mode", required: true, default: "" },
    },
    outputs: { url: { description: "URL" } },
  } as const;
  const publish = defineAction({ contract });
  assertEquals(publish({ target: "web" }).uses, contract.uses);
  assertEquals(publish({ target: literal("web") }).with, {
    target: "${{ 'web' }}",
  });
  assertEquals(
    defineAction({ contract, uses: "./local/action" })({ target: "web" }).uses,
    "./local/action",
  );
  assertThrows(
    () => Reflect.apply(publish, null, [{}]),
    TypeError,
    "Required action input",
  );
  assertThrows(
    () => Reflect.apply(publish, null, [{ target: 3 }]),
    TypeError,
    "must be a string",
  );
  assertThrows(
    () => Reflect.apply(publish, null, [{ target: "web", toString: "bad" }]),
    TypeError,
    "not declared",
  );
});
