// Build a local composite Action with typed task values.
import { compositeAction, textValue } from "@atty303/tsugiori/github-actions";

// Generate Action metadata at actions/greet/action.yml.
const draft = compositeAction("actions/greet/action.yml", {
  // Name and describe the local Action in its metadata.
  name: "Greet",
  description: "Create a greeting from a Deno task",
  // Expose the Action's incoming value.
  inputs: { who: { description: "Person to greet", required: true } },
  // Expose its result to both calling workflows.
  outputs: { message: { description: "The greeting" } },
});

// Add the task step and map its output to the Action output.
export const greet = draft.steps(({ step }) =>
  // Run the greeting as a Deno task inside the composite Action.
  step.task({
    // Give this step an ID for later references.
    id: "compose",
    // Set the displayed name.
    name: "Compose greeting",
    // Bind the Action input through a text contract.
    inputs: {
      // Connect the Action input to the task.
      who: { contract: textValue(), from: draft.inputs.who },
    },
    // Require the task to write a message.
    outputs: { message: { contract: textValue(), required: true } },
    // Write the greeting through the typed output writer.
    run: async ({ inputs, outputs }) => {
      // Publish the value promised by the task output contract.
      await outputs.set("message", `Hello, ${inputs.who}!`);
    },
  })
    // Map the task step output to the composite Action output.
    .outputs(({ steps }) => ({ message: steps.compose.outputs.message }))
);
