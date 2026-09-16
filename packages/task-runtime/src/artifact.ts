export const TASK_ARTIFACT_FORMAT_VERSION = "1";

export type TaskArtifactManifest = Readonly<{
  schemaVersion: 1;
  artifactKey: string;
  artifactFormatVersion: string;
  target: string;
  denoVersion: string;
  tsugioriVersion: string;
  tsugioriBuildId: string;
  invocationPath: "./.tsugiori/task-runtime";
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

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
