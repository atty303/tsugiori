import { defineWorkflow } from "@atty303/tsugiori/github-actions";

export const ci = defineWorkflow("workflows/ci.yml", {
  name: "CI",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("hello", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .run({
      id: "greet",
      name: "Say hello",
      run: 'echo "message=Hello from Tsugiori!" >> "$GITHUB_OUTPUT"',
      outputs: ["message"],
    })
    .run({
      name: "Show the ref on main",
      run: "echo 'Running on main'",
      if: ({ github }) => github.ref.eq("refs/heads/main"),
    }).outputs(({ steps }) => ({ message: steps.greet.outputs.message })))
  .job(
    "follow-up",
    ({ job, jobs }) =>
      job.needs(jobs.hello).runsOn("ubuntu-24.04")
        .run({
          name: "Show the greeting",
          env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.message }),
          run: 'echo "$MESSAGE"',
        }),
  );
