import { resolve } from "node:path";
import { taskCacheDirectory } from "./cache.ts";

export type DiagnosticStatus = "error" | "success";

export type DiagnosticOperation = Readonly<{
  name: string;
  status: DiagnosticStatus;
  errorType?: string;
  observedAt?: string;
  durationMs?: number;
  attributes?: Readonly<Record<string, string | number | boolean>>;
}>;

export type DiagnosticRun = Readonly<{
  schemaVersion: 1;
  runId: string;
  command: string;
  parentRunId?: string;
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
  #dropped = false;

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
    if (!this.#enabled) return;
    if (this.#operations.length >= 64) {
      this.#dropped = true;
      return;
    }
    this.#operations.push(
      Object.freeze({ ...operation, observedAt: new Date().toISOString() }),
    );
  }

  async finish(status: DiagnosticStatus): Promise<void> {
    if (!this.#enabled) return;
    const run: DiagnosticRun = {
      schemaVersion: 1,
      runId: this.#runId,
      command: this.#command,
      ...(/^bootstrap-[0-9]+$/.test(
          Deno.env.get("TSUGIORI_DIAGNOSTIC_PARENT") ?? "",
        )
        ? { parentRunId: Deno.env.get("TSUGIORI_DIAGNOSTIC_PARENT") }
        : {}),
      startedAt: this.#startedAt,
      endedAt: new Date().toISOString(),
      status,
      completeness: this.#dropped ? "partial" : "complete",
      resource: {
        program: "tsugiori",
        version: this.#version,
        runtime: `deno ${Deno.version.deno}`,
        os: Deno.build.os,
        architecture: Deno.build.arch,
      },
      operations: Object.freeze([...this.#operations]),
    };

    if (Deno.env.get("RUNNER_DEBUG") === "1") {
      console.error(JSON.stringify(run));
    }
    try {
      const directory = resolve(taskCacheDirectory(), "diagnostics");
      await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
      const path = resolve(directory, `${this.#runId}.json`);
      await Deno.writeTextFile(path, JSON.stringify(run), { mode: 0o600 });
      const records: { path: string; time: number; failed: boolean }[] = [];
      for await (const entry of Deno.readDir(directory)) {
        if (!entry.isFile || !/^[0-9a-f-]+\.json$/.test(entry.name)) continue;
        const file = resolve(directory, entry.name);
        try {
          const previous = JSON.parse(
            await Deno.readTextFile(file),
          ) as DiagnosticRun;
          records.push({
            path: file,
            time: Date.parse(previous.endedAt),
            failed: previous.status === "error",
          });
        } catch { /* A concurrent eviction does not affect the invocation. */ }
      }
      records.sort((a, b) =>
        Number(b.failed) - Number(a.failed) || b.time - a.time
      );
      for (const record of records.slice(32)) {
        try {
          await Deno.remove(record.path);
        } catch { /* Concurrent eviction. */ }
      }
    } catch {
      console.error("warning: Tsugiori diagnostic recording unavailable.");
    }
  }
}

export function diagnosticsEnabled(): boolean {
  return Deno.env.get("TSUGIORI_DIAGNOSTICS") !== "0";
}
