import { addAction } from "./actions.ts";
import { generateFiles } from "../compiler/generator.ts";
import { checkGeneratedFiles } from "../compiler/check.ts";
import { projectSource } from "../compiler/source.ts";
import type { ProjectConfig } from "../github_actions/mod.ts";
import { parseWireValue, serializeValue } from "../task/mod.ts";
import type { AuthoringTaskStep } from "../github_actions/mod.ts";
import { writeGeneratedFiles } from "../compiler/write.ts";
import { TaskRuntimeError } from "../task-runtime/artifact.ts";
import {
  DiagnosticRecorder,
  diagnosticsEnabled,
} from "../task-runtime/diagnostics.ts";
import {
  prepareTaskArtifact,
  resolveTaskArtifact,
  taskArtifactCachePath,
  type ToolIdentity,
} from "../task-runtime/prepare.ts";
import { TSUGIORI_PACKAGE_VERSION } from "../package_identity.ts";

const SOURCE_TOOL_IDENTITY: ToolIdentity = {
  version: TSUGIORI_PACKAGE_VERSION,
};

export type RunOptions = Readonly<{
  project: ProjectConfig;
  /** Local executable entrypoint's `import.meta.url`, even when `project` is
   * imported from another module. Used for generated YAML provenance and the
   * task artifact compilation entrypoint; the project directory is `Deno.cwd()`.
   */
  entrypointUrl: string | URL;
}>;

/** Handles generation, actions add, and internal task commands in the consumer's
 * Deno project using the supplied project value without importing it again. It does not run
 * a GitHub Actions workflow. Returns 0 on success and 1 on command failure;
 * callers can assign the result to `Deno.exitCode`. `actions add <uses>` edits
 * the invocation directory's inline Deno imports only; it does not fetch modules,
 * update the lockfile, or add imports to the authoring source.
 */
export async function runProject(
  options: RunOptions,
  args: readonly string[] = Deno.args,
  tool: ToolIdentity = SOURCE_TOOL_IDENTITY,
): Promise<number> {
  if (args.length === 1 && args[0].includes("/")) {
    return await dispatchTask(options.project, args[0], tool);
  }
  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    const recorder = new DiagnosticRecorder(
      "unknown",
      tool.version,
      diagnosticsEnabled(),
    );
    recorder.operation({
      name: "argument.parse",
      status: "error",
      errorType: errorTypeOf(error),
    });
    await recorder.finish("error");
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const commandName = parsed.command[0] === "actions"
    ? "actions.add"
    : parsed.command.join(".") || "unknown";
  const recorder = new DiagnosticRecorder(
    commandName,
    tool.version,
    diagnosticsEnabled(),
  );
  try {
    if (parsed.command[0] === "actions") {
      if (
        parsed.command.length !== 3 || parsed.command[1] !== "add" ||
        Object.keys(parsed.options).length !== 0 ||
        Object.keys(parsed.multipleOptions).length !== 0
      ) {
        throw new TaskRuntimeError(
          "usage_invalid",
          "Usage: deno task tsugiori actions add <owner/repo[/path]@ref>",
        );
      }
      const changed = await addAction(parsed.command[2], Deno.cwd(), recorder);
      await recorder.finish("success");
      console.log(
        changed
          ? "Added Action import mapping. Run deno install before importing it."
          : "Action import mapping already exists.",
      );
      return 0;
    }

    if (parsed.command.length === 1 && parsed.command[0] === "generate") {
      if (
        parsed.options.output !== undefined && parsed.options.check !== "true"
      ) {
        throw new TaskRuntimeError(
          "usage_invalid",
          "Option --output requires --check.",
        );
      }
      const source = projectSource(
        options.project,
        options.entrypointUrl,
      );
      recorder.operation({ name: "project.source", status: "success" });
      const files = await generateFiles(
        source.project,
        source.entrypointArgument,
      );
      if (parsed.options.check === "true") {
        const stale = await checkGeneratedFiles(
          source.projectDirectory,
          source.entrypointArgument,
          files,
          parsed.options.output,
        );
        if (stale.length > 0) {
          for (const file of stale) {
            console.error(`${file.reason}: ${file.path}`);
          }
          recorder.operation({
            name: "workflow.check",
            status: "error",
            errorType: "workflow_stale",
            attributes: { fileCount: stale.length },
          });
          await recorder.finish("error");
          return 1;
        }
        recorder.operation({
          name: "workflow.check",
          status: "success",
          attributes: {
            fileCount: parsed.options.output === undefined ? files.length : 1,
          },
        });
        await recorder.finish("success");
        console.log("Generated workflow files are up to date.");
        return 0;
      }
      await writeGeneratedFiles(source.projectDirectory, files);
      recorder.operation({
        name: "workflow.generate",
        status: "success",
        attributes: { fileCount: files.length },
      });
      await recorder.finish("success");
      console.log(`Generated ${files.length} workflow file(s).`);
      return 0;
    }

    if (isGitHubActionsTaskCommand(parsed, "cache-key")) {
      const source = projectSource(
        options.project,
        options.entrypointUrl,
      );
      recorder.operation({ name: "project.source", status: "success" });
      const plan = await resolveTaskArtifact({
        projectDirectory: Deno.cwd(),
        entrypointPath: source.entrypointPath,
        entrypointArgument: source.entrypointArgument,
        project: source.project,
        expectedLayouts: parsed.multipleOptions.expectLayout ?? [],
        target: parsed.options.target,
        tool,
        recorder,
      });
      await writeGitHubOutputs({
        "artifact-key": plan.artifactKey,
        "cache-path": taskArtifactCachePath(plan.artifactKey),
      });
      recorder.operation({ name: "github.output", status: "success" });
      await recorder.finish("success");
      console.log("Resolved task artifact cache key.");
      return 0;
    }

    if (isGitHubActionsTaskCommand(parsed, "prepare")) {
      const source = projectSource(
        options.project,
        options.entrypointUrl,
      );
      recorder.operation({ name: "project.source", status: "success" });
      const result = await prepareTaskArtifact({
        projectDirectory: Deno.cwd(),
        entrypointPath: source.entrypointPath,
        entrypointArgument: source.entrypointArgument,
        project: source.project,
        expectedLayouts: parsed.multipleOptions.expectLayout ?? [],
        expectedArtifactKey: requiredOption(parsed.options, "expectedKey"),
        target: parsed.options.target,
        tool,
        recorder,
      });
      recorder.operation({
        name: "artifact.materialize",
        status: "success",
        attributes: {
          artifactKey: result.artifactKey,
          cache: result.cache,
        },
      });
      await writeGitHubOutputs({ "runtime-path": result.runtimePath });
      await recorder.finish("success");
      console.log(
        `Task artifact ready (cache ${result.cache}).`,
      );
      return 0;
    }

    throw new TaskRuntimeError(
      "usage_invalid",
      "Usage: deno run -A <entrypoint-file> generate [--check [--output <path>]] | actions add <uses> | github-actions task cache-key | github-actions task prepare",
    );
  } catch (error) {
    const errorType = errorTypeOf(error);
    recorder.operation({
      name: commandName,
      status: "error",
      errorType,
    });
    await recorder.finish("error");
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function dispatchTask(
  project: ProjectConfig,
  entrypoint: string,
  tool: ToolIdentity,
): Promise<number> {
  const recorder = new DiagnosticRecorder(
    "task.dispatch",
    tool.version,
    diagnosticsEnabled(),
  );
  let errorType = "schema_invalid";
  try {
    if (
      project?.kind !== "github-actions.project" ||
      !Array.isArray(project.workflows)
    ) {
      throw new TaskRuntimeError(
        "schema_invalid",
        "Invalid GitHub Actions project configuration.",
      );
    }
    let task: AuthoringTaskStep | undefined;
    for (const workflow of project.workflows) {
      for (const job of workflow.jobs) {
        let ordinal = 0;
        for (const step of job.steps) {
          if (step.type !== "task") continue;
          ordinal += 1;
          if (typeof step.run !== "function") {
            throw new TaskRuntimeError(
              "schema_invalid",
              "Task step does not contain a function.",
            );
          }
          if (`${workflow.path}/${job.id}/task-${ordinal}` === entrypoint) {
            task = step;
          }
        }
      }
    }
    if (task === undefined) {
      errorType = "entrypoint_not_found";
      throw new TaskRuntimeError(
        errorType,
        `Unknown task entrypoint ${JSON.stringify(entrypoint)}.`,
      );
    }
    errorType = "task_failed";
    const inputs: Record<string, unknown> = {};
    for (const [name, input] of Object.entries(task.inputs)) {
      const wire = Deno.env.get(input.from as string) ?? "";
      let value: unknown;
      try {
        value = parseWireValue(input.contract, wire);
      } catch (cause) {
        throw new TaskRuntimeError(
          "schema_invalid",
          `Task input ${JSON.stringify(name)} failed validation.`,
          { cause },
        );
      }
      if (value === null && !input.optional) {
        throw new TaskRuntimeError(
          "schema_invalid",
          `Task input ${JSON.stringify(name)} is absent.`,
        );
      }
      inputs[name] = value;
    }
    const written = new Set<string>();
    await task.run({
      cwd: Deno.cwd(),
      inputs,
      outputs: {
        set: async (name: string, value: unknown) => {
          const output = task.outputs[name];
          if (output === undefined) {
            throw new TaskRuntimeError(
              "github_output_invalid",
              `Task output ${JSON.stringify(name)} is not declared.`,
            );
          }
          let wire: string;
          try {
            wire = serializeValue(output.contract, value);
          } catch (cause) {
            throw new TaskRuntimeError(
              "github_output_invalid",
              `Task output ${JSON.stringify(name)} failed validation.`,
              { cause },
            );
          }
          await writeTaskOutput(name, wire);
          written.add(name);
        },
      },
      logger: {
        info: (...values) => console.log(...values),
        warn: (...values) => console.warn(...values),
        error: (...values) => console.error(...values),
      },
    });
    for (const [name, output] of Object.entries(task.outputs)) {
      if (output.required && !written.has(name)) {
        throw new TaskRuntimeError(
          "github_output_invalid",
          `Required task output ${JSON.stringify(name)} was not set.`,
        );
      }
    }
    recorder.operation({
      name: "task.dispatch",
      status: "success",
      attributes: { entrypoint },
    });
    recorder.finish("success");
    return 0;
  } catch (error) {
    if (error instanceof TaskRuntimeError) {
      errorType = error.errorType;
    }
    recorder.operation({
      name: "task.dispatch",
      status: "error",
      errorType,
      attributes: { entrypoint },
    });
    recorder.finish("error");
    console.error(
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    return 1;
  }
}

function errorTypeOf(error: unknown): string {
  if (error instanceof TaskRuntimeError) return error.errorType;
  if (typeof error !== "object" || error === null) return "runtime_error";
  const candidate = error as { errorType?: unknown };
  return typeof candidate.errorType === "string"
    ? candidate.errorType
    : "runtime_error";
}

type ParsedArguments = Readonly<{
  command: readonly string[];
  options: Readonly<Record<string, string | undefined>>;
  multipleOptions: Readonly<Record<string, readonly string[] | undefined>>;
}>;

function parseArguments(args: readonly string[]): ParsedArguments {
  const command: string[] = [];
  const options: Record<string, string | undefined> = {};
  const multipleOptions: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      command.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const rawName = argument.slice(2, equals < 0 ? undefined : equals);
    if (
      rawName !== "expect-layout" &&
      rawName !== "expected-key" && rawName !== "target" &&
      rawName !== "check" && rawName !== "output"
    ) {
      throw new TaskRuntimeError(
        "usage_invalid",
        `Unknown option --${rawName}.`,
      );
    }
    const name = rawName.replace(
      /-([a-z])/g,
      (_, letter: string) => letter.toUpperCase(),
    );
    if (name === "check") {
      if (equals >= 0) {
        throw new TaskRuntimeError(
          "usage_invalid",
          "Option --check takes no value.",
        );
      }
      options.check = "true";
      continue;
    }
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new TaskRuntimeError(
        "usage_invalid",
        `Option --${rawName} requires a value.`,
      );
    }
    if (name === "expectLayout") {
      (multipleOptions[name] ??= []).push(value);
    } else {
      options[name] = value;
    }
  }
  return { command, options, multipleOptions };
}

function isGitHubActionsTaskCommand(
  parsed: ParsedArguments,
  operation: "cache-key" | "prepare",
): boolean {
  return parsed.command.length === 3 &&
    parsed.command[0] === "github-actions" &&
    parsed.command[1] === "task" && parsed.command[2] === operation;
}

async function writeGitHubOutputs(
  outputs: Readonly<Record<string, string>>,
): Promise<void> {
  const path = Deno.env.get("GITHUB_OUTPUT");
  if (path === undefined || path.length === 0) {
    throw new TaskRuntimeError(
      "github_output_unavailable",
      "GitHub Actions did not provide GITHUB_OUTPUT.",
    );
  }
  const lines = Object.entries(outputs).map(([name, value]) => {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || /[\r\n]/.test(value)) {
      throw new TaskRuntimeError(
        "github_output_invalid",
        "The GitHub Actions output is invalid.",
      );
    }
    return `${name}=${value}\n`;
  });
  try {
    await Deno.writeTextFile(path, lines.join(""), { append: true });
  } catch (error) {
    throw new TaskRuntimeError(
      "github_output_write_failed",
      "Failed to write GitHub Actions step outputs.",
      { cause: error },
    );
  }
}

async function writeTaskOutput(name: string, value: string): Promise<void> {
  const path = Deno.env.get("GITHUB_OUTPUT");
  if (path === undefined || path.length === 0) {
    throw new TaskRuntimeError(
      "github_output_unavailable",
      "GitHub Actions did not provide GITHUB_OUTPUT.",
    );
  }
  const delimiter = `tsugiori_${crypto.randomUUID().replaceAll("-", "")}`;
  if (value.includes(delimiter)) {
    throw new TaskRuntimeError(
      "github_output_invalid",
      "Task output delimiter collision.",
    );
  }
  try {
    await Deno.writeTextFile(
      path,
      `${name}<<${delimiter}\n${value}\n${delimiter}\n`,
      { append: true },
    );
  } catch (error) {
    throw new TaskRuntimeError(
      "github_output_write_failed",
      "Failed to write GitHub Actions task output.",
      { cause: error },
    );
  }
}

function requiredOption(
  options: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = options[name];
  if (value === undefined || value.length === 0) {
    throw new TaskRuntimeError(
      "usage_invalid",
      `Option --${name} is required.`,
    );
  }
  return value;
}
