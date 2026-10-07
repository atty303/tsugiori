// Register workflows and run Tsugiori CLI commands.
import { project, runProject } from "@atty303/tsugiori/github-actions";
// Import the first caller workflow.
import { first } from "./workflows/src/first.ts";
// Import the second caller workflow.
import { second } from "./workflows/src/second.ts";

// Register the workflows and their generated paths.

if (import.meta.main) {
  // Dispatch CLI commands such as generate through this project.
  Deno.exitCode = await runProject({
    // Pass the project with its registered workflows.
    project: project({
      // Invalidate the task artifact when external inputs change.
      cacheVersion: 1,
      // Resolve output paths from the .github directory.
      workingDirectory: ".github",
      // Generate each registered workflow.
      workflows: [first, second],
    }),
    // Let the runner locate this entrypoint.
    entrypointUrl: import.meta.url,
  });
}
