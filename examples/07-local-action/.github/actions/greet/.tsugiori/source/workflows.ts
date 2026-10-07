import { defineProject, runProject } from "@atty303/tsugiori/github-actions";
import { first } from "./workflows/src/first.ts";
import { second } from "./workflows/src/second.ts";

const project = defineProject({
  cacheVersion: 1,
  workingDirectory: ".github",
  workflows: [first, second],
});

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
