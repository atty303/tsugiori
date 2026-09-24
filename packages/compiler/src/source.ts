import type { TsugioriConfig } from "@tsugiori/core";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

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
  rootDirectory: string;
}>;

export type DenoConfigurationSource = Readonly<{
  path: string;
  content: string;
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

  const denoConfig = await firstExisting(
    resolve(rootDirectory, "deno.json"),
    resolve(rootDirectory, "deno.jsonc"),
  );
  if (denoConfig !== undefined) {
    await localDenoConfigurationSources(rootDirectory, denoConfig);
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
    if (denoConfig !== undefined) args.push("--config", denoConfig);
    if (await exists(resolve(rootDirectory, "deno.lock"))) {
      args.push("--frozen=true");
    }
    args.push(inspector, toFileUrl(absolutePath), output);
    const result = await new Deno.Command("deno", {
      args,
      cwd: rootDirectory,
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
      rootDirectory,
    };
  } finally {
    await Deno.remove(temporary, { recursive: true });
  }
}

export async function localDenoConfigurationSources(
  rootDirectory: string,
  configPath: string,
): Promise<readonly DenoConfigurationSource[]> {
  const sources: DenoConfigurationSource[] = [];
  const visited = new Set<string>();

  async function visit(path: string): Promise<void> {
    const absolute = resolve(path);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    try {
      const content = await Deno.readTextFile(absolute);
      sources.push({
        path: relative(rootDirectory, absolute).split(sep).join("/"),
        content,
      });
      const parsed = JSON.parse(
        stripJsonCommentsAndTrailingCommas(content),
      ) as { extends?: unknown };
      const extended = typeof parsed.extends === "string"
        ? [parsed.extends]
        : Array.isArray(parsed.extends) &&
            parsed.extends.every((value) => typeof value === "string")
        ? parsed.extends as string[]
        : [];
      for (const specifier of extended) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
          throw new SourceLoadError(
            `Deno configuration extends must use local paths: ${specifier}`,
          );
        }
        await visit(resolve(dirname(absolute), specifier));
      }
    } catch (error) {
      if (error instanceof SourceLoadError) throw error;
      throw new SourceLoadError(
        `Failed to load Deno configuration ${
          JSON.stringify(relative(rootDirectory, absolute))
        }: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  await visit(configPath);
  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

function stripJsonCommentsAndTrailingCommas(source: string): string {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
        output += current;
      }
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!inString && current === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (!inString && current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    output += current;
    if (inString && current === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (current === '"' && !escaped) inString = !inString;
    escaped = false;
  }
  let withoutTrailingCommas = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const current = output[index];
    if (!inString && current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(output[lookahead] ?? "")) lookahead += 1;
      if (output[lookahead] === "}" || output[lookahead] === "]") continue;
    }
    withoutTrailingCommas += current;
    if (inString && current === "\\" && !escaped) {
      escaped = true;
      continue;
    }
    if (current === '"' && !escaped) inString = !inString;
    escaped = false;
  }
  return withoutTrailingCommas;
}

async function firstExisting(
  ...paths: readonly string[]
): Promise<string | undefined> {
  for (const path of paths) if (await exists(path)) return path;
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function toFileUrl(path: string): string {
  const normalized = path.split(sep).join("/");
  return encodeURI(
    `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`,
  );
}
