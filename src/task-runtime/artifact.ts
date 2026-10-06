export const TASK_ARTIFACT_FORMAT_VERSION = "4";

export type TaskArtifactManifest = Readonly<{
  schemaVersion: 4;
  sourceKey: string;
  artifactKey: string;
  artifactFormatVersion: string;
  target: string;
  denoVersion: string;
  tsugioriVersion: string;
  entrypoints: readonly string[];
  binarySha256: string;
}>;

export class TaskRuntimeError extends Error {
  readonly errorType: string;

  constructor(errorType: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TaskRuntimeError";
    this.errorType = errorType;
  }
}

export async function sha256Bytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data).buffer,
  );
  return toHex(new Uint8Array(digest));
}

export async function sha256File(path: string): Promise<string> {
  return await sha256Bytes(await Deno.readFile(path));
}

export async function sourceArtifactKey(
  input: Readonly<{
    artifactFormatVersion: string;
    cacheVersion: number;
    modules: readonly Readonly<{ path: string; sha256: string }>[];
    tsugioriPackage: string;
  }>,
): Promise<string> {
  const canonical = JSON.stringify({
    artifactFormatVersion: input.artifactFormatVersion,
    cacheVersion: input.cacheVersion,
    modules: input.modules,
    tsugioriPackage: input.tsugioriPackage,
  });
  return `sha256-${await sha256Bytes(new TextEncoder().encode(canonical))}`;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type SourceIdentity = Readonly<{
  sourceKey: string;
  modules: readonly Readonly<{ path: string; sha256: string }>[];
}>;

export type EmbeddedArtifact =
  & SourceIdentity
  & Readonly<{
    target: string;
    entrypointArgument: string;
  }>;

export const ARTIFACT_METADATA_SYMBOL = "tsugiori.task-artifact.v4";

export function embeddedArtifact(): EmbeddedArtifact | undefined {
  return Deno.build.standalone
    ? Reflect.get(globalThis, Symbol.for(ARTIFACT_METADATA_SYMBOL))
    : undefined;
}

export function artifactKey(sourceKey: string, target: string): string {
  if (
    !/^sha256-[a-f0-9]{64}$/.test(sourceKey) ||
    !/^(x86_64|aarch64)-(apple-darwin|unknown-linux-gnu)$/.test(target)
  ) {
    throw new TaskRuntimeError(
      "artifact_identity_invalid",
      "Invalid task artifact source key or target.",
    );
  }
  return `${sourceKey}-${target}`;
}
