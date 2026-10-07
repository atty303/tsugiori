// Use the workflow builder and GitHub's plain-text value contract.
import { textValue, workflow } from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
// Use the typed checkout Action contract.
import checkout from "#actions/actions/checkout";

// Generate this workflow at workflows/ci.yml.
export const ci = workflow("workflows/ci.yml", {
  // Name the workflow shown in GitHub Actions.
  name: "CI",
  // Declare the manual trigger and its input.
  on: {
    workflow_dispatch: {
      // Declare inputs through typed contracts.
      inputs: {
        // Expose a Git pretty-format string to the task.
        format: {
          description: "Git pretty format for the latest commit",
          type: "string",
          required: true,
          default: "%h %s",
        },
      },
    },
  },
  // Grant checkout read access to repository contents.
  permissions: { contents: "read" },
})
  // Register the format job; the callback receives its typed builder.
  .job("format", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Check out the repository before running Git in the task.
      .uses(checkout, {
        // Set the displayed name.
        name: "Checkout",
        // Pass validated inputs to the Action.
        with: { "persist-credentials": "false" },
      })
      // Add a native step backed by a Deno task.
      .task({
        // Name this task for later output references.
        id: "commit",
        // Set the displayed name.
        name: "Format commit",
        // Bind the dispatch input through a text contract.
        inputs: ({ inputs }) => ({
          // Connect the dispatch value to the task input.
          format: { contract: textValue(), from: inputs.format },
        }),
        // Declare a required text output.
        outputs: {
          // Validate and require the summary written by this task.
          summary: { contract: textValue(), required: true },
        },
        // Receive parsed inputs and an output writer in the task body.
        run: async ({ inputs, outputs }) => {
          // Pass the dispatch format as one Git argument.
          const summary = await $`git log -1 --format=${inputs.format} HEAD`
            .text();
          // Publish the result as the declared step output.
          await outputs.set("summary", summary);
        },
      })
      // Read the task output in a later native shell step.
      .run({
        // Set the displayed name.
        name: "Show result",
        // Set this native step’s shell command.
        run: "printf '%s\\n' \"$SUMMARY\"",
        // The typed steps context resolves the commit task's output.
        env: ({ steps }) => ({ SUMMARY: steps.commit.outputs.summary }),
      }));
