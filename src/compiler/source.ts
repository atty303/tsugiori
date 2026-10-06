import type { ProjectConfig } from "../github_actions/mod.ts";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type ProjectSource = Readonly<{
  project: ProjectConfig;
  entrypointPath: string;
  entrypointArgument: string;
  projectDirectory: string;
}>;

export class ProjectSourceError extends Error {
  readonly errorType = "project_source_invalid";
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProjectSourceError";
  }
}

export function projectSource(
  project: ProjectConfig,
  entrypointUrl: string | URL,
): ProjectSource {
  const projectDirectory = Deno.cwd();
  let entrypointPath: string;
  try {
    entrypointPath = fileURLToPath(entrypointUrl);
  } catch (error) {
    throw new ProjectSourceError("The entrypoint URL must be a file URL.", {
      cause: error,
    });
  }
  if (
    project?.kind !== "github-actions.project" ||
    !Array.isArray(project.workflows)
  ) {
    throw new ProjectSourceError(
      "The project must be created by defineProject().",
    );
  }
  if (
    !Number.isSafeInteger(project.cacheVersion) || project.cacheVersion <= 0
  ) {
    throw new ProjectSourceError(
      "Cache version must be a positive safe integer.",
    );
  }
  return {
    project,
    entrypointPath,
    entrypointArgument: `./${
      relative(projectDirectory, entrypointPath).split(sep).join("/")
    }`,
    projectDirectory,
  };
}
