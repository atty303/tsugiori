/** Messages emitted by the task during runner execution.
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */
export type TaskLogger = Readonly<{
  /** Writes an informational task message.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   name: "Report",
   *   inputs: {},
   *   outputs: {},
   *   run: ({ logger }) => {
   *     logger.info("Release status");
   *   },
   * });
   * ```
   */
  info: (...values: readonly unknown[]) => void;
  /** Writes a task warning.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   name: "Report",
   *   inputs: {},
   *   outputs: {},
   *   run: ({ logger }) => {
   *     logger.warn("Release status");
   *   },
   * });
   * ```
   */
  warn: (...values: readonly unknown[]) => void;
  /** Writes a task error message.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   name: "Report",
   *   inputs: {},
   *   outputs: {},
   *   run: ({ logger }) => {
   *     logger.error("Release status");
   *   },
   * });
   * ```
   */
  error: (...values: readonly unknown[]) => void;
}>;

const valueType: unique symbol = Symbol("tsugiori.value-type");
/** Text or JSON validation shared by task input readers and output writers.
 * @example
 * ```ts
 * const stages = jsonValue({
 *   parse(value: unknown): readonly string[] {
 *     if (
 *       !Array.isArray(value) || !value.every((item) => typeof item === "string")
 *     ) {
 *       throw new TypeError("Expected stage names");
 *     }
 *     return value;
 *   },
 * });
 * ```
 */
export type ValueContract<T, Kind extends "text" | "json" = "text" | "json"> =
  Readonly<{
    /** The serialization format selected by textValue() or jsonValue().
     * @example
     * ```ts
     * const text = textValue();
     * const kind = text.kind;
     * ```
     */
    kind: Kind;
    /** Validates native values; a JSON parser must preserve the input shape.
     * @example
     * ```ts
     * const stages = jsonValue({
     *   parse(value: unknown): readonly string[] {
     *     if (
     *       !Array.isArray(value) || !value.every((item) => typeof item === "string")
     *     ) {
     *       throw new TypeError("Expected stage names");
     *     }
     *     return value;
     *   },
     * });
     * ```
     */
    parse: (value: unknown) => T;
    [valueType]: T;
  }>;
/** The native TypeScript value inferred from a contract.
 * @example
 * ```ts
 * const text = textValue();
 * type Text = ContractValue<typeof text>;
 * const value: Text = "release";
 * ```
 */
export type ContractValue<C> = C extends ValueContract<infer T> ? T : never;
/** Named task output contracts, with required writes enforced at runtime.
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */
export type OutputDefinitions = Readonly<
  Record<
    string,
    Readonly<{
      /** The same contract object can be reused by the producing and consuming tasks.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").task({
       *   id: "version",
       *   name: "Read version",
       *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
       *   outputs: { version: { contract: textValue(), required: true } },
       *   run: async ({ inputs, outputs, logger }) => {
       *     logger.info(inputs.sha);
       *     await outputs.set("version", "1.0.0");
       *   },
       * });
       * ```
       */
      contract: ValueContract<unknown>;
      /** Whether this task must write the output when it executes.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").task({
       *   id: "version",
       *   name: "Read version",
       *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
       *   outputs: { version: { contract: textValue(), required: true } },
       *   run: async ({ inputs, outputs, logger }) => {
       *     logger.info(inputs.sha);
       *     await outputs.set("version", "1.0.0");
       *   },
       * });
       * ```
       */
      required: boolean;
    }>
  >
>;
/** Task inputs pair validation with a GitHub runtime expression source.
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */
export type InputDefinitions = Readonly<
  Record<
    string,
    Readonly<{
      /** Validates the native task input value.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").task({
       *   id: "version",
       *   name: "Read version",
       *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
       *   outputs: { version: { contract: textValue(), required: true } },
       *   run: async ({ inputs, outputs, logger }) => {
       *     logger.info(inputs.sha);
       *     await outputs.set("version", "1.0.0");
       *   },
       * });
       * ```
       */
      contract: ValueContract<unknown>;
      /** The source expression evaluated by GitHub before task execution.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").task({
       *   id: "version",
       *   name: "Read version",
       *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
       *   outputs: { version: { contract: textValue(), required: true } },
       *   run: async ({ inputs, outputs, logger }) => {
       *     logger.info(inputs.sha);
       *     await outputs.set("version", "1.0.0");
       *   },
       * });
       * ```
       */
      from: unknown;
    }>
  >
>;
type SourceValue<S> = S extends (...args: never[]) => infer R ? R : S;
type Missing<S, Proof extends string> = SourceValue<S> extends
  import("../github_actions/expression.ts").TypedReference<
    unknown,
    ValueContract<unknown>,
    infer Path extends string,
    infer Required extends boolean
  > ? Required extends true ? never : Path extends Proof ? never : null
  : never;
/** Native output values inferred from declared contracts.
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */
export type OutputValues<O extends OutputDefinitions> = {
  readonly [K in keyof O]: ContractValue<O[K]["contract"]>;
};
/** Native input values; unguarded optional sources also allow null.
 * @example
 * ```ts
 * const stages = jsonValue({
 *   parse(value: unknown): readonly string[] {
 *     if (
 *       !Array.isArray(value) || !value.every((item) => typeof item === "string")
 *     ) {
 *       throw new TypeError("Expected stage names");
 *     }
 *     return value;
 *   },
 * });
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job("prepare", ({ job }) =>
 *   job.runsOn("ubuntu-latest").task({
 *     id: "plan",
 *     name: "Plan",
 *     inputs: {},
 *     outputs: { stages: { contract: stages, required: false } },
 *     run: async ({ outputs }) => {
 *       await outputs.set("stages", ["dev", "prd"]);
 *     },
 *   }).outputs(({ steps }) => ({ stages: steps.plan.outputs.stages })))
 *   .job(
 *     "deploy",
 *     ({ job, jobs }) =>
 *       job.needs(jobs.prepare).runsOn("ubuntu-latest")
 *         .when(({ needs }) => present(needs.prepare.outputs.stages))
 *         .strategy(({ needs }) => ({
 *           matrix: { stage: fromJSON(needs.prepare.outputs.stages) },
 *         }))
 *         .task({
 *           name: "Deploy",
 *           inputs: {
 *             stage: {
 *               contract: textValue(),
 *               from: ({ matrix }) => matrix.stage,
 *             },
 *           },
 *           outputs: {},
 *           run: ({ inputs, logger }) => {
 *             logger.info(inputs.stage);
 *           },
 *         }),
 *   );
 * ```
 */
export type InputValues<
  I extends InputDefinitions,
  Proof extends string = never,
> = {
  readonly [K in keyof I]:
    | ContractValue<I[K]["contract"]>
    | Missing<I[K]["from"], Proof>;
};
/** Task callbacks receive native inputs and an asynchronous output writer.
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */
export type TaskContext<
  I extends InputDefinitions = Record<never, never>,
  O extends OutputDefinitions = Record<never, never>,
  Proof extends string = never,
> = Readonly<{
  /** The native step working directory during task execution.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   name: "Read configuration",
   *   inputs: {},
   *   outputs: {},
   *   run: ({ cwd, logger }) => {
   *     logger.info(Deno.readTextFileSync(`${cwd}/deno.json`));
   *   },
   * });
   * ```
   */
  cwd: string;
  /** Task logging during runner execution.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  logger: TaskLogger;
  /** Parsed input values; these are host values in run, not expression nodes.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  inputs: InputValues<I, Proof>;
  /** Output writes are asynchronous and must complete before the task returns.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  outputs: Readonly<{
    /** Validates and writes a declared native output; await each write.
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").task({
     *   id: "version",
     *   name: "Read version",
     *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
     *   outputs: { version: { contract: textValue(), required: true } },
     *   run: async ({ inputs, outputs, logger }) => {
     *     logger.info(inputs.sha);
     *     await outputs.set("version", "1.0.0");
     *   },
     * });
     * ```
     */
    set: <K extends keyof O & string>(
      name: K,
      value: OutputValues<O>[K],
    ) => Promise<void>;
  }>;
}>;

/** Non-empty text contract. Empty text and top-level null are reserved for omitted values.
 * @example
 * ```ts
 * const version = textValue();
 * version.parse("1.0.0");
 * ```
 */
export function textValue(): ValueContract<string, "text"> {
  return Object.freeze({
    kind: "text" as const,
    parse: (value: unknown): string => {
      if (typeof value !== "string" || value.length === 0) {
        throw new TypeError("Text value must be a non-empty string.");
      }
      return value;
    },
    [valueType]: undefined as unknown as string,
  });
}

/** JSON contract using a consumer-owned parser that preserves the JSON shape.
 * @example
 * ```ts
 * const stages = jsonValue({
 *   parse(value: unknown): readonly string[] {
 *     if (
 *       !Array.isArray(value) || !value.every((item) => typeof item === "string")
 *     ) {
 *       throw new TypeError("Expected stage names");
 *     }
 *     return value;
 *   },
 * });
 * ```
 */
export function jsonValue<T>(
  schema: Readonly<{ parse(value: unknown): T }>,
): ValueContract<T, "json"> {
  return Object.freeze({
    kind: "json" as const,
    parse: (value: unknown): T => {
      if (!isJsonValue(value)) {
        throw new TypeError(
          "JSON value must be serializable without data loss.",
        );
      }
      const snapshot: unknown = JSON.parse(JSON.stringify(value));
      const parsed = schema.parse(value);
      if (
        parsed === null || !isJsonValue(parsed) || !sameJson(snapshot, parsed)
      ) {
        throw new TypeError(
          "JSON parser must preserve the input shape and cannot produce top-level null.",
        );
      }
      return parsed;
    },
    [valueType]: undefined as unknown as T,
  });
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? Object.keys(value).length === value.length &&
      value.every((entry) => isJsonValue(entry, seen))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return valid;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (
    left === null || right === null || typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return left === right &&
      (left === null || typeof left !== "number" || Number.isFinite(left));
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]));
  }
  if (
    Object.getPrototypeOf(left) !== Object.prototype ||
    Object.getPrototypeOf(right) !== Object.prototype
  ) return false;
  const keys = Object.keys(left as object);
  return keys.length === Object.keys(right as object).length &&
    keys.every((key) =>
      Object.hasOwn(right, key) &&
      sameJson(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      )
    );
}

export function parseWireValue<T>(
  contract: ValueContract<T>,
  wire: string,
): T | null {
  if (wire === "") return null;
  const value = contract.kind === "json" ? JSON.parse(wire) : wire;
  if (value === null) {
    throw new TypeError("Top-level null is reserved for an omitted value.");
  }
  return contract.parse(value);
}

export function serializeValue<T>(
  contract: ValueContract<T>,
  value: T,
): string {
  if (value === null) {
    throw new TypeError("Top-level null is reserved for an omitted value.");
  }
  const parsed = contract.parse(value);
  if (contract.kind === "text") return parsed as string;
  const wire = JSON.stringify(parsed);
  if (wire === undefined) throw new TypeError("Output is not a JSON value.");
  return wire;
}
