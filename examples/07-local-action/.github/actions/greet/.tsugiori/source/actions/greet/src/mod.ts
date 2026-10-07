import {
  defineCompositeAction,
  textValue,
} from "@atty303/tsugiori/github-actions";

const draft = defineCompositeAction("actions/greet/action.yml", {
  name: "Greet",
  description: "Create a greeting from a Deno task",
  inputs: { who: { description: "Person to greet", required: true } },
  outputs: { message: { description: "The greeting" } },
});

export const greet = draft.steps(({ step }) =>
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
