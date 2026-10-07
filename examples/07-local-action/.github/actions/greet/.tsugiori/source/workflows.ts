import {
  defineCompositeAction,
  defineProject,
  defineWorkflow,
  runProject,
  textValue,
} from "@atty303/tsugiori/github-actions";
import checkout from "#actions/actions/checkout";

const draft = defineCompositeAction("actions/greet/action.yml", {
  name: "Greet",
  description: "Create a greeting from a Deno task",
  inputs: { who: { description: "Person to greet", required: true } },
  outputs: { message: { description: "The greeting" } },
});

const greet = draft.steps(({ step }) =>
  step.task({
    id: "compose",
    name: "Compose greeting",
    inputs: {
      who: { contract: textValue(), from: draft.inputs.who },
    },
    outputs: { message: { contract: textValue(), required: true } },
    run: async ({ inputs, outputs }) => {
      await outputs.set("message", `Hello, ${inputs.who}!`);
    },
  }).outputs(({ steps }) => ({ message: steps.compose.outputs.message }))
);

const first = defineWorkflow("workflows/first.yml", {
  name: "Greet from the first workflow",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("greet", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, { name: "Checkout" })
    .uses(greet, { id: "greeting", with: { who: "Ada" } })
    .run({
      name: "Show greeting",
      run: "printf '%s\\n' \"$MESSAGE\"",
      env: ({ steps }) => ({ MESSAGE: steps.greeting.outputs.message }),
    }));

const second = defineWorkflow("workflows/second.yml", {
  name: "Greet from the second workflow",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("greet", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, { name: "Checkout" })
    .uses(greet, { id: "greeting", with: { who: "Grace" } })
    .run({
      name: "Show greeting",
      run: "printf '%s\\n' \"$MESSAGE\"",
      env: ({ steps }) => ({ MESSAGE: steps.greeting.outputs.message }),
    }));

const project = defineProject({
  cacheVersion: 1,
  workingDirectory: ".github",
  workflows: [first, second],
});

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
