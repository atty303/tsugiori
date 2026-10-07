import {
  defineProject,
  defineWorkflow,
  runProject,
  textValue,
} from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import checkout from "#actions/actions/checkout";

const sample = defineWorkflow("workflows/tsugiori.yml", {
  name: "Format a commit",
  on: {
    workflow_dispatch: {
      inputs: {
        format: {
          description: "Git pretty format for the latest commit",
          type: "string",
          required: true,
          default: "%h %s",
        },
      },
    },
  },
  permissions: { contents: "read" },
}).job("format", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .task({
      id: "commit",
      name: "Format commit",
      inputs: ({ inputs }) => ({
        format: { contract: textValue(), from: inputs.format },
      }),
      outputs: { summary: { contract: textValue(), required: true } },
      run: async ({ inputs, outputs }) => {
        const summary = await $`git log -1 --format=${inputs.format} HEAD`
          .text();
        await outputs.set("summary", summary);
      },
    })
    .run({
      name: "Show result",
      run: "printf '%s\\n' \"$SUMMARY\"",
      env: ({ steps }) => ({ SUMMARY: steps.commit.outputs.summary }),
    }));

const project = defineProject({
  cacheVersion: 1,
  workingDirectory: ".github",
  workflows: [sample],
});

if (import.meta.main) {
  Deno.exitCode = await runProject({
    project,
    entrypointUrl: import.meta.url,
  });
}
