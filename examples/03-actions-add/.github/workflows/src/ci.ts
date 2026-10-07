// Build a typed GitHub Actions workflow.
import { workflow } from "@atty303/tsugiori/github-actions";
// Import the generated contract for checkout.
import checkout from "#actions/actions/checkout";

// Generate this workflow at workflows/ci.yml.
export const ci = workflow("workflows/ci.yml", {
  // Name the workflow shown in GitHub Actions.
  name: "CI",
  // Allow manual runs.
  on: { workflow_dispatch: {} },
  // Limit the token to repository read access.
  permissions: { contents: "read" },
})
  // Register the hello job; the callback receives its typed builder.
  .job("hello", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Pass the checkout contract to a native uses step.
      .uses(checkout, {
        // Set the displayed name.
        name: "Checkout",
        // The contract checks valid input names and values.
        with: { "persist-credentials": "false" },
      })
      // Mix ordinary shell steps with existing Actions.
      .run({
        // Name this shell step in the generated workflow.
        name: "Say hello",
        // Supply the shell command for the step.
        run: "echo 'Hello from Tsugiori!'",
      })
      // Build a typed condition from the GitHub ref.
      .run({
        // Set the displayed name.
        name: "Show the ref on main",
        // Set this native step’s shell command.
        run: "echo 'Running on main'",
        // Build the condition from typed runtime values.
        if: ({ github }) => github.ref.eq("refs/heads/main"),
      }))
  // Register follow-up after hello so jobs can refer to the earlier job.
  .job(
    // Use follow-up as the generated GitHub job ID.
    "follow-up",
    // job builds this job; jobs exposes previously defined jobs.
    ({ job, jobs }) =>
      // needs adds the hello dependency before choosing the runner.
      job.needs(jobs.hello).runsOn("ubuntu-24.04")
        // Add a native shell step.
        .run({
          // Name this step in the generated workflow.
          name: "Done",
          // Supply the shell command for the step.
          run: "echo 'The hello job completed'",
        }),
  );
