import { generateFiles } from "../../compiler/src/generator.ts";
import { loadConfig } from "../../compiler/src/source.ts";
import { writeGeneratedFiles } from "../../compiler/src/write.ts";
import { TaskRuntimeError } from "../../task-runtime/src/artifact.ts";
import {
  DiagnosticRecorder,
  diagnosticsEnabled,
} from "../../task-runtime/src/diagnostics.ts";
import {
  prepareTaskArtifact,
  type ToolIdentity,
} from "../../task-runtime/src/prepare.ts";

const SOURCE_TOOL_IDENTITY: ToolIdentity = {
  version: "0.1.0-dev",
  buildId: "source",
};

export async function main(
  args: readonly string[],
  tool: ToolIdentity = SOURCE_TOOL_IDENTITY,
): Promise<number> {
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
      const configArgument = requiredOption(parsed.options, "config");
      const loaded = await loadConfig(configArgument);
      recorder.operation({ name: "source.load", status: "success" });
      const files = await generateFiles(loaded.config, loaded.argument);
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

    if (
      parsed.command.length === 2 && parsed.command[0] === "task" &&
      parsed.command[1] === "prepare"
    ) {
      const configArgument = requiredOption(parsed.options, "config");
      const loaded = await loadConfig(configArgument);
      recorder.operation({ name: "source.load", status: "success" });
      const result = await prepareTaskArtifact({
        rootDirectory: loaded.rootDirectory,
        configPath: loaded.absolutePath,
        configArgument: loaded.argument,
        config: loaded.config,
        expectedLayouts: parsed.multipleOptions.expectLayout ?? [],
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
      "Usage: tsugiori generate --config <file> | tsugiori task prepare --config <file> [--expect-layout <job=fingerprint>] [--target <target>]",
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
      rawName !== "config" && rawName !== "expect-layout" &&
      rawName !== "target"
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

if (import.meta.main) {
  Deno.exitCode = await main(Deno.args);
}
