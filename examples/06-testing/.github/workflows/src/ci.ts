// Import the workflow builder, expression type, and presence check.
import {
  defineWorkflow,
  type Expression,
  present,
} from "@atty303/tsugiori/github-actions";
// Use the typed checkout Action contract.
import checkout from "#actions/actions/checkout";
// Reuse the same task functions and contracts as the unit tests.
import { collectFiles, countLines, files, hasFiles } from "./tasks.ts";

// Generate this workflow at workflows/ci.yml.
export const ci = defineWorkflow("workflows/ci.yml", {
  // Name the workflow shown in GitHub Actions.
  name: "CI",
  // Allow manual runs.
  on: { workflow_dispatch: {} },
  // Grant checkout read access to repository contents.
  permissions: { contents: "read" },
})
  // Register the inspect job; the callback receives its typed builder.
  .job("inspect", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Give checkout a step ID for scenario fixtures.
      .uses(checkout, {
        // Give this step an ID for later references.
        id: "checkout",
        // Set the displayed name.
        name: "Checkout",
        // Pass validated inputs to the Action.
        with: { "persist-credentials": "false" },
      })
      // Add the collector task as a native step.
      .task({
        // Give this step an ID for later references.
        id: "collect",
        // Set the displayed name.
        name: "Collect TypeScript files",
        // Declare outputs using the contracts shared with tasks.ts.
        outputs: {
          // Validate this value with the shared file-list contract.
          files: { contract: files, required: true },
          // Carry the presence flag as plain text.
          hasFiles: { contract: hasFiles, required: true },
        },
        // Pass a function object that Deno.test also calls directly.
        run: collectFiles,
      })
      // Fix the consumer's input shape for TypeScript inference.
      .task<
        "count",
        { files: { contract: typeof files; from: Expression<unknown, string> } }
      >({
        // Give the consumer a stable step ID for scenario assertions.
        id: "count",
        // Set the displayed name.
        name: "Count lines",
        // Use a typed expression so scenario can evaluate the condition.
        if: ({ steps }) =>
          steps.collect.outputs.hasFiles.eq("true").and(
            present(steps.collect.outputs.files),
          ),
        // Read the collector's JSON output through the shared contract.
        inputs: ({ steps }) => ({
          // Validate this value with the shared file-list contract.
          files: { contract: files, from: steps.collect.outputs.files },
        } as const),
        // Reuse the directly unit-tested function object.
        run: countLines,
      }));
