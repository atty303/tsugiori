import { resolve } from "node:path";

const directory = resolve(".release/diagnostics");
type Stage =
  | "build"
  | "validate"
  | "archive_read"
  | "registry_read"
  | "registry_publish"
  | "registry_verify"
  | "fnox_exec"
  | "worker_secret_prepare"
  | "worker_upload"
  | "worker_build"
  | "tag_reserve"
  | "release_create"
  | "asset_upload"
  | "release_verify";

/** Bounded local records contain only stages, timings and error classes. */
export class Recording {
  readonly id = crypto.randomUUID();
  readonly #directory: string;
  constructor(store = directory) {
    this.#directory = store;
  }
  readonly #enabled = Deno.env.get("RELEASE_DIAGNOSTICS") !== "off";
  readonly #run = {
    id: this.id,
    resource: "tsugiori.release/v1",
    started: Date.now(),
    status: "running",
    completeness: "partial",
    operations: [] as {
      name: Stage;
      durationMs: number;
      status: string;
      errorType?: string;
    }[],
  };
  async save(): Promise<void> {
    if (!this.#enabled) return;
    try {
      await Deno.mkdir(this.#directory, { recursive: true, mode: 0o700 });
      const path = `${this.#directory}/${this.id}.json`;
      await Deno.writeTextFile(
        `${path}.tmp`,
        JSON.stringify(this.#run) + "\n",
        { mode: 0o600 },
      );
      await Deno.rename(`${path}.tmp`, path);
      const records = [];
      for await (const entry of Deno.readDir(this.#directory)) {
        if (entry.name.endsWith(".json")) {
          const value = JSON.parse(
            await Deno.readTextFile(`${this.#directory}/${entry.name}`),
          );
          records.push({
            name: entry.name,
            failed: value.status !== "ok",
            started: value.started,
          });
        }
      }
      records.sort((a, b) =>
        Number(b.failed) - Number(a.failed) || b.started - a.started
      );
      for (const record of records.slice(32)) {
        await Deno.remove(`${this.#directory}/${record.name}`);
      }
    } catch {
      console.error("Release diagnostic recording unavailable");
    }
  }
  async operation<T>(name: Stage, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    let status = "ok";
    let errorType: string | undefined;
    try {
      return await fn();
    } catch (error) {
      status = "error";
      errorType = error instanceof DOMException && error.name === "TimeoutError"
        ? "timeout"
        : "operation_failed";
      throw error;
    } finally {
      if (this.#enabled) {
        if (this.#run.operations.length < 32) {
          this.#run.operations.push({
            name,
            durationMs: performance.now() - start,
            status,
            ...(errorType ? { errorType } : {}),
          });
        } else this.#run.completeness = "dropped";
        await this.save();
      }
    }
  }
  async finish(status: "ok" | "error"): Promise<void> {
    this.#run.status = status;
    if (this.#run.completeness !== "dropped") {
      this.#run.completeness = "complete";
    }
    await this.save();
  }
}

export async function main(
  fn: (record: Recording) => Promise<void>,
): Promise<void> {
  const record = new Recording();
  await record.save();
  try {
    await fn(record);
    await record.finish("ok");
  } catch (error) {
    await record.finish("error");
    console.error(
      `Release failed (diagnostic ${record.id}):`,
      error instanceof Error ? error.message : "unknown error",
    );
    Deno.exitCode = 1;
  }
}

if (import.meta.main) {
  if (Deno.args[0] === "clear") {
    await Deno.remove(directory, { recursive: true }).catch((error) => {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
    });
  } else if (Deno.args[0] === "list") {
    try {
      for await (const entry of Deno.readDir(directory)) {
        if (entry.name.endsWith(".json")) {
          console.log(await Deno.readTextFile(`${directory}/${entry.name}`));
        }
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  } else throw new Error("Expected list or clear");
}
