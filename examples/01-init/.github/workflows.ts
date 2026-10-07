// Import the project runner and typed workflow builder.
import {
  project,
  runProject,
  workflow,
} from "@atty303/tsugiori/github-actions";

// Write this workflow to the selected GitHub Actions YAML path.
const sample = workflow("workflows/tsugiori.yml", {
  // Set the name shown in GitHub Actions.
  name: "Tsugiori sample",
  // Allow a manual workflow dispatch.
  on: { workflow_dispatch: {} },
  // Give the workflow read access to repository contents.
  permissions: { contents: "read" },
})
  // Register the hello job; the callback receives its typed builder.
  .job("hello", ({ job }) =>
    // Use job to configure this job, starting with its runner.
    job.runsOn("ubuntu-24.04")
      // Add a native shell step to the job.
      .run({
        // Name this step in the generated workflow and Actions UI.
        name: "Say hello",
        // Use this shell command as the step body.
        run: "echo 'Hello from Tsugiori!'",
      }));

if (import.meta.main) {
  // Route CLI commands such as generate through this project.
  Deno.exitCode = await runProject({
    // Register the workflow in a project rooted at .github.
    project: project({
      // Resolve generated paths from this directory.
      workingDirectory: ".github",
      // Generate every registered workflow.
      workflows: [sample],
    }),
    // Let the runner locate this entrypoint.
    entrypointUrl: import.meta.url,
  });
}
