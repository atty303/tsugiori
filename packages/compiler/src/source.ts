import type { TsugioriConfig } from "../../core/src/mod.ts";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type LoadedConfig = Readonly<{
  config: TsugioriConfig;
  absolutePath: string;
  argument: string;
  projectArgument: string;
  rootDirectory: string;
}>;

export class SourceLoadError extends Error {
  readonly errorType = "source_load_failed";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SourceLoadError";
  }
}

export function configSource(
  config: TsugioriConfig,
  configUrl: string | URL,
  root: string | URL,
): LoadedConfig {
  const rootDirectory = root instanceof URL
    ? fileURLToPath(root)
    : resolve(Deno.cwd(), root);
  let absolutePath: string;
  try {
    absolutePath = fileURLToPath(configUrl);
  } catch (error) {
    throw new SourceLoadError("The configuration URL must be a file URL.", {
      cause: error,
    });
  }
  const relativePath = relative(rootDirectory, absolutePath);
  if (
    relativePath === ".." || relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new SourceLoadError(
      "The configuration file must be inside the project root.",
    );
  }
  const projectPath = relative(rootDirectory, Deno.cwd());
  if (
    projectPath === ".." || projectPath.startsWith(`..${sep}`) ||
    isAbsolute(projectPath)
  ) {
    throw new SourceLoadError(
      "The workflow project must be inside the repository root.",
    );
  }
  if (
    config?.kind !== "tsugiori.config" || !Array.isArray(config.pipelines)
  ) {
    throw new SourceLoadError(
      "The configuration default export must be created by defineTsugiori().",
    );
  }
  if (!Number.isSafeInteger(config.cacheVersion) || config.cacheVersion <= 0) {
    throw new SourceLoadError("Cache version must be a positive safe integer.");
  }
  return {
    config,
    absolutePath,
    argument: `./${relativePath.split(sep).join("/")}`,
    projectArgument: projectPath.split(sep).join("/") || ".",
    rootDirectory,
  };
}
