import type { TaskArtifactManifest } from "./artifact.ts";

export function createTaskRuntimeBootstrap(
  configUrl: string,
  manifest: Omit<TaskArtifactManifest, "binarySha256">,
): string {
  return `import config from ${JSON.stringify(configUrl)};

type Status = "error" | "success";
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
type RecordedEntry = { path: string; status: Status; endedAt: string };

const manifest = ${JSON.stringify(manifest)};
const runId = crypto.randomUUID();
const startedAt = new Date().toISOString();
const entrypoint = Deno.args[0];
let status: Status = "success";
let errorType: string | undefined;

try {
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
  errorType = errorTypeFrom(
    error,
    entrypoint === undefined ? "runtime_error" : "task_failed",
  );
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(\`tsugiori diagnostic run: \${runId}\`);
  Deno.exitCode = 1;
} finally {
  await recordDiagnostic({ status, errorType, entrypoint });
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

function typedError(errorType: string, message: string): Error & { errorType: string } {
  const error = new Error(message) as Error & { errorType: string };
  error.errorType = errorType;
  return error;
}

function errorTypeFrom(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const candidate = error as { errorType?: unknown };
  return typeof candidate.errorType === "string" ? candidate.errorType : fallback;
}

async function recordDiagnostic(input: {
  status: Status;
  errorType: string | undefined;
  entrypoint: string | undefined;
}): Promise<void> {
  const { status, errorType, entrypoint } = input;
  if (Deno.env.get("TSUGIORI_DIAGNOSTICS") === "off") return;
  const directory = \`\${Deno.cwd()}/.tsugiori/diagnostics\`;
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
  try {
    await Deno.mkdir(directory, { recursive: true });
    const path = \`\${directory}/\${runId}.json\`;
    await Deno.writeTextFile(\`\${path}.tmp\`, \`\${JSON.stringify(record, null, 2)}\\n\`);
    await Deno.rename(\`\${path}.tmp\`, path);
    await enforceRetention(directory, 20);
  } catch (error) {
    console.error(\`warning: diagnostic recording failed for run \${runId}: \${error instanceof Error ? error.message : String(error)}\`);
  }
}

async function enforceRetention(directory: string, maximum: number): Promise<void> {
  const entries: RecordedEntry[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const path = \`\${directory}/\${entry.name}\`;
    try {
      const parsed = JSON.parse(await Deno.readTextFile(path)) as {
        status?: unknown;
        endedAt?: unknown;
      };
      entries.push({
        path,
        status: parsed.status === "error" ? "error" : "success",
        endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : "",
      });
    } catch {
      // Preserve files that are not valid recorder output.
    }
  }
  entries.sort((left, right) =>
    Number(left.status === "error") - Number(right.status === "error") ||
    left.endedAt.localeCompare(right.endedAt)
  );
  for (const entry of entries.slice(0, Math.max(0, entries.length - maximum))) {
    await Deno.remove(entry.path);
  }
}
`;
}
