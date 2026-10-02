import {
  type GitHubExpressionScopeKey,
  githubExpressionScopes,
} from "./expression_scope.ts";
import type { ValueContract } from "../task/mod.ts";

const expressionBrand = Symbol("tsugiori.expression");
export type RawExpression = string & {
  readonly __rawExpression: unique symbol;
};
export type ExpressionInput<T = unknown> =
  | Expression<T, string>
  | RawExpression;
export type Operand<T = unknown> = Expression<T, string> | T;
const typedReference = Symbol("tsugiori.typed-reference");
export type TypedReference<
  T,
  C extends ValueContract<unknown>,
  Path extends string,
  Required extends boolean,
> =
  & Expression<string>
  & Readonly<
    {
      [typedReference]: {
        value: T;
        contract: C;
        path: Path;
        required: Required;
      };
    }
  >;
export type ReferenceProof<R> = R extends
  TypedReference<unknown, ValueContract<unknown>, infer Path, boolean> ? Path
  : never;
export type ReferenceValue<R> = R extends
  TypedReference<infer T, ValueContract<unknown>, string, boolean> ? T : never;
export type ReferenceRequired<R> = R extends
  TypedReference<unknown, ValueContract<unknown>, string, infer Required>
  ? Required
  : false;
export type ReferenceContract<R> = R extends
  TypedReference<unknown, infer C, string, boolean> ? C : never;
export type TypedMarker<
  T,
  C extends ValueContract<unknown>,
  Required extends boolean,
> = Readonly<{
  [typedReference]: { value: T; contract: C; required: Required };
}>;
type AsReference<T, Path extends string> = T extends
  TypedMarker<infer V, infer C, infer R> ? TypedReference<V, C, Path, R>
  : Ref<T, Path>;
export type ReferenceBinding = Readonly<{
  contract: ValueContract<unknown>;
  required: boolean;
}>;
const referenceContracts = new WeakMap<
  Expression<unknown, string>,
  ReferenceBinding
>();
const referenceScopes = new WeakMap<
  Expression<unknown, string>,
  ReadonlyMap<string, ReferenceBinding>
>();
const presenceProofs = new WeakMap<
  Expression<unknown, string>,
  ReadonlySet<string>
>();
export function expressionProofs(value: unknown): ReadonlySet<string> {
  return value instanceof Expression
    ? presenceProofs.get(value) ?? new Set()
    : new Set();
}
export function referenceContract(
  value: unknown,
): ValueContract<unknown> | undefined {
  return referenceBinding(value)?.contract;
}
export function referenceBinding(value: unknown): ReferenceBinding | undefined {
  return value instanceof Expression
    ? referenceContracts.get(value)
    : undefined;
}

// GitHub's && returns its left operand when falsy; || returns it when truthy.
type FalsyPart<T> = unknown extends T ? unknown
  :
    | (false extends T ? false : never)
    | ("" extends T ? "" : never)
    | (number extends T ? number : 0 extends T ? 0 : never)
    | (null extends T ? null : never)
    | (undefined extends T ? undefined : never);
type TruthyPart<T> = unknown extends T ? unknown
  : T extends null | undefined ? never
  : T extends boolean ? true extends T ? true : never
  : T extends "" | 0 ? never
  : T;

type Node =
  | Readonly<{ kind: "literal"; value: string | number | boolean | null }>
  | Readonly<{ kind: "path"; value: string }>
  | Readonly<{ kind: "raw"; value: string }>
  | Readonly<{ kind: "unary"; operator: string; value: Node }>
  | Readonly<{ kind: "binary"; operator: string; left: Node; right: Node }>
  | Readonly<{ kind: "call"; name: string; args: readonly Node[] }>;

/** Native runtime expression AST. GitHub comparisons coerce unlike types and compare strings without case.
 * and/or return operands, not necessarily booleans; host string interpolation throws.
 * Tsugiori's fixed specification basis and coverage are owned by github_spec.json.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
 */
export class Expression<T = unknown, Proof extends string = never> {
  readonly [expressionBrand]!: T;
  readonly __proof!: Proof;
  toString(): never {
    throw new TypeError(
      "Expression nodes cannot be interpolated into host-language strings.",
    );
  }
  constructor(readonly node: Node) {}
  /** Loose equality with GitHub numeric coercion and case-insensitive string comparison.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  eq(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "==", value);
  }
  /** Negates GitHub loose equality, including its coercion rules.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  ne(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "!=", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  lt(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "<", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  le(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "<=", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  gt(value: Operand<unknown>): Expression<boolean> {
    return binary(this, ">", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  ge(value: Operand<unknown>): Expression<boolean> {
    return binary(this, ">=", value);
  }
  /** Returns the left operand when falsy, otherwise the right operand; carries conjunctive presence proofs.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  and<U, OtherProof extends string = never>(
    value: Expression<U, OtherProof> | U,
  ): Expression<FalsyPart<T> | U, Proof | OtherProof> {
    const result = binary<FalsyPart<T> | U>(this, "&&", value);
    presenceProofs.set(
      result,
      new Set([
        ...expressionProofs(this),
        ...expressionProofs(value),
      ]),
    );
    return result as Expression<FalsyPart<T> | U, Proof | OtherProof>;
  }
  /** Returns the left operand when truthy, otherwise the right operand; grants no presence proof.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  or<U>(value: Operand<U>): Expression<TruthyPart<T> | U> {
    return binary(this, "||", value);
  }
  /** Applies GitHub truthiness; the result is a boolean.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  not(): Expression<boolean> {
    return new Expression({ kind: "unary", operator: "!", value: this.node });
  }
  /** An assertion about the runtime value; this does not validate JSON. */
  as<U>(): Expression<U> {
    return this as unknown as Expression<U>;
  }
  /** Property/index dereference happens at runtime; missing property values depend on GitHub context semantics.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   */
  at<K extends keyof T>(key: K): Expression<T[K]> {
    return pathProperty(this, String(key));
  }
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   */
  filter(): Expression<readonly Element<T>[]>;
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   */
  filter<K extends keyof Element<T>>(
    key: K,
  ): Expression<readonly Element<T>[K][]>;
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   */
  filter(key?: PropertyKey): Expression<readonly unknown[]> {
    const collection = pathProperty<readonly unknown[]>(this, "*");
    return key === undefined
      ? collection
      : pathProperty<readonly unknown[]>(collection, String(key));
  }
}
type Element<T> = T extends readonly (infer U)[] ? U
  : T extends Record<string, infer U> ? U
  : unknown;

export type Ref<T, Path extends string = string> =
  & Expression<T>
  & (T extends readonly (infer U)[]
    ? Readonly<{ [index: number]: Ref<U, `${Path}[${number}]`> }>
    : T extends object ? Readonly<
        {
          [K in Exclude<keyof T, keyof Expression<T>>]: AsReference<
            T[K],
            `${Path}.${K & string}`
          >;
        }
      >
    : Record<never, never>);

function nodeOf(value: unknown): Node {
  if (value instanceof Expression) return value.node;
  if (
    value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return { kind: "literal", value } as Node;
  }
  throw new TypeError(
    "Expression operand must be a finite literal or expression node.",
  );
}
function binary<T>(
  left: Expression<unknown, string>,
  operator: string,
  right: Operand<unknown>,
): Expression<T> {
  return new Expression<T>({
    kind: "binary",
    operator,
    left: left.node,
    right: nodeOf(right),
  });
}
function pathProperty<T>(
  source: Expression<unknown, string>,
  key: string,
): Expression<T> {
  const base = source.node.kind === "path"
    ? source.node.value
    : renderNode(source.node);
  return reference<T>(referencePath(base, key), referenceScopes.get(source));
}
export function referencePath(base: string, key: string): string {
  const suffix = /^(?:[A-Za-z_][A-Za-z0-9_]*|\*)$/.test(key)
    ? `.${key}`
    : /^\d+$/.test(key)
    ? `[${key}]`
    : `[${quote(key)}]`;
  return `${base}${suffix}`;
}
function reference<T>(
  value: string,
  contracts?: ReadonlyMap<string, ReferenceBinding>,
): Ref<T> {
  const expression = new Expression<T>({ kind: "path", value });
  if (contracts !== undefined) referenceScopes.set(expression, contracts);
  const binding = contracts?.get(value);
  if (binding !== undefined) referenceContracts.set(expression, binding);
  const proxy = new Proxy(expression, {
    get(target, key, receiver) {
      if (typeof key !== "string" || key in target) {
        return Reflect.get(target, key, receiver);
      }
      return pathProperty(target, key);
    },
  }) as Ref<T>;
  if (contracts !== undefined) referenceScopes.set(proxy, contracts);
  if (binding !== undefined) referenceContracts.set(proxy, binding);
  return proxy;
}
function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
function renderNode(node: Node): string {
  switch (node.kind) {
    case "literal":
      return typeof node.value === "string"
        ? quote(node.value)
        : String(node.value);
    case "path":
    case "raw":
      return node.value;
    case "unary":
      return `(!${renderNode(node.value)})`;
    case "binary":
      return `(${renderNode(node.left)} ${node.operator} ${
        renderNode(node.right)
      })`;
    case "call":
      return `${node.name}(${node.args.map(renderNode).join(", ")})`;
  }
}
export function emitExpression(value: ExpressionInput): string {
  if (value instanceof Expression) return `\${{ ${renderNode(value.node)} }}`;
  if (typeof value === "string" && /^\$\{\{[\s\S]+\}\}$/.test(value)) {
    return value;
  }
  throw new TypeError(
    "Expected an expression AST or explicit rawExpression().",
  );
}
/** Escape hatch for a single node. T, syntax and context availability are caller asserted.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions
 */
export function rawNode<T>(source: string): Expression<T> {
  if (!source.trim()) {
    throw new TypeError("Raw expression node must not be empty.");
  }
  return new Expression<T>({ kind: "raw", value: source });
}
export function literal<T extends string | number | boolean | null>(
  value: T,
): Expression<T> {
  return new Expression<T>(nodeOf(value));
}
function call<T>(
  name: string,
  ...args: readonly Operand<unknown>[]
): Expression<T> {
  return new Expression<T>({ kind: "call", name, args: args.map(nodeOf) });
}
/** Case-insensitive containment; GitHub casts scalar operands to strings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#contains
 */
export const contains = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("contains", search, item);
/** Case-insensitive string prefix; GitHub casts operands to strings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#startswith
 */
export const startsWith = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("startsWith", search, item);
/** Case-insensitive string suffix; GitHub casts operands to strings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#endswith
 */
export const endsWith = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("endsWith", search, item);
/** GitHub format placeholders use numbered braces; double braces escape literal braces.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#format
 */
export const format = (
  pattern: Operand<string>,
  ...values: readonly [Operand<unknown>, ...Operand<unknown>[]]
): Expression<string> => call("format", pattern, ...values);
/** Joins array/string elements with a separator (comma by default).
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#join
 */
export const join = (
  value: Operand<unknown>,
  separator?: Operand<string>,
): Expression<string> =>
  separator === undefined
    ? call("join", value)
    : call("join", value, separator);
/** Serializes a GitHub runtime value, not a host-language object evaluation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#tojson
 */
export const toJSON = (value: Operand<unknown>): Expression<string> =>
  call("toJSON", value);
/** Converts a runtime JSON string; typed task references retain their contract, other result types are assertions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson
 */
export function fromJSON<
  T,
  C extends ValueContract<unknown, "json">,
  P extends string,
>(value: TypedReference<T, C, P, true>): Expression<T>;
export function fromJSON(value: Operand<unknown>): Expression<unknown>;
export function fromJSON(value: Operand<unknown>): Expression<unknown> {
  return call("fromJSON", value);
}
export function present<
  T,
  C extends ValueContract<unknown>,
  P extends string,
  R extends boolean,
>(value: TypedReference<T, C, P, R>): Expression<boolean, P> {
  const result = value.ne("");
  if (value.node.kind === "path") {
    presenceProofs.set(result, new Set([value.node.value]));
  }
  return result as Expression<boolean, P>;
}
/** Returns the value for the first truthy condition, otherwise the fallback; branches do not grant presence proofs.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#case
 */
export const caseOf = (
  ...values: readonly Operand<unknown>[]
): Expression<unknown> => {
  if (values.length < 3 || values.length % 2 !== 1) {
    throw new TypeError("case requires predicate/value pairs and a default.");
  }
  return call("case", ...values);
};
/** Admits execution even after cancellation; do not infer that prerequisites or resources are available.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#always
 */
export const always = (): Expression<boolean> => call("always");
/** Checks whether the workflow was cancelled.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#cancelled
 */
export const cancelled = (): Expression<boolean> => call("cancelled");
/** Checks earlier success; GitHub applies this implicitly to conditions without a status function.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#success
 */
export const success = (): Expression<boolean> => call("success");
/** Checks failures in preceding steps or dependent jobs.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#failure
 */
export const failure = (): Expression<boolean> => call("failure");
/** Hashes workspace matches at step execution; scenario requires an explicit site value.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#hashfiles
 */
export const hashFiles = (
  ...paths: readonly [Operand<string>, ...Operand<string>[]]
): Expression<string> => call("hashFiles", ...paths);

/** GitHub-provided values; property availability depends on evaluation site and event.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
 */
export type GitHubContext = Readonly<{
  action: string;
  action_path: string;
  action_ref: string;
  action_repository: string;
  action_status: string;
  actor: string;
  actor_id: string;
  api_url: string;
  base_ref: string;
  env: string;
  event: unknown;
  event_name: string;
  event_path: string;
  graphql_url: string;
  head_ref: string;
  job: string;
  path: string;
  ref: string;
  ref_name: string;
  ref_protected: boolean;
  ref_type: string;
  repository: string;
  repository_id: string;
  repository_owner: string;
  repository_owner_id: string;
  repositoryUrl: string;
  retention_days: string;
  run_attempt: string;
  run_id: string;
  run_number: string;
  secret_source: string;
  server_url: string;
  sha: string;
  token: string;
  triggering_actor: string;
  workflow: string;
  workflow_ref: string;
  workflow_sha: string;
  workspace: string;
}>;
type Proven<M, Path extends string, Proof extends string> = M extends
  TypedMarker<infer T, infer C, infer R>
  ? TypedMarker<T, C, R extends true ? true : Path extends Proof ? true : false>
  : M;
export type StepContext<
  Outputs extends readonly string[],
  Proof extends string = never,
  Prefix extends string = string,
> = Readonly<{
  outputs: Readonly<
    {
      [K in Outputs[number]]: Outputs extends Readonly<{ __typed: infer M }>
        ? K extends keyof M ? Proven<M[K], `${Prefix}.outputs.${K}`, Proof>
        : string
        : string;
    }
  >;
  outcome: string;
  conclusion: string;
}>;
export type JobContext<
  Outputs extends readonly string[],
  Proof extends string = never,
  Prefix extends string = string,
> = Readonly<{
  outputs: Readonly<
    {
      [K in Outputs[number]]: Outputs extends Readonly<{ __typed: infer M }>
        ? K extends keyof M ? Proven<M[K], `${Prefix}.outputs.${K}`, Proof>
        : string
        : string;
    }
  >;
  result: string;
}>;
export type ScopeValues<
  Needs extends Record<string, readonly string[]>,
  Steps extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  Proof extends string = never,
> = {
  github: GitHubContext;
  needs: {
    readonly [K in keyof Needs]: JobContext<
      Needs[K],
      Proof,
      `needs.${K & string}`
    >;
  };
  steps: {
    readonly [K in keyof Steps]: StepContext<
      Steps[K],
      Proof,
      `steps.${K & string}`
    >;
  };
  matrix: Matrix;
  strategy: Readonly<
    {
      fail_fast: boolean;
      job_index: number;
      job_total: number;
      max_parallel: number;
    }
  >;
  vars: Readonly<Record<Vars, string>>;
  secrets: Readonly<Record<Secrets, string>>;
  inputs: Readonly<Record<string, string>>;
  env: Readonly<Record<string, string>>;
  job: Readonly<
    { status: string; container: Readonly<{ id: string; network: string }> }
  >;
  runner: Readonly<
    {
      name: string;
      os: string;
      arch: string;
      temp: string;
      tool_cache: string;
      debug: string;
    }
  >;
};
type ContextKeys<S extends GitHubExpressionScopeKey> =
  (typeof githubExpressionScopes)[S]["contexts"][number];
type FunctionKeys<S extends GitHubExpressionScopeKey> =
  (typeof githubExpressionScopes)[S]["functions"][number];
type Functions = {
  always: typeof always;
  cancelled: typeof cancelled;
  success: typeof success;
  failure: typeof failure;
  hashFiles: typeof hashFiles;
};
/** Field-specific contexts follow the fixed availability catalog; unavailable properties require explicit raw assertions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
 */
export type Scope<
  S extends GitHubExpressionScopeKey,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  Proof extends string = never,
> =
  & {
    readonly [K in ContextKeys<S>]: Ref<
      ScopeValues<
        Needs,
        Steps,
        Matrix,
        Vars,
        Secrets,
        Proof
      >[K & keyof ScopeValues<Needs, Steps, Matrix, Vars, Secrets, Proof>],
      K & string
    >;
  }
  & Pick<Functions, FunctionKeys<S>>;
export function scope<
  S extends GitHubExpressionScopeKey,
  Needs extends Record<string, readonly string[]>,
  Steps extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  Proof extends string = never,
>(
  key: S,
  contracts?: ReadonlyMap<string, ReferenceBinding>,
): Scope<S, Needs, Steps, Matrix, Vars, Secrets, Proof> {
  const definitions = githubExpressionScopes[key];
  const result: Record<string, unknown> = {};
  for (const context of definitions.contexts) {
    result[context] = reference(context, contracts);
  }
  const functions: Functions = {
    always,
    cancelled,
    success,
    failure,
    hashFiles,
  };
  for (const name of definitions.functions) result[name] = functions[name];
  return Object.freeze(result) as Scope<
    S,
    Needs,
    Steps,
    Matrix,
    Vars,
    Secrets,
    Proof
  >;
}

export { caseOf as case };
