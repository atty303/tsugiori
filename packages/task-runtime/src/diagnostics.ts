export type DiagnosticStatus = "error" | "success";

export type DiagnosticOperation = Readonly<{
  name: string;
  status: DiagnosticStatus;
  errorType?: string;
  attributes?: Readonly<Record<string, string | number | boolean>>;
}>;

export type DiagnosticRun = Readonly<{
  schemaVersion: 1;
  runId: string;
  command: string;
  startedAt: string;
  endedAt: string;
  status: DiagnosticStatus;
  completeness: "complete" | "partial";
  resource: Readonly<{
    program: "tsugiori";
    version: string;
    runtime: string;
    os: string;
    architecture: string;
  }>;
  operations: readonly DiagnosticOperation[];
}>;

export class DiagnosticRecorder {
  readonly #runId = crypto.randomUUID();
  readonly #startedAt = new Date().toISOString();
  readonly #command: string;
  readonly #version: string;
  readonly #directory: string;
  readonly #enabled: boolean;
  readonly #operations: DiagnosticOperation[] = [];

  constructor(
    command: string,
    version: string,
    directory: string,
    enabled: boolean,
  ) {
    this.#command = command;
    this.#version = version;
    this.#directory = directory;
    this.#enabled = enabled;
  }

  get runId(): string {
    return this.#runId;
  }

  operation(operation: DiagnosticOperation): void {
    this.#operations.push(Object.freeze(operation));
  }

  async finish(status: DiagnosticStatus): Promise<void> {
    if (!this.#enabled) return;
    const run: DiagnosticRun = {
      schemaVersion: 1,
      runId: this.#runId,
      command: this.#command,
      startedAt: this.#startedAt,
      endedAt: new Date().toISOString(),
      status,
      completeness: "complete",
      resource: {
        program: "tsugiori",
        version: this.#version,
        runtime: `deno ${Deno.version.deno}`,
        os: Deno.build.os,
        architecture: Deno.build.arch,
      },
      operations: Object.freeze([...this.#operations]),
    };

    try {
      await Deno.mkdir(this.#directory, { recursive: true });
      const path = joinPath(this.#directory, `${this.#runId}.json`);
      const temporary = `${path}.tmp`;
      await Deno.writeTextFile(temporary, `${JSON.stringify(run, null, 2)}\n`);
      await Deno.rename(temporary, path);
      await enforceRetention(this.#directory, 20);
    } catch (error) {
      console.error(
        `warning: diagnostic recording failed for run ${this.#runId}: ${
          errorMessage(error)
        }`,
      );
    }
  }
}

export function diagnosticsEnabled(
  flagValue: string | undefined,
): boolean {
  if (flagValue !== undefined) return flagValue !== "off";
  return Deno.env.get("TSUGIORI_DIAGNOSTICS") !== "off";
}

async function enforceRetention(
  directory: string,
  maximum: number,
): Promise<void> {
  const entries: Array<{
    path: string;
    status: DiagnosticStatus;
    endedAt: string;
  }> = [];
  for await (const entry of Deno.readDir(directory)) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const path = joinPath(directory, entry.name);
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
      // Unknown files are not owned by the recorder and are left untouched.
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

function joinPath(left: string, right: string): string {
  return `${left.replace(/\/$/, "")}/${right}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
