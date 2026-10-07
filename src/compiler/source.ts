import { collectCompositeActions } from "./composite.ts";
import type { DiagnosticRecorder } from "../task-runtime/diagnostics.ts";
import type { ProjectConfig } from "../github_actions/mod.ts";
import { isAbsolute, posix, relative, sep } from "node:path";
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
      "The project must be created by project().",
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

export async function resolveProjectWorkingDirectory(
  project: ProjectConfig,
  projectDirectory: string,
  recorder?: DiagnosticRecorder,
): Promise<string> {
  const required =
    project.workflows.some((workflow) =>
      workflow.jobs.some((job) =>
        job.steps.some((step) =>
          step.type === "task" ||
          (step.type === "uses" && step.calleeAction !== undefined)
        )
      )
    ) || collectCompositeActions(project).some((action) =>
      action.runs.steps.some((step) =>
        step.type === "uses" && step.calleeAction !== undefined
      )
    );
  if (!required && project.workingDirectory === undefined) return ".";
  const started = performance.now();
  try {
    let directory = project.workingDirectory;
    if (directory === undefined) {
      const cwd = await Deno.realPath(projectDirectory);
      const output = await new Deno.Command("git", {
        args: ["rev-parse", "--show-toplevel"],
        cwd,
        stdout: "piped",
        stderr: "null",
      }).output();
      if (!output.success) {
        throw new Error("git rev-parse --show-toplevel failed.");
      }
      const root = await Deno.realPath(
        new TextDecoder().decode(output.stdout).replace(/\r?\n$/, ""),
      );
      directory = relative(root, cwd).split(sep).join("/") || ".";
    }
    if (
      !directory.trim() || directory.includes("\\") || directory.includes("\0")
    ) {
      throw new Error(
        "Project location must be a nonempty checkout-relative path.",
      );
    }
    const normalized = posix.normalize(directory);
    if (
      isAbsolute(directory) || /^[A-Za-z]:/.test(directory) ||
      posix.isAbsolute(normalized) ||
      normalized === ".." || normalized.startsWith("../")
    ) {
      throw new Error(
        "Project location must remain inside the Actions checkout.",
      );
    }
    recorder?.operation({
      name: "project.location",
      status: "success",
      durationMs: performance.now() - started,
      attributes: {
        source: project.workingDirectory === undefined ? "git" : "explicit",
      },
    });
    return normalized;
  } catch (cause) {
    recorder?.operation({
      name: "project.location",
      status: "error",
      errorType: "project_source_invalid",
      durationMs: performance.now() - started,
    });
    throw new ProjectSourceError(
      project.workingDirectory === undefined
        ? "Cannot resolve the project location from Git root. Ensure Git is available and the invocation directory is inside a checkout, or set project({ workingDirectory: ... }) to its checkout-relative location."
        : "Invalid workingDirectory: use a nonempty checkout-relative path that remains inside the Actions checkout.",
      { cause },
    );
  }
}
