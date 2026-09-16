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
  readonly #enabled: boolean;
  readonly #operations: DiagnosticOperation[] = [];

  constructor(
    command: string,
    version: string,
    enabled: boolean,
  ) {
    this.#command = command;
    this.#version = version;
    this.#enabled = enabled;
  }

  get runId(): string {
    return this.#runId;
  }

  operation(operation: DiagnosticOperation): void {
    this.#operations.push(Object.freeze(operation));
  }

  finish(status: DiagnosticStatus): void {
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

    console.error(JSON.stringify(run));
  }
}

export function diagnosticsEnabled(): boolean {
  return Deno.env.get("RUNNER_DEBUG") === "1";
}
