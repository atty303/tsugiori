import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import type { GeneratedFile } from "./generator.ts";

export async function writeGeneratedFiles(
  rootDirectory: string,
  files: readonly GeneratedFile[],
): Promise<void> {
  const destinations = resolveGeneratedDestinations(rootDirectory, files);
  for (const { file, output } of destinations) {
    await Deno.mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${crypto.randomUUID()}`;
    await Deno.writeTextFile(temporary, file.content);
    await Deno.rename(temporary, output);
  }
}

export function resolveGeneratedDestinations(
  rootDirectory: string,
  files: readonly GeneratedFile[],
): readonly Readonly<{ file: GeneratedFile; output: string }>[] {
  const workflowRoot = resolve(rootDirectory, ".github/workflows");
  const destinations = files.map((file) => ({
    file,
    output: resolve(rootDirectory, file.path),
  }));
  const seen = new Set<string>();
  for (const { file, output } of destinations) {
    const relativeOutput = relative(workflowRoot, output);
    if (
      relativeOutput === ".." || relativeOutput.startsWith(`..${sep}`) ||
      isAbsolute(relativeOutput) || extname(output) !== ".yml"
    ) {
      throw new Error(
        `Generated workflow output must be a .yml file inside .github/workflows: ${file.path}`,
      );
    }
    if (seen.has(output)) {
      throw new Error(
        `Generated workflow outputs resolve to the same file: ${file.path}`,
      );
    }
    seen.add(output);
  }
  return destinations;
}
