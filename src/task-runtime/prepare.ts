import type { ProjectConfig } from "../github_actions/mod.ts";
import { dirname, resolve } from "node:path";
import { lowerProject } from "../compiler/authoring.ts";
import {
  ARTIFACT_METADATA_SYMBOL,
  artifactKey,
  embeddedArtifact,
  sha256File,
  type SourceIdentity,
  TASK_ARTIFACT_FORMAT_VERSION,
  type TaskArtifactManifest,
  TaskRuntimeError,
} from "./artifact.ts";
import { computeSourceIdentity } from "./source.ts";
import { runDeno } from "./deno.ts";
import {
  copyDirectory,
  LocalTaskArtifactCache,
  removeIfPresent,
  taskCacheDirectory,
} from "./cache.ts";
import type { DiagnosticRecorder } from "./diagnostics.ts";

export type ToolIdentity = Readonly<{
  version: string;
}>;

export type PrepareOptions = Readonly<{
  projectDirectory: string;
  entrypointPath: string;
  entrypointArgument: string;
  project: ProjectConfig;
  expectedSourceKey: string;
  deliveryDirectory?: string;
  rebuild?: boolean;
  target?: string;
  tool: ToolIdentity;
  recorder: DiagnosticRecorder;
}>;

export type PrepareResult = Readonly<{
  artifactKey: string;
  cache: "hit" | "miss";
  manifest: TaskArtifactManifest;
  runtimePath: string;
}>;

export type TaskArtifactPlan = Readonly<{
  artifactKey: string;
  source: SourceIdentity;
  denoVersion: string;
  target: string;
  entrypoints: readonly string[];
}>;

export async function planTaskArtifact(
  options: PrepareOptions,
): Promise<TaskArtifactPlan> {
  const target = options.target ?? Deno.build.target;
  const graphStarted = performance.now();
  const source = await computeSourceIdentity({
    projectDirectory: options.projectDirectory,
    entrypointPath: options.entrypointPath,
    cacheVersion: options.project.cacheVersion,
  });
  const key = artifactKey(source.sourceKey, target);
  options.recorder.operation({
    name: "artifact.key",
    durationMs: performance.now() - graphStarted,
    status: "success",
    attributes: { artifactKey: key, target },
  });
  if (options.expectedSourceKey !== source.sourceKey) {
    throw new TaskRuntimeError(
      "source_drift",
      "Generated workflow source key is stale. Regenerate and commit the workflow YAML before running tasks.",
    );
  }

  const registryStarted = performance.now();
  const lowered = await lowerProject(
    options.project,
    options.entrypointArgument,
  );
  options.recorder.operation({
    name: "task.registry",
    durationMs: performance.now() - registryStarted,
    status: "success",
    attributes: { entrypointCount: lowered.tasks.length },
  });

  if (lowered.tasks.length === 0) {
    throw new TaskRuntimeError(
      "task_registry_empty",
      "The project does not contain any task-backed steps.",
    );
  }

  const denoVersion = await readDenoVersion(options.projectDirectory);
  if (target.includes("windows")) {
    throw new TaskRuntimeError(
      "target_unsupported",
      "Windows task artifacts are not supported by the initial invocation contract.",
    );
  }
  const entrypoints = lowered.tasks.map((task) => task.entrypoint);
  return { artifactKey: key, source, denoVersion, target, entrypoints };
}

export async function prepareTaskArtifact(
  options: PrepareOptions,
): Promise<PrepareResult> {
  const plan = await planTaskArtifact(options);
  let rejectedChecksum: string | undefined;
  if (options.rebuild) {
    rejectedChecksum = "unknown";
  }
  if (options.rebuild && options.deliveryDirectory !== undefined) {
    try {
      rejectedChecksum = await sha256File(
        resolve(options.deliveryDirectory, "task-runtime"),
      );
    } catch {
      /* Unreadable failed binaries cannot be reused by checksum validation either. */
    }
  }
  if (rejectedChecksum !== undefined && rejectedChecksum !== "unknown") {
    await rejectArtifact(
      artifactKey(
        options.expectedSourceKey,
        options.target ?? Deno.build.target,
      ),
      rejectedChecksum,
    );
  }
  const tsugioriDirectory = taskCacheDirectory();
  const runtimeDirectory = resolve(
    tsugioriDirectory,
    "runtimes",
    plan.artifactKey,
  );
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
      restore = options.rebuild
        ? "miss"
        : await cache.restore(plan.artifactKey, restoredDirectory);
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
          plan.target,
        );
        const runtimePath = await materializeArtifact(
          restoredDirectory,
          runtimeDirectory,
          plan.artifactKey,
          plan.target,
        );
        await deliverArtifact(options, restoredDirectory);
        options.recorder.operation({
          name: "cache.restore",
          status: "success",
          attributes: { result: "hit", artifactKey: plan.artifactKey },
        });
        return {
          artifactKey: plan.artifactKey,
          cache: "hit",
          manifest,
          runtimePath,
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
    const buildStarted = performance.now();
    const manifest = await buildArtifact({
      ...options,
      outputDirectory: builtDirectory,
      artifactKey: plan.artifactKey,
      source: plan.source,
      denoVersion: plan.denoVersion,
      target: plan.target,
      entrypoints: plan.entrypoints,
    });
    options.recorder.operation({
      name: "artifact.build",
      durationMs: performance.now() - buildStarted,
      status: "success",
      attributes: { artifactKey: plan.artifactKey, target: plan.target },
    });

    try {
      await cache.store(plan.artifactKey, builtDirectory);
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

    await deliverArtifact(options, builtDirectory);
    const runtimePath = await materializeArtifact(
      builtDirectory,
      runtimeDirectory,
      plan.artifactKey,
      plan.target,
      rejectedChecksum,
    );
    return {
      artifactKey: plan.artifactKey,
      cache: "miss",
      manifest,
      runtimePath,
    };
  } finally {
    await removeIfPresent(workDirectory);
  }
}

async function buildArtifact(
  options:
    & PrepareOptions
    & Readonly<{
      outputDirectory: string;
      artifactKey: string;
      source: SourceIdentity;
      denoVersion: string;
      target: string;
      entrypoints: readonly string[];
    }>,
): Promise<TaskArtifactManifest> {
  await Deno.mkdir(options.outputDirectory, { recursive: true });
  const binary = resolve(options.outputDirectory, "task-runtime");
  const manifestWithoutChecksum = {
    schemaVersion: 4 as const,
    sourceKey: options.source.sourceKey,
    artifactKey: options.artifactKey,
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    target: options.target,
    denoVersion: options.denoVersion,
    tsugioriVersion: options.tool.version,
    entrypoints: [...options.entrypoints].sort(),
  };
  const preload = resolve(options.outputDirectory, "metadata.ts");
  // Computed before creating this module; generated metadata never hashes itself.
  await Deno.writeTextFile(
    preload,
    `Object.defineProperty(globalThis, Symbol.for(${
      JSON.stringify(ARTIFACT_METADATA_SYMBOL)
    }), { value: ${
      JSON.stringify({
        ...options.source,
        target: options.target,
        entrypointArgument: options.entrypointArgument,
      })
    } });\n`,
  );
  const args = ["compile", "-A", "--preload", preload, "--output", binary];
  if (options.target !== Deno.build.target) {
    args.push("--target", options.target);
  }
  args.push("--frozen=true", options.entrypointPath);
  await runDeno(args, options.projectDirectory, "artifact_build_failed");
  await Deno.remove(preload);
  await Deno.chmod(binary, 0o755);

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
  runtimeDirectory: string,
  artifactKey: string,
  target: string,
  rejectedChecksum?: string,
): Promise<string> {
  let destination = runtimeDirectory;
  try {
    const existing = await validateArtifact(
      runtimeDirectory,
      artifactKey,
      target,
    );
    if (
      (rejectedChecksum === "unknown" ||
        existing.binarySha256 === rejectedChecksum)
    ) {
      await rejectArtifact(artifactKey, existing.binarySha256);
      throw new TaskRuntimeError(
        "artifact_start_failed",
        "Published task artifact failed to start.",
      );
    }
    return resolve(runtimeDirectory, "task-runtime");
  } catch {
    try {
      await Deno.stat(runtimeDirectory);
      // Retain the old path for existing readers, even when its contents are invalid.
      destination = `${runtimeDirectory}.recovery-${crypto.randomUUID()}`;
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  await Deno.mkdir(dirname(destination), { recursive: true });
  const staging = `${destination}.tmp-${crypto.randomUUID()}`;
  try {
    await copyDirectory(source, staging);
    await Deno.chmod(resolve(staging, "task-runtime"), 0o755);
    try {
      // Once published, a key's runtime stays in place for all current readers.
      await Deno.rename(staging, destination);
    } catch (error) {
      // A concurrent publisher may have won. Reuse only a complete valid entry.
      try {
        await validateArtifact(destination, artifactKey, target);
      } catch {
        throw error;
      }
    }
    return resolve(destination, "task-runtime");
  } finally {
    await removeIfPresent(staging);
  }
}

async function validateArtifact(
  directory: string,
  expectedKey: string,
  target: string,
): Promise<TaskArtifactManifest> {
  const manifest = JSON.parse(
    await Deno.readTextFile(resolve(directory, "manifest.json")),
  ) as TaskArtifactManifest;
  if (
    manifest.schemaVersion !== 4 || manifest.artifactKey !== expectedKey ||
    manifest.artifactFormatVersion !== TASK_ARTIFACT_FORMAT_VERSION ||
    manifest.target !== target || !/^[a-f0-9]{64}$/.test(manifest.binarySha256)
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
  if (await rejectedArtifact(expectedKey, manifest.binarySha256)) {
    throw new TaskRuntimeError(
      "artifact_start_failed",
      "This task artifact previously failed to start.",
    );
  }
  return manifest;
}

function rejectionPath(key: string, checksum: string): string {
  return resolve(taskCacheDirectory(), "runtimes/.rejected", key, checksum);
}

async function rejectArtifact(key: string, checksum: string): Promise<void> {
  const path = rejectionPath(key, checksum);
  await Deno.mkdir(dirname(path), { recursive: true });
  // This marker is outside published runtimes; their binaries stay immutable.
  await Deno.writeTextFile(path, "", { mode: 0o600 });
}

async function rejectedArtifact(
  key: string,
  checksum: string,
): Promise<boolean> {
  try {
    await Deno.stat(rejectionPath(key, checksum));
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function readDenoVersion(projectDirectory: string): Promise<string> {
  const output = await runDeno(
    ["--version"],
    projectDirectory,
    "deno_unavailable",
  );
  return output.split("\n", 1)[0]?.trim() ?? "unknown";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function deliverArtifact(
  options: PrepareOptions,
  source: string,
): Promise<void> {
  if (options.deliveryDirectory === undefined) return;
  const staging = `${options.deliveryDirectory}.tmp-${crypto.randomUUID()}`;
  try {
    await copyDirectory(source, staging);
    await removeIfPresent(options.deliveryDirectory);
    await Deno.rename(staging, options.deliveryDirectory);
  } finally {
    await removeIfPresent(staging);
  }
}

/** Called only by the restored executable. Never resolves a graph or starts Deno. */
export async function restoreTaskArtifact(
  options: Readonly<{
    project: ProjectConfig;
    expectedSourceKey: string;
    directory: string;
    expectedTarget?: string;
    recorder: DiagnosticRecorder;
  }>,
): Promise<string> {
  const metadata = embeddedArtifact();
  if (
    metadata === undefined ||
    metadata.sourceKey !== options.expectedSourceKey ||
    metadata.target !== Deno.build.target ||
    (options.expectedTarget !== undefined &&
      metadata.target !== options.expectedTarget)
  ) {
    throw new TaskRuntimeError(
      "cache_corrupt",
      "Incompatible task artifact metadata.",
    );
  }
  const key = artifactKey(metadata.sourceKey, metadata.target);
  const manifest = await validateArtifact(
    options.directory,
    key,
    metadata.target,
  );
  for (const module of metadata.modules) {
    let matches = false;
    try {
      matches =
        await sha256File(resolve(Deno.cwd(), module.path)) === module.sha256;
    } catch {
      /* Missing or unreadable tracked source cannot establish consistency. */
    }
    if (!matches) {
      throw new TaskRuntimeError(
        "source_drift",
        "Tracked task artifact source changed or is missing. Regenerate and commit the workflow YAML before running tasks.",
      );
    }
  }
  const lowered = await lowerProject(
    options.project,
    metadata.entrypointArgument,
  );
  if (
    manifest.sourceKey !== metadata.sourceKey ||
    JSON.stringify(manifest.entrypoints) !==
      JSON.stringify(lowered.tasks.map((task) => task.entrypoint).sort())
  ) {
    throw new TaskRuntimeError(
      "cache_corrupt",
      "Invalid task artifact registry manifest.",
    );
  }
  options.recorder.operation({ name: "artifact.validate", status: "success" });
  return await materializeArtifact(
    options.directory,
    resolve(taskCacheDirectory(), "runtimes", key),
    key,
    metadata.target,
  );
}
