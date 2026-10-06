import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { resolve } from "node:path";
import {
  defineCompositeAction,
  defineProject,
  defineWorkflow,
} from "../src/github_actions/mod.ts";
import { generateFiles } from "../src/compiler/generator.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { parse } from "../src/deps.ts";
import { TASK_PREPARE_SCRIPT } from "../src/task-runtime/bootstrap.ts";
import { generateV1 } from "../services/type-service/src/github/actions/v1.ts";

Deno.test("composite emission, local references, and external contracts share metadata", async () => {
  const draft = defineCompositeAction("actions/greet", {
    name: "Greet",
    description: "Greeting",
    author: "Example",
    branding: { icon: "terminal", color: "blue" },
    inputs: { who: { description: "Recipient", required: true } },
    outputs: { greeting: { description: "Greeting" } },
  });
  const action = draft.steps(({ step }) =>
    step.run({
      id: "greet",
      name: "Greet",
      shell: "bash",
      run: 'echo "greeting=hello" >> "$GITHUB_OUTPUT"\n',
      outputs: ["greeting"],
      env: { WHO: draft.inputs.who },
      if: ({ inputs }) => inputs.who.ne(""),
    }).outputs(({ steps }) => ({ greeting: steps.greet.outputs.greeting }))
  );
  const parent = defineCompositeAction("actions/parent", {
    name: "Parent",
    description: "Calls local action",
  }).steps(({ step }) => step.uses(action, { with: { who: "world" } }));
  const workflow = defineWorkflow(".github/workflows/greet.yml", {
    on: { push: {} },
  }).job(
    "greet",
    ({ job }) =>
      job.runsOn("ubuntu-latest").uses(action, {
        id: "greet",
        with: { who: "world" },
      }),
  );
  const files = await generateFiles(
    defineProject({ workflows: [workflow], actions: [action, parent] }),
    "./actions.ts",
    "unused",
  );
  assertEquals(files.map((file) => file.path), [
    ".github/workflows/greet.yml",
    "actions/greet/action.yml",
    "actions/parent/action.yml",
  ]);
  const yaml = files[1].content;
  assert(typeof yaml === "string");
  const decoded = parse(yaml) as {
    runs: {
      using: string;
      steps: { shell: string; run: string; env: { WHO: string } }[];
    };
    outputs: { greeting: { value: string } };
  };
  assertEquals(decoded.runs.using, "composite");
  assertEquals(
    decoded.runs.steps[0].run,
    'echo "greeting=hello" >> "$GITHUB_OUTPUT"\n',
  );
  assertEquals(decoded.runs.steps[0].env.WHO, "${{ inputs.who }}");
  assertEquals(
    decoded.outputs.greeting.value,
    "${{ steps.greet.outputs.greeting }}",
  );
  assertStringIncludes(String(files[2].content), "uses: ./actions/greet");
  const located = await generateFiles(
    defineProject({
      workingDirectory: ".github",
      workflows: [workflow],
      actions: [action, parent],
    }),
    "./actions.ts",
    "unused",
  );
  assertStringIncludes(
    String(located[0].content),
    "uses: ./.github/actions/greet",
  );
  assertStringIncludes(
    String(located[2].content),
    "uses: ./.github/actions/greet",
  );
  await assertRejects(
    () =>
      generateFiles(
        defineProject({ workflows: [workflow] }),
        "./actions.ts",
        "unused",
      ),
    Error,
    "same project",
  );
  const contract = generateV1(
    yaml,
    "acme/actions/actions/greet@" + "a".repeat(40),
    "https://example.com/action.yml",
  );
  assertStringIncludes(contract, "greeting");
  assert(!contract.includes('"runs"'));
  assertEquals(
    (await generateFiles(
      defineProject({ actions: [action] }),
      "./actions.ts",
      "unused",
    )).length,
    1,
  );
  assertThrows(
    () =>
      draft.steps(({ step }) =>
        step.run({ name: "Missing mapping", shell: "bash", run: "true" })
      ),
    TypeError,
    "output mappings",
  );
  assertThrows(
    () =>
      lowerProject(defineProject({ actions: [action, action] }), "actions.ts"),
    Error,
    "duplicated",
  );
  assertThrows(
    () =>
      defineCompositeAction("../escape", { name: "Bad", description: "Bad" }),
    TypeError,
  );
  await assertRejects(
    () => generateFiles(defineProject({}), "empty.ts", "unused"),
    Error,
    "at least one",
  );
});

Deno.test("generated Action bootstrap stays synchronized with workflow preparation", async () => {
  assertEquals(
    TASK_PREPARE_SCRIPT,
    await Deno.readTextFile(resolve("actions/task-prepare/prepare.sh")),
  );
});
