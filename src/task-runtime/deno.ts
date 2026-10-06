import { TaskRuntimeError } from "./artifact.ts";

// Compilation embeds validation metadata with --preload (Deno 2.6).
export const MINIMUM_DENO_VERSION = "2.6.0";

export function supportedDenoVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[^ ]+)?$/.exec(version);
  if (match === null) return false;
  const minimum = MINIMUM_DENO_VERSION.split(".").map(Number);
  for (let index = 0; index < minimum.length; index++) {
    const value = Number(match[index + 1]);
    if (value !== minimum[index]) return value > minimum[index];
  }
  return true;
}

export function requireSupportedDeno(): void {
  if (!Deno.build.standalone && !supportedDenoVersion(Deno.version.deno)) {
    throw new TaskRuntimeError(
      "deno_version_unsupported",
      `Tsugiori requires Deno >= ${MINIMUM_DENO_VERSION}; found ${Deno.version.deno}.`,
    );
  }
}

export async function runDeno(
  args: readonly string[],
  cwd: string,
  errorType: string,
): Promise<string> {
  const binary = Deno.env.get("TSUGIORI_DENO") ?? Deno.execPath();
  let result: Deno.CommandOutput;
  try {
    result = await new Deno.Command(binary, {
      args: [...args],
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (cause) {
    throw new TaskRuntimeError(
      errorType,
      `Failed to start Deno for ${args[0]}.`,
      { cause },
    );
  }
  if (!result.success) {
    throw new TaskRuntimeError(
      errorType,
      new TextDecoder().decode(result.stderr).trim() ||
        `Deno ${args[0]} failed with ${result.code}.`,
    );
  }
  return new TextDecoder().decode(result.stdout);
}
