import { relative, sep } from "node:path";
import type { GeneratedFile } from "./generator.ts";
import { resolveGeneratedDestinations } from "./write.ts";

export type StaleGeneratedFile = Readonly<{
  path: string;
  reason: "missing" | "changed";
}>;

export async function checkGeneratedFiles(
  projectDirectory: string,
  entrypointArgument: string,
  files: readonly GeneratedFile[],
  selectedOutput?: string,
): Promise<readonly StaleGeneratedFile[]> {
  const destinations = resolveGeneratedDestinations(projectDirectory, files);
  void entrypointArgument;
  const selected = selectedOutput === undefined
    ? undefined
    : resolveGeneratedDestinations(projectDirectory, [{
      path: selectedOutput,
      content: "",
    }])[0].output;
  const expected = new Map(
    destinations.map(({ file, output }) => [output, file]),
  );
  const checked = selected === undefined
    ? destinations
    : destinations.filter(({ output }) => output === selected);
  const stale: StaleGeneratedFile[] = [];

  for (const { file, output } of checked) {
    const actual = await readIfPresent(output);
    if (actual === undefined) {
      stale.push({
        path: displayPath(projectDirectory, output),
        reason: "missing",
      });
    } else if (
      !sameBytes(
        actual,
        typeof file.content === "string"
          ? new TextEncoder().encode(file.content)
          : file.content,
      )
    ) {
      stale.push({
        path: displayPath(projectDirectory, output),
        reason: "changed",
      });
    }
  }

  if (selected !== undefined && !expected.has(selected)) {
    throw new Error(
      `Workflow output is not configured: ${
        displayPath(projectDirectory, selected)
      }`,
    );
  }
  return stale.sort((left, right) => left.path.localeCompare(right.path));
}

function displayPath(projectDirectory: string, output: string): string {
  return relative(projectDirectory, output).split(sep).join("/");
}

async function readIfPresent(path: string): Promise<Uint8Array | undefined> {
  try {
    return await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return undefined;
    throw error;
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length &&
    left.every((byte, index) => byte === right[index]);
}
