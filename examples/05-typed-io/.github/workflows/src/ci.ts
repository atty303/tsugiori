// Import typed task contracts and workflow expressions.
import { jsonValue, present, workflow } from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import { z } from "@zod/zod";
import { join } from "node:path";
// Use the typed checkout Action contract.
import checkout from "#actions/actions/checkout";

// Validate a JSON array at task boundaries with Zod.
const files = jsonValue(z.array(z.string()));

// Generate this workflow at workflows/ci.yml.
export const ci = workflow("workflows/ci.yml", {
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
      // Check out files before the collection task runs.
      .uses(checkout, {
        // Set the displayed name.
        name: "Checkout",
        // Pass validated inputs to the Action.
        with: { "persist-credentials": "false" },
      })
      // Collect a typed file list in the first task.
      .task({
        // Make its outputs available under steps.collect.
        id: "collect",
        // Set the displayed name.
        name: "Collect TypeScript files",
        // Require both a JSON array and a plain-text presence flag.
        outputs: {
          // Reuse the shared JSON contract for this output.
          files: {
            // Validate the serialized array at the task boundary.
            contract: files,
            // Make this output mandatory for the collector.
            required: true,
          },
          // Carry the presence flag as plain text.
          hasFiles: { required: true },
        },
        // Write values through the declared output contracts.
        run: async ({ cwd, outputs }) => {
          const listing = await $`git ls-files -z -- '*.ts'`.cwd(cwd).text();
          const paths = listing.split("\0").filter(Boolean);
          // Serialize and validate the collected paths.
          await outputs.set("files", paths);
          // Expose a simple condition for the next step.
          await outputs.set("hasFiles", paths.length > 0 ? "true" : "false");
        },
      })
      // Consume the collected paths in a second task.
      .task({
        // Set the displayed name.
        name: "Count lines",
        // Skip the task when the file list is empty.
        if: ({ steps }) =>
          steps.collect.outputs.hasFiles.eq("true").and(
            present(steps.collect.outputs.files),
          ),
        // Bind the previous output with the same JSON contract.
        inputs: ({ steps }) => ({
          // Inherit the collector's JSON contract.
          files: { from: steps.collect.outputs.files },
        }),
        // Receive inputs.files as an already parsed string array.
        run: async ({ cwd, inputs, logger }) => {
          let lines = 0;
          for (const file of inputs.files) {
            const source = await Deno.readTextFile(join(cwd, file));
            lines += source.length === 0 ? 0 : source.split("\n").length -
              Number(source.endsWith("\n"));
          }
          logger.info(
            `${inputs.files.length} TypeScript files, ${lines} lines`,
          );
        },
      }));
