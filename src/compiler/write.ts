import { dirname, resolve } from "node:path";
import type { GeneratedFile } from "./generator.ts";

export async function writeGeneratedFiles(
  projectDirectory: string,
  files: readonly GeneratedFile[],
): Promise<void> {
  const destinations = resolveGeneratedDestinations(projectDirectory, files);
  for (const { file, output } of destinations) {
    await Deno.mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${crypto.randomUUID()}`;
    await Deno.writeFile(
      temporary,
      typeof file.content === "string"
        ? new TextEncoder().encode(file.content)
        : file.content,
    );
    await Deno.rename(temporary, output);
  }
}

export function resolveGeneratedDestinations(
  projectDirectory: string,
  files: readonly GeneratedFile[],
): readonly Readonly<{ file: GeneratedFile; output: string }>[] {
  const destinations = files.map((file) => ({
    file,
    output: resolve(projectDirectory, file.path),
  }));
  const seen = new Set<string>();
  for (const { file, output } of destinations) {
    if (seen.has(output)) {
      throw new Error(
        `Generated workflow outputs resolve to the same file: ${file.path}`,
      );
    }
    seen.add(output);
  }
  return destinations;
}
