// Register workflows and run Tsugiori CLI commands.
import { project, runProject } from "@atty303/tsugiori/github-actions";
// Import the workflow defined in its own source file.
import { ci } from "./workflows/src/ci.ts";

// Register the workflows and their generated paths.

if (import.meta.main) {
  // Dispatch CLI commands such as generate through this project.
  Deno.exitCode = await runProject({
    // Pass the project with its registered workflows.
    project: project({
      // Resolve output paths from the .github directory.
      workingDirectory: ".github",
      // Generate each registered workflow.
      workflows: [ci],
    }),
    // Let the runner locate this entrypoint.
    entrypointUrl: import.meta.url,
  });
}
