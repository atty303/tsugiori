import {
  defineWorkflow,
  jsonValue,
  present,
  textValue,
} from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import { z } from "@zod/zod";
import { join } from "node:path";
import checkout from "#actions/actions/checkout";

const files = jsonValue(z.array(z.string()));

export const ci = defineWorkflow("workflows/ci.yml", {
  name: "CI",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("inspect", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, {
      name: "Checkout",
      with: { "persist-credentials": "false" },
    })
    .task({
      id: "collect",
      name: "Collect TypeScript files",
      outputs: {
        files: { contract: files, required: true },
        hasFiles: { contract: textValue(), required: true },
      },
      run: async ({ cwd, outputs }) => {
        const listing = await $`git ls-files -z -- '*.ts'`.cwd(cwd).text();
        const paths = listing.split("\0").filter(Boolean);
        await outputs.set("files", paths);
        await outputs.set("hasFiles", paths.length > 0 ? "true" : "false");
      },
    })
    .task({
      name: "Count lines",
      if: ({ steps }) =>
        steps.collect.outputs.hasFiles.eq("true").and(
          present(steps.collect.outputs.files),
        ),
      inputs: ({ steps }) => ({
        files: { contract: files, from: steps.collect.outputs.files },
      }),
      run: async ({ cwd, inputs, logger }) => {
        let lines = 0;
        for (const file of inputs.files) {
          const source = await Deno.readTextFile(join(cwd, file));
          lines += source.length === 0 ? 0 : source.split("\n").length -
            Number(source.endsWith("\n"));
        }
        logger.info(`${inputs.files.length} TypeScript files, ${lines} lines`);
      },
    }));
