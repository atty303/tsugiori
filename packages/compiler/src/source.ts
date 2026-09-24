import type { TsugioriConfig } from "../../core/src/mod.ts";
import { isAbsolute, relative, resolve, sep } from "node:path";

const INSPECTOR_SOURCE = `const [configUrl, outputPath] = Deno.args;
const loaded = await import(configUrl);
const config = loaded.default;
if (config?.kind !== "tsugiori.config" || !Array.isArray(config.pipelines)) {
  throw new Error("The configuration default export must be created by defineTsugiori().");
}
const cacheVersion = config.cacheVersion ?? 1;
if (!Number.isSafeInteger(cacheVersion) || cacheVersion <= 0) {
  throw new TypeError("Cache version must be a positive safe integer.");
}
const isPlainRecord = (value) => typeof value === "object" && value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const encodeScalarRecord = (value) => {
  if (!isPlainRecord(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return null;
  const encoded = Object.create(null);
  for (const key of keys) {
    const item = value[key];
    encoded[key] = typeof item === "string" || typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item))
      ? item
      : null;
  }
  return encoded;
};
const serializable = {
  kind: config.kind,
  cacheVersion,
  pipelines: config.pipelines.map((pipeline) => ({
    id: pipeline.id,
    name: pipeline.name,
    output: pipeline.output,
    events: pipeline.events,
    pushBranches: pipeline.pushBranches,
    concurrency: pipeline.concurrency,
    ...(pipeline.permissions === undefined ? {} : {
      permissions: encodeScalarRecord(pipeline.permissions),
    }),
    jobs: pipeline.jobs.map((job) => ({
      id: job.id,
      runsOn: job.runsOn,
      needs: job.needs,
      if: job.if,
      timeoutMinutes: job.timeoutMinutes,
      environment: job.environment,
      outputs: job.outputs,
      strategy: job.strategy,
      concurrency: job.concurrency,
      steps: job.steps.map((step) => {
        if (step.type === "task") return { type: step.type, id: step.id, name: step.name, task: null, env: step.env };
        if (step.type === "uses" && step.with !== undefined) {
          return {
            type: step.type,
            name: step.name,
            id: step.id,
            uses: step.uses,
            with: encodeScalarRecord(step.with),
            if: step.if,
            env: step.env,
          };
        }
        return step.type === "uses"
          ? { type: step.type, name: step.name, uses: step.uses, id: step.id, if: step.if, env: step.env }
          : { type: step.type, name: step.name, run: step.run, id: step.id, if: step.if, env: step.env, workingDirectory: step.workingDirectory };
      }),
    })),
  })),
};
await Deno.writeTextFile(
  outputPath,
  JSON.stringify(serializable),
);
`;

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

export async function loadConfig(
  configArgument: string,
  rootDirectory = Deno.cwd(),
): Promise<LoadedConfig> {
  const absolutePath = resolve(rootDirectory, configArgument);
  const relativePath = relative(rootDirectory, absolutePath);
  if (
    relativePath === ".." || relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new SourceLoadError(
      "The configuration file must be inside the project root.",
    );
  }

  const temporary = resolve(
    rootDirectory,
    `.tsugiori/load/${crypto.randomUUID()}`,
  );
  await Deno.mkdir(temporary, { recursive: true });
  try {
    const inspector = resolve(temporary, "inspect.ts");
    const output = resolve(temporary, "config.json");
    await Deno.writeTextFile(inspector, INSPECTOR_SOURCE);
    const args = [
      "run",
      "--allow-read",
      `--allow-write=${output}`,
      "--allow-import",
    ];
    args.push("--frozen=true");
    args.push(inspector, toFileUrl(absolutePath), output);
    const result = await new Deno.Command("deno", {
      args,
      cwd: Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!result.success) {
      const stderr = new TextDecoder().decode(result.stderr).trim();
      throw new SourceLoadError(
        stderr.length > 0
          ? stderr
          : `Configuration inspection failed with ${result.code}.`,
      );
    }
    const config = JSON.parse(
      await Deno.readTextFile(output),
    ) as TsugioriConfig;
    return {
      config,
      absolutePath,
      argument: `./${relativePath.split(sep).join("/")}`,
      projectArgument:
        relative(rootDirectory, Deno.cwd()).split(sep).join("/") || ".",
      rootDirectory,
    };
  } finally {
    await Deno.remove(temporary, { recursive: true });
  }
}

function toFileUrl(path: string): string {
  const normalized = path.split(sep).join("/");
  return encodeURI(
    `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`,
  );
}
