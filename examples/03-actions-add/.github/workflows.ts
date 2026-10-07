import {
  defineProject,
  defineWorkflow,
  runProject,
} from "@atty303/tsugiori/github-actions";
import checkout from "#actions/actions/checkout";

const sample = defineWorkflow("workflows/tsugiori.yml", {
  name: "Tsugiori sample",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("hello", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .run({ name: "Say hello", run: "echo 'Hello from Tsugiori!'" })
    .run({
      name: "Show the ref on main",
      run: "echo 'Running on main'",
      if: ({ github }) => github.ref.eq("refs/heads/main"),
    })).job(
    "follow-up",
    ({ job, jobs }) =>
      job.needs(jobs.hello).runsOn("ubuntu-24.04")
        .run({ name: "Done", run: "echo 'The hello job completed'" }),
  );

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
