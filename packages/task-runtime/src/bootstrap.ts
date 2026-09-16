import type { TaskArtifactManifest } from "./artifact.ts";

export function createTaskRuntimeBootstrap(
  configUrl: string,
  manifest: Omit<TaskArtifactManifest, "binarySha256">,
): string {
  return `type Status = "error" | "success";
type TaskFunction = (context: {
  cwd: string;
  logger: {
    info: (...values: unknown[]) => void;
    warn: (...values: unknown[]) => void;
    error: (...values: unknown[]) => void;
  };
}) => void | Promise<void>;
type RuntimeStep = { type: string; task?: TaskFunction };
type RuntimeJob = { id: string; steps?: RuntimeStep[] };
type RuntimePipeline = { id: string; jobs?: RuntimeJob[] };
type RuntimeConfig = { kind?: unknown; pipelines?: unknown };
const manifest = ${JSON.stringify(manifest)};
const runId = crypto.randomUUID();
const startedAt = new Date().toISOString();
const diagnosticsEnabled = Deno.env.get("RUNNER_DEBUG") === "1";
const entrypoint = Deno.args[0];
let status: Status = "success";
let errorType: string | undefined;
let fallbackErrorType = "config_load_failed";
const typedErrorTypes = new WeakMap<object, string>();
const getTypedErrorType = typedErrorTypes.get.bind(typedErrorTypes);
const setTypedErrorType = typedErrorTypes.set.bind(typedErrorTypes);
const RuntimeError = Error;

try {
  const config = (await import(${JSON.stringify(configUrl)})).default;
  if (entrypoint === undefined) {
    throw typedError("entrypoint_missing", "A task entrypoint is required.");
  }
  const tasks = collectTasks(config as unknown);
  const task = tasks.get(entrypoint);
  if (task === undefined) {
    throw typedError(
      "entrypoint_not_found",
      \`Unknown task entrypoint \${JSON.stringify(entrypoint)}.\`,
    );
  }
  fallbackErrorType = "task_failed";
  await task({
    cwd: Deno.cwd(),
    logger: {
      info: (...values: unknown[]) => console.log(...values),
      warn: (...values: unknown[]) => console.warn(...values),
      error: (...values: unknown[]) => console.error(...values),
    },
  });
} catch (error) {
  status = "error";
  errorType = errorTypeFrom(error, fallbackErrorType);
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  Deno.exitCode = 1;
} finally {
  emitDiagnostic({ status, errorType, entrypoint });
}

function collectTasks(root: unknown): Map<string, TaskFunction> {
  if (typeof root !== "object" || root === null) {
    throw typedError("schema_invalid", "Invalid Tsugiori configuration.");
  }
  const candidate = root as RuntimeConfig;
  if (candidate.kind !== "tsugiori.config" || !Array.isArray(candidate.pipelines)) {
    throw typedError("schema_invalid", "Invalid Tsugiori configuration.");
  }
  const tasks = new Map<string, TaskFunction>();
  for (const pipeline of candidate.pipelines as RuntimePipeline[]) {
    for (const job of pipeline.jobs ?? []) {
      let ordinal = 0;
      for (const step of job.steps ?? []) {
        if (step.type !== "task") continue;
        if (typeof step.task !== "function") {
          throw typedError("schema_invalid", "Task step does not contain a function.");
        }
        ordinal += 1;
        tasks.set(
          \`\${pipeline.id}/\${job.id}/task-\${ordinal}\`,
          step.task,
        );
      }
    }
  }
  return tasks;
}

function typedError(errorType: string, message: string): Error {
  const error = new RuntimeError(message);
  setTypedErrorType(error, errorType);
  return error;
}

function errorTypeFrom(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  return getTypedErrorType(error) ?? fallback;
}

function emitDiagnostic(input: {
  status: Status;
  errorType: string | undefined;
  entrypoint: string | undefined;
}): void {
  const { status, errorType, entrypoint } = input;
  if (!diagnosticsEnabled) return;
  const operation = {
    name: "task.dispatch",
    status,
    ...(errorType === undefined ? {} : { errorType }),
    attributes: entrypoint === undefined ? {} : { entrypoint },
  };
  const record = {
    schemaVersion: 1,
    runId,
    command: "task.dispatch",
    startedAt,
    endedAt: new Date().toISOString(),
    status,
    completeness: "complete",
    resource: {
      program: "tsugiori-task-runtime",
      version: manifest.tsugioriVersion,
      runtime: \`deno \${Deno.version.deno}\`,
      os: Deno.build.os,
      architecture: Deno.build.arch,
    },
    operations: [operation],
  };
  console.error(JSON.stringify(record));
}
`;
}
