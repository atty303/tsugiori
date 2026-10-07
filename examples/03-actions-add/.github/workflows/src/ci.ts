import { defineWorkflow } from "@atty303/tsugiori/github-actions";
import checkout from "#actions/actions/checkout";

export const ci = defineWorkflow("workflows/ci.yml", {
  name: "CI",
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
