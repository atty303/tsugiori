export type Operation =
  | "request"
  | "cache_read"
  | "cache_write"
  | "resolve_ref"
  | "fetch_metadata"
  | "generate";
export type DiagnosticRun = Readonly<{
  id: string;
  resource: "tsugiori.type-service/v1";
  started: number;
  status: "ok" | "error";
  completeness: "complete" | "partial";
  operations: readonly Readonly<
    {
      id: number;
      parentId?: number;
      name: Operation;
      durationMs: number;
      status: "ok" | "error";
      errorType?: string;
    }
  >[];
}>;

/** Isolate-local rolling recording; no exporter or public diagnostic route. */
export class Diagnostics {
  #runs: DiagnosticRun[] = [];
  readonly #capacity: number;
  constructor(capacity = 128) {
    this.#capacity = capacity;
  }
  list(): readonly DiagnosticRun[] {
    return structuredClone(this.#runs);
  }
  clear(): void {
    this.#runs = [];
  }
  delete(id: string): void {
    this.#runs = this.#runs.filter((run) => run.id !== id);
  }
  begin(enabled = true): Recording {
    return new Recording(
      enabled
        ? (run) => {
          this.#runs.push(run);
          if (this.#runs.length > this.#capacity) {
            const success = this.#runs.findIndex((entry) =>
              entry.status === "ok"
            );
            this.#runs.splice(success < 0 ? 0 : success, 1);
          }
        }
        : undefined,
    );
  }
}
export class Recording {
  readonly #save?: (run: DiagnosticRun) => void;
  readonly #started = Date.now();
  readonly id = crypto.randomUUID();
  #operations: DiagnosticRun["operations"][number][] = [];
  #partial = false;
  #parent: number | undefined;
  #nextId = 0;
  constructor(save?: (run: DiagnosticRun) => void) {
    this.#save = save;
  }
  async operation<T>(name: Operation, fn: () => Promise<T> | T): Promise<T> {
    if (!this.#save) return await fn();
    const id = this.#nextId++;
    const parentId = this.#parent;
    this.#parent = id;
    const start = performance.now();
    let status: "ok" | "error" = "ok";
    let errorType: string | undefined;
    try {
      return await fn();
    } catch (error) {
      status = "error";
      errorType =
        typeof error === "object" && error !== null && "code" in error &&
          typeof error.code === "string"
          ? error.code
          : "internal_error";
      throw error;
    } finally {
      this.#parent = parentId;
      if (this.#operations.length < 32) {
        this.#operations.push({
          id,
          ...(parentId === undefined ? {} : { parentId }),
          name,
          durationMs: performance.now() - start,
          status,
          ...(errorType ? { errorType } : {}),
        });
      } else this.#partial = true;
    }
  }
  finish(status: "ok" | "error"): void {
    try {
      this.#save?.({
        id: this.id,
        resource: "tsugiori.type-service/v1",
        started: this.#started,
        status,
        completeness: this.#partial ? "partial" : "complete",
        operations: this.#operations,
      });
    } catch { /* Recording must not affect HTTP results. */ }
  }
}
