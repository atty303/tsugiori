import { jsonValue, textValue } from "@atty303/tsugiori/github-actions";
import type { TaskContext, TaskLogger } from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import { z } from "@zod/zod";
import { join } from "node:path";

export const files = jsonValue(z.array(z.string()));
export const hasFiles = textValue();

type CollectOutputs = {
  files: { contract: typeof files; required: true };
  hasFiles: { contract: typeof hasFiles; required: true };
};

export async function collectFiles(
  { cwd, outputs }: Pick<
    TaskContext<Record<never, never>, CollectOutputs>,
    "cwd" | "outputs"
  >,
): Promise<void> {
  const listing = await $`git ls-files -z -- '*.ts'`.cwd(cwd).text();
  const paths = listing.split("\0").filter(Boolean);
  await outputs.set("files", paths);
  await outputs.set("hasFiles", paths.length > 0 ? "true" : "false");
}

export async function countLines(
  { cwd, inputs, logger }: {
    cwd: string;
    inputs: { files: readonly string[] };
    logger: TaskLogger;
  },
): Promise<void> {
  let lines = 0;
  for (const file of inputs.files) {
    const source = await Deno.readTextFile(join(cwd, file));
    lines += source.length === 0 ? 0 : source.split("\n").length -
      Number(source.endsWith("\n"));
  }
  logger.info(`${inputs.files.length} TypeScript files, ${lines} lines`);
}
