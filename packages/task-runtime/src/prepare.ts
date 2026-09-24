import type { TsugioriConfig } from "../../core/src/mod.ts";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { lowerConfig } from "../../compiler/src/authoring.ts";
import {
  sha256File,
  sourceArtifactKey,
  TASK_ARTIFACT_FORMAT_VERSION,
  type TaskArtifactManifest,
  TaskRuntimeError,
} from "./artifact.ts";
import { createTaskRuntimeBootstrap } from "./bootstrap.ts";
import { TSUGIORI_PACKAGE_IDENTITY } from "../../core/src/package_identity.ts";
import { LocalTaskArtifactCache, removeIfPresent } from "./cache.ts";
import type { DiagnosticRecorder } from "./diagnostics.ts";

export type ToolIdentity = Readonly<{
  version: string;
}>;

export type PrepareOptions = Readonly<{
  rootDirectory: string;
  projectDirectory: string;
  configPath: string;
  configArgument: string;
  config: TsugioriConfig;
  expectedLayouts: readonly string[];
  expectedArtifactKey?: string;
  target?: string;
  tool: ToolIdentity;
  recorder: DiagnosticRecorder;
}>;

export type PrepareResult = Readonly<{
  artifactKey: string;
  cache: "hit" | "miss";
  cacheWriteRequired: boolean;
  manifest: TaskArtifactManifest;
}>;

export type TaskArtifactPlan = Readonly<{
  artifactKey: string;
  denoVersion: string;
  target: string;
  entrypoints: readonly string[];
}>;

export async function resolveTaskArtifact(
  options: PrepareOptions,
): Promise<TaskArtifactPlan> {
  const lowered = await lowerConfig(
    options.config,
    options.configArgument,
    relative(options.rootDirectory, options.projectDirectory),
  );
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
  const entrypoints = lowered.tasks.map((task) => task.entrypoint);
  const artifactKey = await computeArtifactKey({
    rootDirectory: options.rootDirectory,
    projectDirectory: options.projectDirectory,
    configPath: options.configPath,
    target,
    cacheVersion: options.config.cacheVersion,
  });
  options.recorder.operation({
    name: "artifact.key",
    status: "success",
    attributes: { artifactKey, target },
  });
  return { artifactKey, denoVersion, target, entrypoints };
}

export async function prepareTaskArtifact(
  options: PrepareOptions,
): Promise<PrepareResult> {
  const plan = await resolveTaskArtifact(options);
  if (
    options.expectedArtifactKey !== undefined &&
    options.expectedArtifactKey !== plan.artifactKey
  ) {
    throw new TaskRuntimeError(
      "artifact_key_mismatch",
      "The task artifact inputs changed after the cache key was resolved.",
    );
  }

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
    let restore: "hit" | "miss" | "failed";
    try {
      restore = await cache.restore(plan.artifactKey, restoredDirectory);
    } catch {
      options.recorder.operation({
        name: "cache.restore",
        status: "error",
        errorType: "cache_restore_failed",
        attributes: { artifactKey: plan.artifactKey },
      });
      await removeIfPresent(restoredDirectory);
      restore = "failed";
    }
    if (restore === "hit") {
      try {
        const manifest = await validateArtifact(
          restoredDirectory,
          plan.artifactKey,
        );
        await materializeArtifact(
          restoredDirectory,
          tsugioriDirectory,
          manifest,
        );
        options.recorder.operation({
          name: "cache.restore",
          status: "success",
          attributes: { result: "hit", artifactKey: plan.artifactKey },
        });
        return {
          artifactKey: plan.artifactKey,
          cache: "hit",
          cacheWriteRequired: false,
          manifest,
        };
      } catch {
        options.recorder.operation({
          name: "cache.restore",
          status: "error",
          errorType: "cache_corrupt",
          attributes: { artifactKey: plan.artifactKey },
        });
        await removeIfPresent(restoredDirectory);
      }
    } else if (restore === "miss") {
      options.recorder.operation({
        name: "cache.restore",
        status: "success",
        attributes: { result: "miss", artifactKey: plan.artifactKey },
      });
    }

    const builtDirectory = resolve(workDirectory, "built");
    const manifest = await buildArtifact({
      ...options,
      outputDirectory: builtDirectory,
      artifactKey: plan.artifactKey,
      denoVersion: plan.denoVersion,
      target: plan.target,
      entrypoints: plan.entrypoints,
    });
    options.recorder.operation({
      name: "artifact.build",
      status: "success",
      attributes: { artifactKey: plan.artifactKey, target: plan.target },
    });

    let cacheWriteRequired = false;
    try {
      await cache.store(plan.artifactKey, builtDirectory);
      cacheWriteRequired = true;
      options.recorder.operation({
        name: "cache.store",
        status: "success",
        attributes: { artifactKey: plan.artifactKey },
      });
    } catch (error) {
      console.error(
        `warning: task artifact cache store failed: ${errorMessage(error)}`,
      );
      options.recorder.operation({
        name: "cache.store",
        status: "error",
        errorType: "cache_store_failed",
        attributes: { artifactKey: plan.artifactKey },
      });
    }

    await materializeArtifact(builtDirectory, tsugioriDirectory, manifest);
    return {
      artifactKey: plan.artifactKey,
      cache: "miss",
      cacheWriteRequired,
      manifest,
    };
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
        `Generated workflow task layout is stale for ${key}. Run the consumer's generate task.`,
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
    schemaVersion: 2 as const,
    artifactKey: options.artifactKey,
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    target: options.target,
    denoVersion: options.denoVersion,
    tsugioriVersion: options.tool.version,
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
  args.push("--frozen=true");
  args.push(bootstrap);
  await runDeno(args, options.projectDirectory, "artifact_build_failed");
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
    manifest.schemaVersion !== 2 || manifest.artifactKey !== expectedKey ||
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
    projectDirectory: string;
    configPath: string;
    target: string;
    cacheVersion: number;
  }>,
): Promise<string> {
  const args = ["info", "--json", "--frozen=true", input.configPath];
  const output = await runDeno(
    args,
    input.projectDirectory,
    "module_graph_failed",
  );
  const graph = JSON.parse(output) as {
    modules?: readonly { local?: string; specifier?: string }[];
  };
  const modulePaths = new Map<string, string>();
  for (const module of graph.modules ?? []) {
    if (module.local === undefined || !module.specifier?.startsWith("file:")) {
      continue;
    }
    const path = resolve(module.local);
    const relativePath = relative(input.rootDirectory, path);
    if (!isRepositoryLocalPath(relativePath)) continue;
    modulePaths.set(relativePath.split(sep).join("/"), path);
  }
  const modules = [];
  for (
    const [relativePath, path] of [...modulePaths].sort(([left], [right]) =>
      left.localeCompare(right)
    )
  ) {
    modules.push({
      path: relativePath,
      sha256: await sha256File(path),
    });
  }
  return await sourceArtifactKey({
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    cacheVersion: input.cacheVersion,
    modules,
    target: input.target,
    tsugioriPackage: TSUGIORI_PACKAGE_IDENTITY,
  });
}

function isRepositoryLocalPath(path: string): boolean {
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
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

function toFileUrl(path: string): string {
  const normalized = path.split(sep).join("/");
  return encodeURI(
    `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
