import { defineProject, runProject } from "@atty303/tsugiori/github-actions";
import { ci } from "./workflows/src/ci.ts";

const project = defineProject({
  workingDirectory: ".github",
  workflows: [ci],
});

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
