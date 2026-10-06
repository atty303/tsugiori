import type { ProjectConfig } from "../github_actions/mod.ts";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type LoadedConfig = Readonly<{
  config: ProjectConfig;
  absolutePath: string;
  argument: string;
  projectDirectory: string;
}>;

export class SourceLoadError extends Error {
  readonly errorType = "source_load_failed";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SourceLoadError";
  }
}

export function configSource(
  config: ProjectConfig,
  configUrl: string | URL,
): LoadedConfig {
  const projectDirectory = Deno.cwd();
  let absolutePath: string;
  try {
    absolutePath = fileURLToPath(configUrl);
  } catch (error) {
    throw new SourceLoadError("The configuration URL must be a file URL.", {
      cause: error,
    });
  }
  if (
    config?.kind !== "github-actions.project" ||
    !Array.isArray(config.workflows)
  ) {
    throw new SourceLoadError(
      "The configuration must be created by defineProject().",
    );
  }
  if (!Number.isSafeInteger(config.cacheVersion) || config.cacheVersion <= 0) {
    throw new SourceLoadError("Cache version must be a positive safe integer.");
  }
  return {
    config,
    absolutePath,
    argument: `./${
      relative(projectDirectory, absolutePath).split(sep).join("/")
    }`,
    projectDirectory,
  };
}
