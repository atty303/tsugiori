// Build the first workflow with typed steps.
import { defineWorkflow } from "@atty303/tsugiori/github-actions";
// Use the typed checkout contract.
import checkout from "#actions/actions/checkout";
// Import the repository-local composite Action definition.
import { greet } from "../../actions/greet/src/mod.ts";

// Generate the first caller workflow.
export const first = defineWorkflow("workflows/first.yml", {
  // Name the workflow shown in GitHub Actions.
  name: "Greet from the first workflow",
  // Allow manual runs.
  on: { workflow_dispatch: {} },
  // Grant checkout repository read access.
  permissions: { contents: "read" },
})
  // Register the greet job; the callback receives its typed builder.
  .job("greet", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Make the local Action available on the runner.
      .uses(checkout, {
        // Name the checkout step in the generated workflow.
        name: "Checkout",
      })
      // Call the Action with its typed who input.
      .uses(greet, {
        // Expose this step's outputs through steps.greeting.
        id: "greeting",
        // Pass values checked against the Action's input contract.
        with: {
          // Set the person to greet in this workflow.
          who: "Ada",
        },
      })
      // Read its typed message output in a later step.
      .run({
        // Set the displayed name.
        name: "Show greeting",
        // Set this native step’s shell command.
        run: "printf '%s\\n' \"$MESSAGE\"",
        // Resolve an output through the typed step or job context.
        env: ({ steps }) => ({ MESSAGE: steps.greeting.outputs.message }),
      }));
