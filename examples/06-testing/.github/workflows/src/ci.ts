import {
  defineWorkflow,
  type Expression,
  present,
} from "@atty303/tsugiori/github-actions";
import checkout from "#actions/actions/checkout";
import { collectFiles, countLines, files, hasFiles } from "./tasks.ts";

export const ci = defineWorkflow("workflows/ci.yml", {
  name: "CI",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("inspect", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, {
      id: "checkout",
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .task({
      id: "collect",
      name: "Collect TypeScript files",
      outputs: {
        files: { contract: files, required: true },
        hasFiles: { contract: hasFiles, required: true },
      },
      run: collectFiles,
    })
    .task<
      "count",
      { files: { contract: typeof files; from: Expression<unknown, string> } }
    >({
      id: "count",
      name: "Count lines",
      if: ({ steps }) =>
        steps.collect.outputs.hasFiles.eq("true").and(
          present(steps.collect.outputs.files),
        ),
      inputs: ({ steps }) => ({
        files: { contract: files, from: steps.collect.outputs.files },
      } as const),
      run: countLines,
    }));
