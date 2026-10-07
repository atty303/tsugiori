// Define the same output contracts used by the workflow.
import { jsonValue, textValue } from "@atty303/tsugiori/github-actions";
// Type the callable task functions without hiding them inside the DSL.
import type { TaskContext, TaskLogger } from "@atty303/tsugiori/github-actions";
import $ from "@david/dax";
import { z } from "@zod/zod";
import { join } from "node:path";

// Parse file paths as a JSON array at task boundaries.
export const files = jsonValue(z.array(z.string()));
// Carry the presence flag as plain GitHub Actions text.
export const hasFiles = textValue();

// Describe the outputs accepted by the collector's writer.
type CollectOutputs = {
  // Validate this value with the shared file-list contract.
  files: { contract: typeof files; required: true };
  // Carry the presence flag as plain text.
  hasFiles: { contract: typeof hasFiles; required: true };
};

// Export an ordinary function for both the DSL and Deno.test.
export async function collectFiles(
  { cwd, outputs }: Pick<
    TaskContext<Record<never, never>, CollectOutputs>,
    "cwd" | "outputs"
  >,
): Promise<void> {
  const listing = await $`git ls-files -z -- '*.ts'`.cwd(cwd).text();
  const paths = listing.split("\0").filter(Boolean);
  // Validate and publish the collected path array.
  await outputs.set("files", paths);
  // Publish the flag used by the workflow condition.
  await outputs.set("hasFiles", paths.length > 0 ? "true" : "false");
}

// Export the consumer as another directly callable function.
export async function countLines(
  { cwd, inputs, logger }: {
    cwd: string;
    // Declare inputs through typed contracts.
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
  // Report results after receiving the parsed input array.
  logger.info(`${inputs.files.length} TypeScript files, ${lines} lines`);
}
