// Build a typed GitHub Actions workflow.
import { defineWorkflow } from "@atty303/tsugiori/github-actions";

// Generate this workflow at workflows/ci.yml.
export const ci = defineWorkflow("workflows/ci.yml", {
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
      // Give this step an ID so later expressions can read its output.
      .run({
        // Give this step an ID for later references.
        id: "greet",
        // Set the displayed name.
        name: "Say hello",
        // Set this native step’s shell command.
        run: 'echo "message=Hello from Tsugiori!" >> "$GITHUB_OUTPUT"',
        // Declare the output name exposed by this shell step.
        outputs: ["message"],
      })
      // Add a step conditional on the typed GitHub ref expression.
      .run({
        // Set the displayed name.
        name: "Show the ref on main",
        // Set this native step’s shell command.
        run: "echo 'Running on main'",
        // Build the condition from typed runtime values.
        if: ({ github }) => github.ref.eq("refs/heads/main"),
      })
      // Promote the step output to an output of the hello job.
      .outputs(({ steps }) => ({ message: steps.greet.outputs.message })))
  // Register follow-up after hello so jobs can refer to the earlier job.
  .job(
    // Use follow-up as the generated GitHub job ID.
    "follow-up",
    // job builds this job; jobs exposes previously defined jobs.
    ({ job, jobs }) =>
      // needs adds the hello dependency before choosing the runner.
      job.needs(jobs.hello).runsOn("ubuntu-24.04")
        // Read the preceding job's typed output from needs.
        .run({
          // Set the displayed name.
          name: "Show the greeting",
          // Resolve an output through the typed step or job context.
          env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.message }),
          // Set this native step’s shell command.
          run: 'echo "$MESSAGE"',
        }),
  );
