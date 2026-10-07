import { defineWorkflow, textValue } from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import checkout from "#actions/actions/checkout";

export const ci = defineWorkflow("workflows/ci.yml", {
  name: "CI",
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
