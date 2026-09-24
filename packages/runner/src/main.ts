import { generateFiles } from "../../compiler/src/generator.ts";
import { checkGeneratedFiles } from "../../compiler/src/check.ts";
import { configSource } from "../../compiler/src/source.ts";
import type { TaskFunction, TsugioriConfig } from "../../core/src/mod.ts";
import { writeGeneratedFiles } from "../../compiler/src/write.ts";
import { TaskRuntimeError } from "../../task-runtime/src/artifact.ts";
import {
  DiagnosticRecorder,
  diagnosticsEnabled,
} from "../../task-runtime/src/diagnostics.ts";
import {
  prepareTaskArtifact,
  resolveTaskArtifact,
  type ToolIdentity,
} from "../../task-runtime/src/prepare.ts";
import { TSUGIORI_PACKAGE_VERSION } from "../../core/src/package_identity.ts";

const SOURCE_TOOL_IDENTITY: ToolIdentity = {
  version: TSUGIORI_PACKAGE_VERSION,
};

export type RunOptions = Readonly<{
  config: TsugioriConfig;
  configUrl: string | URL;
  root: string | URL;
}>;

/** Executes from the consumer's Deno project without importing the config again. */
export async function runTsugiori(
  options: RunOptions,
  args: readonly string[] = Deno.args,
  tool: ToolIdentity = SOURCE_TOOL_IDENTITY,
): Promise<number> {
  if (args.length === 1 && args[0].includes("/")) {
    return await dispatchTask(options.config, args[0], tool);
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
  const commandName = parsed.command.join(".") || "unknown";
  const recorder = new DiagnosticRecorder(
    commandName,
    tool.version,
    diagnosticsEnabled(),
  );
  try {
    if (parsed.command.length === 1 && parsed.command[0] === "generate") {
      if (
        parsed.options.output !== undefined && parsed.options.check !== "true"
      ) {
        throw new TaskRuntimeError(
          "usage_invalid",
          "Option --output requires --check.",
        );
      }
      const loaded = configSource(
        options.config,
        options.configUrl,
        options.root,
      );
      recorder.operation({ name: "source.load", status: "success" });
      const files = await generateFiles(
        loaded.config,
        loaded.argument,
        loaded.projectArgument,
      );
      if (parsed.options.check === "true") {
        const stale = await checkGeneratedFiles(
          loaded.rootDirectory,
          loaded.argument,
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
      await writeGeneratedFiles(loaded.rootDirectory, files);
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
      const loaded = configSource(
        options.config,
        options.configUrl,
        options.root,
      );
      recorder.operation({ name: "source.load", status: "success" });
      const plan = await resolveTaskArtifact({
        rootDirectory: loaded.rootDirectory,
        projectDirectory: Deno.cwd(),
        configPath: loaded.absolutePath,
        configArgument: loaded.argument,
        config: loaded.config,
        expectedLayouts: parsed.multipleOptions.expectLayout ?? [],
        target: parsed.options.target,
        tool,
        recorder,
      });
      await writeGitHubOutputs({
        "artifact-key": plan.artifactKey,
        "cache-path": `.tsugiori/cache/artifacts/${plan.artifactKey}`,
      });
      recorder.operation({ name: "github.output", status: "success" });
      await recorder.finish("success");
      console.log("Resolved task artifact cache key.");
      return 0;
    }

    if (isGitHubActionsTaskCommand(parsed, "prepare")) {
      const loaded = configSource(
        options.config,
        options.configUrl,
        options.root,
      );
      recorder.operation({ name: "source.load", status: "success" });
      const result = await prepareTaskArtifact({
        rootDirectory: loaded.rootDirectory,
        projectDirectory: Deno.cwd(),
        configPath: loaded.absolutePath,
        configArgument: loaded.argument,
        config: loaded.config,
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
      await recorder.finish("success");
      console.log(
        `Task artifact ready at ./.tsugiori/task-runtime (cache ${result.cache}).`,
      );
      return 0;
    }

    throw new TaskRuntimeError(
      "usage_invalid",
      "Usage: deno run -A <config-file> generate [--check [--output <path>]] | github-actions task cache-key | github-actions task prepare",
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
  config: TsugioriConfig,
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
      config?.kind !== "tsugiori.config" || !Array.isArray(config.pipelines)
    ) {
      throw new TaskRuntimeError(
        "schema_invalid",
        "Invalid Tsugiori configuration.",
      );
    }
    let task: TaskFunction | undefined;
    for (const pipeline of config.pipelines) {
      for (const job of pipeline.jobs) {
        let ordinal = 0;
        for (const step of job.steps) {
          if (step.type !== "task") continue;
          ordinal += 1;
          if (typeof step.task !== "function") {
            throw new TaskRuntimeError(
              "schema_invalid",
              "Task step does not contain a function.",
            );
          }
          if (`${pipeline.id}/${job.id}/task-${ordinal}` === entrypoint) {
            task = step.task;
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
    await task({
      cwd: Deno.cwd(),
      logger: {
        info: (...values) => console.log(...values),
        warn: (...values) => console.warn(...values),
        error: (...values) => console.error(...values),
      },
    });
    recorder.operation({
      name: "task.dispatch",
      status: "success",
      attributes: { entrypoint },
    });
    recorder.finish("success");
    return 0;
  } catch (error) {
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
