export type TaskLogger = Readonly<{
  info: (...values: readonly unknown[]) => void;
  warn: (...values: readonly unknown[]) => void;
  error: (...values: readonly unknown[]) => void;
}>;

const valueType: unique symbol = Symbol("tsugiori.value-type");
export type ValueContract<T, Kind extends "text" | "json" = "text" | "json"> =
  Readonly<{
    kind: Kind;
    parse: (value: unknown) => T;
    [valueType]: T;
  }>;
export type ContractValue<C> = C extends ValueContract<infer T> ? T : never;
export type OutputDefinitions = Readonly<
  Record<
    string,
    Readonly<{
      contract: ValueContract<unknown>;
      required: boolean;
    }>
  >
>;
export type InputDefinitions = Readonly<
  Record<
    string,
    Readonly<{
      contract: ValueContract<unknown>;
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
export type OutputValues<O extends OutputDefinitions> = {
  readonly [K in keyof O]: ContractValue<O[K]["contract"]>;
};
export type InputValues<
  I extends InputDefinitions,
  Proof extends string = never,
> = {
  readonly [K in keyof I]:
    | ContractValue<I[K]["contract"]>
    | Missing<I[K]["from"], Proof>;
};
export type TaskContext<
  I extends InputDefinitions = Record<never, never>,
  O extends OutputDefinitions = Record<never, never>,
  Proof extends string = never,
> = Readonly<{
  cwd: string;
  logger: TaskLogger;
  inputs: InputValues<I, Proof>;
  outputs: Readonly<{
    set: <K extends keyof O & string>(
      name: K,
      value: OutputValues<O>[K],
    ) => Promise<void>;
  }>;
}>;

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
