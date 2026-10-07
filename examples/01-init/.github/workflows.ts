import {
  defineProject,
  defineWorkflow,
  runProject,
} from "@atty303/tsugiori/github-actions";

const sample = defineWorkflow("workflows/tsugiori.yml", {
  name: "Tsugiori sample",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("hello", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .run({ name: "Say hello", run: "echo 'Hello from Tsugiori!'" }));

const project = defineProject({
  workingDirectory: ".github",
  workflows: [sample],
});

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
