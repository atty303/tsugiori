import { flattenSteps } from "../github_actions/steps.ts";
/**
 * Run generation and manage consumer Action import mappings.
 *
 * Use {@link runProject} from the executable authoring entrypoint under
 * import.meta.main, with the already constructed {@link RunOptions} project and
 * that executable module's import.meta.url. A Deno task establishes Deno.cwd();
 * output paths are relative to that directory. This CLI does not execute a
 * GitHub Actions workflow. Internal task preparation commands are backend-owned
 * and are not a public contract for handwritten workflows.
 *
 * ## Generation and task preparation
 *
 * Pass the executable `workflows.ts` module's `import.meta.url` as `entrypointUrl`,
 * including when the project value is imported from another module. This URL
 * identifies the generated YAML's source and the task artifact compilation
 * entrypoint; it does not determine the project directory.
 *
 * Workflow paths are relative to Deno.cwd(). Deno tasks set that directory to
 * the task project; direct invocation must use the same directory.
 * Generation detects the checkout-relative project location from Git root for
 * local Action references and workflow task preparation. An explicit project
 * workingDirectory takes precedence and supports generation without Git.
 * Automatic detection requires permission to run Git; unresolved required
 * locations fail generation. Normal run steps and task bodies keep native defaults.
 * The project supplies imports and its lockfile. Keep top-level authoring
 * deterministic; put task work inside task run callbacks.
 *
 * Import selective subpaths through one released package mapping, as shown in
 * the getting started README. Commit the Deno lockfile. Version and lock changes
 * are outside the automatic artifact key; increase cacheVersion when they change
 * the task binary. For metadata import management see
 * [ActionContract](https://jsr.io/@atty303/tsugiori/doc/github-actions/authoring/~/ActionContract).
 *
 * Task-backed jobs include a visible `actions/cache` step by default, then
 * this release's composite preparation Action, pinned to its source commit SHA.
 * Generation uses `deno info` to compute a source key and embeds it in
 * YAML; the cache key also includes the runner's OS and architecture. Regenerate
 * and commit YAML after tracked source changes. `generate --check` detects stale
 * source keys even when the workflow structure is unchanged. Source and artifact
 * keys encode SHA-256 as 50 uppercase Base36 digits, prefixed with `S` and `A`
 * respectively.
 *
 * A restored compiled artifact verifies its embedded local-module paths and hashes
 * against the checkout, plus its manifest, binary checksum, and platform. A valid
 * hit needs no external Deno or dependency download. Changed or missing tracked
 * source stops preparation as YAML drift: regenerate and commit the workflow YAML
 * before running tasks. This conservatively rejects source changes even if they
 * would leave the workflow structure unchanged. On a cache miss, restore failure,
 * damaged artifact, or startup failure, prepare falls back to source preparation
 * only when the current source key matches YAML. A different key stops before
 * building or publishing a runtime. YAML-only edits remain the responsibility of
 * `generate --check`. Task failures belong to the subsequent task steps and are
 * not retried by preparation.
 *
 * Tsugiori source commands require Deno **2.6.0 or newer**, checked at the common
 * `runProject` entrypoint. Local commands report an insufficient version and do
 * not install Deno. Import or syntax failures on older runtimes can occur before
 * that check. CI fallback uses Deno on PATH unchanged; an insufficient version
 * fails at the same source entrypoint without automatic replacement. Only when
 * Deno is absent does it download the official ZIP at the Action's pinned version,
 * matching Tsugiori's tested development toolchain, into a temporary private directory. Preparation
 * uses that binary explicitly for all subprocesses, removes downloaded tools on
 * exit, and leaves application Deno settings, lockfiles, and later steps' PATH
 * alone. No Deno cache or runner tool-cache lookup is used.
 * A source checkout without release identity must explicitly set
 * `localTaskPrepareAction` to a checkout-relative path such as
 * `"./actions/task-prepare"` to generate task-backed workflows. Released
 * packages select their Action automatically.
 *
 * Runtime binaries are stored outside the repository in the platform cache's
 * `tsugiori/runtimes/` directory (`XDG_CACHE_HOME` overrides the base;
 * otherwise `~/Library/Caches` on macOS or `~/.cache` on Linux). The Actions
 * transport path lives under `runner.temp`. Each task receives an absolute
 * runtime path and uses `<workflow-path>/<job-id>/<task-id>` as its entrypoint.
 * An authored step ID supplies `<task-id>`; otherwise Tsugiori assigns an
 * available `task-N` within that job.
 * The binary is compiled with Deno `-A`; task artifacts support Linux and macOS
 * on X64 and ARM64. Windows task artifacts are rejected.
 *
 * The source key follows all reachable local modules, including imports outside
 * the project, using project-relative paths, artifact format, Tsugiori package
 * identity, and `cacheVersion`. Remote modules, lockfiles, and Deno settings and
 * versions remain excluded. Increase `cacheVersion` when such changes require a
 * new binary.
 *
 * Preparation and task commands retain bounded local diagnostics under
 * `<platform-cache>/tsugiori/diagnostics/` (32 recent records, failures preferred).
 * Bootstrap stage records live under `runner.temp/tsugiori-diagnostics/` (32 runs).
 * Set `TSUGIORI_DIAGNOSTICS=0` to disable recording; `RUNNER_DEBUG=1` also displays
 * command records. Records omit task inputs, outputs, environment values, and
 * raw exception messages; no remote diagnostic export is configured. Delete these
 * directories to clear diagnostics.
 *
 * ## Commands
 *
 * Run deno task tsugiori generate to write configured workflows, Actions and
 * bundled payload files; commit those outputs. Run deno task tsugiori generate
 *  --check to compare bytes without writing. --output is only accepted with
 *  --check and selects one configured output. Extra files are not removed.
 * See {@link runProject} for exit status and Action mapping commands.
 *
 * @example Given a completed project and this executable module's import.meta.url.
 * ```ts
 * if (import.meta.main) {
 *   Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });
 * }
 * ```
 * @module
 */
import { addAction } from "./actions.ts";
import { collectCompositeActions } from "../compiler/composite.ts";
import { taskEntrypointSuffixes } from "../compiler/authoring.ts";
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
  restoreTaskArtifact,
  type ToolIdentity,
} from "../task-runtime/prepare.ts";
import { requireSupportedDeno } from "../task-runtime/deno.ts";
import { computeSourceIdentity } from "../task-runtime/source.ts";
import { TSUGIORI_PACKAGE_VERSION } from "../package_identity.ts";

const SOURCE_TOOL_IDENTITY: ToolIdentity = {
  version: TSUGIORI_PACKAGE_VERSION,
};

/** Options for {@link runProject}. The project is already constructed; entrypointUrl identifies the executable module, while Deno.cwd() determines the generation directory.
 */
export type RunOptions = Readonly<{
  /** Project from project(); generation consumes this value without reimporting it.
   */
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
 * @example Given a project from project in this executable entrypoint.
 * ```ts
 * Deno.exitCode = await runProject({ project: config, entrypointUrl: import.meta.url });
 * ```
 */
export async function runProject(
  options: RunOptions,
  args: readonly string[] = Deno.args,
  tool: ToolIdentity = SOURCE_TOOL_IDENTITY,
): Promise<number> {
  try {
    requireSupportedDeno();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
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
        Object.keys(parsed.options).length !== 0
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
      const hasTasks = collectCompositeActions(source.project).some((action) =>
        flattenSteps(action.runs.steps).some((step) =>
          step.type === "task"
        )
      ) || source.project.workflows.some((workflow) =>
        workflow.jobs.some((job) =>
          flattenSteps<import("../github_actions/mod.ts").AuthoringStep>(
            job.steps,
          ).some((step) => step.type === "task")
        )
      );
      const identity = hasTasks
        ? await computeSourceIdentity({
          projectDirectory: source.projectDirectory,
          entrypointPath: source.entrypointPath,
          cacheVersion: source.project.cacheVersion,
        })
        : undefined;
      const files = await generateFiles(
        source.project,
        source.entrypointArgument,
        identity?.sourceKey ?? "unused",
        { projectDirectory: source.projectDirectory, recorder },
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
        console.log("Generated files are up to date.");
        return 0;
      }
      await writeGeneratedFiles(source.projectDirectory, files);
      recorder.operation({
        name: "workflow.generate",
        status: "success",
        attributes: { fileCount: files.length },
      });
      await recorder.finish("success");
      console.log(`Generated ${files.length} file(s).`);
      return 0;
    }

    if (isGitHubActionsTaskCommand(parsed, "restore")) {
      const runtimePath = await restoreTaskArtifact({
        project: options.project,
        expectedSourceKey: requiredOption(parsed.options, "expectedKey"),
        directory: requiredOption(parsed.options, "cacheDirectory"),
        expectedTarget: parsed.options.target,
        recorder,
      });
      await writeGitHubOutputs({ "runtime-path": runtimePath });
      await recorder.finish("success");
      console.log("Task artifact ready (cache hit).");
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
        expectedSourceKey: requiredOption(parsed.options, "expectedKey"),
        deliveryDirectory: parsed.options.cacheDirectory,
        rebuild: parsed.options.rebuild === "true",
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
      "Usage: deno run -A <entrypoint-file> generate [--check [--output <path>]] | actions add <uses> | github-actions task prepare",
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
    // Restore status 3 is terminal drift; status 2 permits source fallback.
    return isGitHubActionsTaskCommand(parsed, "restore")
      ? errorType === "source_drift" ? 3 : 2
      : 1;
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
        const taskSuffixes = taskEntrypointSuffixes(job.steps);
        let ordinal = 0;
        for (
          const step of flattenSteps<
            import("../github_actions/mod.ts").AuthoringStep
          >(job.steps)
        ) {
          if (step.type !== "task") continue;
          const taskSuffix = taskSuffixes[ordinal++];
          if (typeof step.run !== "function") {
            throw new TaskRuntimeError(
              "schema_invalid",
              "Task step does not contain a function.",
            );
          }
          if (`${workflow.path}/${job.id}/${taskSuffix}` === entrypoint) {
            task = step;
          }
        }
      }
    }
    for (const action of collectCompositeActions(project)) {
      const taskSuffixes = taskEntrypointSuffixes(action.runs.steps);
      let ordinal = 0;
      for (const step of flattenSteps(action.runs.steps)) {
        if (step.type !== "task") continue;
        const taskSuffix = taskSuffixes[ordinal++];
        if (`${action.path}/composite/${taskSuffix}` === entrypoint) {
          task = step;
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
    await recorder.finish("success");
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
    await recorder.finish("error");
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
}>;

function parseArguments(args: readonly string[]): ParsedArguments {
  const command: string[] = [];
  const options: Record<string, string | undefined> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      command.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    const rawName = argument.slice(2, equals < 0 ? undefined : equals);
    if (
      rawName !== "expected-key" && rawName !== "cache-directory" &&
      rawName !== "target" &&
      rawName !== "check" && rawName !== "rebuild" && rawName !== "output"
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
    if (name === "check" || name === "rebuild") {
      if (equals >= 0) {
        throw new TaskRuntimeError(
          "usage_invalid",
          `Option --${rawName} takes no value.`,
        );
      }
      options[name] = "true";
      continue;
    }
    const value = equals >= 0 ? argument.slice(equals + 1) : args[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new TaskRuntimeError(
        "usage_invalid",
        `Option --${rawName} requires a value.`,
      );
    }
    options[name] = value;
  }
  return { command, options };
}

function isGitHubActionsTaskCommand(
  parsed: ParsedArguments,
  operation: "restore" | "prepare",
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
