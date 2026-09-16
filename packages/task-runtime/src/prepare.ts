import type { TsugioriConfig } from "@tsugiori/core";
import { relative, resolve, sep } from "node:path";
import { lowerConfig } from "../../compiler/src/authoring.ts";
import { localDenoConfigurationSources } from "../../compiler/src/source.ts";
import {
  sha256Bytes,
  sha256File,
  TASK_ARTIFACT_FORMAT_VERSION,
  type TaskArtifactManifest,
  TaskRuntimeError,
} from "./artifact.ts";
import { createTaskRuntimeBootstrap } from "./bootstrap.ts";
import { LocalTaskArtifactCache, removeIfPresent } from "./cache.ts";
import type { DiagnosticRecorder } from "./diagnostics.ts";

export type ToolIdentity = Readonly<{
  version: string;
  buildId: string;
}>;

export type PrepareOptions = Readonly<{
  rootDirectory: string;
  configPath: string;
  configArgument: string;
  config: TsugioriConfig;
  expectedLayouts: readonly string[];
  target?: string;
  tool: ToolIdentity;
  recorder: DiagnosticRecorder;
}>;

export type PrepareResult = Readonly<{
  artifactKey: string;
  cache: "hit" | "miss";
  manifest: TaskArtifactManifest;
}>;

export async function prepareTaskArtifact(
  options: PrepareOptions,
): Promise<PrepareResult> {
  const lowered = await lowerConfig(options.config, options.configArgument);
  validateExpectedLayouts(options.expectedLayouts, lowered.layoutFingerprints);
  options.recorder.operation({
    name: "task.registry",
    status: "success",
    attributes: { entrypointCount: lowered.tasks.length },
  });

  if (lowered.tasks.length === 0) {
    throw new TaskRuntimeError(
      "task_registry_empty",
      "The configuration does not contain any task-backed steps.",
    );
  }

  const denoVersion = await readDenoVersion(options.rootDirectory);
  const target = options.target ?? Deno.build.target;
  if (target.includes("windows")) {
    throw new TaskRuntimeError(
      "target_unsupported",
      "Windows task artifacts are not supported by the initial invocation contract.",
    );
  }
  const artifactKey = await computeArtifactKey({
    rootDirectory: options.rootDirectory,
    configPath: options.configPath,
    denoVersion,
    target,
    tool: options.tool,
    entrypoints: lowered.tasks.map((task) => task.entrypoint),
  });
  options.recorder.operation({
    name: "artifact.key",
    status: "success",
    attributes: { artifactKey, target },
  });

  const tsugioriDirectory = resolve(options.rootDirectory, ".tsugiori");
  const cache = new LocalTaskArtifactCache(
    resolve(tsugioriDirectory, "cache/artifacts"),
  );
  const workDirectory = resolve(
    tsugioriDirectory,
    `build/${crypto.randomUUID()}`,
  );
  const restoredDirectory = resolve(workDirectory, "restored");
  await Deno.mkdir(workDirectory, { recursive: true });
  try {
    const restore = await cache.restore(artifactKey, restoredDirectory);
    if (restore === "hit") {
      try {
        const manifest = await validateArtifact(restoredDirectory, artifactKey);
        await materializeArtifact(
          restoredDirectory,
          tsugioriDirectory,
          manifest,
        );
        options.recorder.operation({
          name: "cache.restore",
          status: "success",
          attributes: { result: "hit", artifactKey },
        });
        return { artifactKey, cache: "hit", manifest };
      } catch {
        options.recorder.operation({
          name: "cache.restore",
          status: "error",
          errorType: "cache_corrupt",
          attributes: { artifactKey },
        });
        await removeIfPresent(restoredDirectory);
      }
    } else {
      options.recorder.operation({
        name: "cache.restore",
        status: "success",
        attributes: { result: "miss", artifactKey },
      });
    }

    const builtDirectory = resolve(workDirectory, "built");
    const manifest = await buildArtifact({
      ...options,
      outputDirectory: builtDirectory,
      artifactKey,
      denoVersion,
      target,
      entrypoints: lowered.tasks.map((task) => task.entrypoint),
    });
    options.recorder.operation({
      name: "artifact.build",
      status: "success",
      attributes: { artifactKey, target },
    });

    try {
      await cache.store(artifactKey, builtDirectory);
      options.recorder.operation({
        name: "cache.store",
        status: "success",
        attributes: { artifactKey },
      });
    } catch (error) {
      console.error(
        `warning: task artifact cache store failed: ${errorMessage(error)}`,
      );
      options.recorder.operation({
        name: "cache.store",
        status: "error",
        errorType: "cache_store_failed",
        attributes: { artifactKey },
      });
    }

    await materializeArtifact(builtDirectory, tsugioriDirectory, manifest);
    return { artifactKey, cache: "miss", manifest };
  } finally {
    await removeIfPresent(workDirectory);
  }
}

function validateExpectedLayouts(
  expected: readonly string[],
  current: ReadonlyMap<string, string>,
): void {
  for (const value of expected) {
    const separator = value.indexOf("=");
    if (separator < 1) {
      throw new TaskRuntimeError(
        "layout_expectation_invalid",
        `Invalid layout expectation ${JSON.stringify(value)}.`,
      );
    }
    const key = value.slice(0, separator);
    const fingerprint = value.slice(separator + 1);
    if (current.get(key) !== fingerprint) {
      throw new TaskRuntimeError(
        "registry_layout_mismatch",
        `Generated workflow task layout is stale for ${key}. Run tsugiori generate.`,
      );
    }
  }
}

async function buildArtifact(
  options:
    & PrepareOptions
    & Readonly<{
      outputDirectory: string;
      artifactKey: string;
      denoVersion: string;
      target: string;
      entrypoints: readonly string[];
    }>,
): Promise<TaskArtifactManifest> {
  await Deno.mkdir(options.outputDirectory, { recursive: true });
  const binary = resolve(options.outputDirectory, "task-runtime");
  const manifestWithoutChecksum = {
    schemaVersion: 1 as const,
    artifactKey: options.artifactKey,
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    target: options.target,
    denoVersion: options.denoVersion,
    tsugioriVersion: options.tool.version,
    tsugioriBuildId: options.tool.buildId,
    invocationPath: "./.tsugiori/task-runtime" as const,
    entrypoints: [...options.entrypoints].sort(),
  };
  const bootstrap = resolve(options.outputDirectory, "bootstrap.ts");
  await Deno.writeTextFile(
    bootstrap,
    createTaskRuntimeBootstrap(
      toFileUrl(options.configPath),
      manifestWithoutChecksum,
    ),
  );

  const args = ["compile", "-A", "--output", binary];
  if (options.target !== Deno.build.target) {
    args.push("--target", options.target);
  }
  const denoConfig = await firstExisting(
    resolve(options.rootDirectory, "deno.json"),
    resolve(options.rootDirectory, "deno.jsonc"),
  );
  if (denoConfig !== undefined) args.push("--config", denoConfig);
  if (await exists(resolve(options.rootDirectory, "deno.lock"))) {
    args.push("--frozen=true");
  }
  args.push(bootstrap);
  await runDeno(args, options.rootDirectory, "artifact_build_failed");
  await Deno.chmod(binary, 0o755);
  await Deno.remove(bootstrap);

  const manifest: TaskArtifactManifest = {
    ...manifestWithoutChecksum,
    binarySha256: await sha256File(binary),
  };
  await Deno.writeTextFile(
    resolve(options.outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

async function materializeArtifact(
  source: string,
  tsugioriDirectory: string,
  manifest: TaskArtifactManifest,
): Promise<void> {
  await Deno.mkdir(tsugioriDirectory, { recursive: true });
  const runtime = resolve(tsugioriDirectory, "task-runtime");
  const metadata = resolve(tsugioriDirectory, "task-runtime.json");
  await Deno.copyFile(resolve(source, "task-runtime"), runtime);
  await Deno.chmod(runtime, 0o755);
  await Deno.writeTextFile(metadata, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function validateArtifact(
  directory: string,
  expectedKey: string,
): Promise<TaskArtifactManifest> {
  const manifest = JSON.parse(
    await Deno.readTextFile(resolve(directory, "manifest.json")),
  ) as TaskArtifactManifest;
  if (
    manifest.schemaVersion !== 1 || manifest.artifactKey !== expectedKey ||
    manifest.artifactFormatVersion !== TASK_ARTIFACT_FORMAT_VERSION
  ) {
    throw new TaskRuntimeError(
      "cache_corrupt",
      "Invalid task artifact manifest.",
    );
  }
  const checksum = await sha256File(resolve(directory, "task-runtime"));
  if (checksum !== manifest.binarySha256) {
    throw new TaskRuntimeError(
      "cache_corrupt",
      "Task artifact checksum mismatch.",
    );
  }
  return manifest;
}

async function computeArtifactKey(
  input: Readonly<{
    rootDirectory: string;
    configPath: string;
    denoVersion: string;
    target: string;
    tool: ToolIdentity;
    entrypoints: readonly string[];
  }>,
): Promise<string> {
  const denoConfig = await firstExisting(
    resolve(input.rootDirectory, "deno.json"),
    resolve(input.rootDirectory, "deno.jsonc"),
  );
  const args = ["info", "--json"];
  if (denoConfig !== undefined) args.push("--config", denoConfig);
  const lockPath = resolve(input.rootDirectory, "deno.lock");
  if (await exists(lockPath)) args.push("--frozen=true");
  args.push(input.configPath);
  const output = await runDeno(
    args,
    input.rootDirectory,
    "module_graph_failed",
  );
  const graph = JSON.parse(output) as {
    modules?: readonly { local?: string }[];
  };
  const localModules = (graph.modules ?? [])
    .flatMap((module) => module.local === undefined ? [] : [module.local])
    .sort();
  const modules = [];
  for (const path of localModules) {
    modules.push({
      path: relative(input.rootDirectory, path).split(sep).join("/"),
      sha256: await sha256File(path),
    });
  }
  const lockSha256 = await exists(lockPath) ? await sha256File(lockPath) : null;
  const denoConfiguration = denoConfig === undefined
    ? []
    : await configurationSources(input.rootDirectory, denoConfig);
  const canonical = JSON.stringify({
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    compilePermissions: "all",
    denoConfiguration,
    denoVersion: input.denoVersion,
    entrypoints: [...input.entrypoints].sort(),
    lockSha256,
    modules,
    target: input.target,
    tsugioriBuildId: input.tool.buildId,
    tsugioriVersion: input.tool.version,
  });
  return `sha256-${await sha256Bytes(new TextEncoder().encode(canonical))}`;
}

async function configurationSources(
  rootDirectory: string,
  configPath: string,
): Promise<readonly Readonly<{ path: string; sha256: string }>[]> {
  return await Promise.all(
    (await localDenoConfigurationSources(rootDirectory, configPath)).map(
      async (source) => ({
        path: source.path,
        sha256: await sha256Bytes(new TextEncoder().encode(source.content)),
      }),
    ),
  );
}

async function readDenoVersion(rootDirectory: string): Promise<string> {
  const output = await runDeno(
    ["--version"],
    rootDirectory,
    "deno_unavailable",
  );
  return output.split("\n", 1)[0]?.trim() ?? "unknown";
}

async function runDeno(
  args: readonly string[],
  cwd: string,
  errorType: string,
): Promise<string> {
  const result = await new Deno.Command("deno", {
    args: [...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(result.stdout);
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new TaskRuntimeError(
      errorType,
      stderr.length > 0
        ? stderr
        : `deno ${args[0]} failed with ${result.code}.`,
    );
  }
  return stdout;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
