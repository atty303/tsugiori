// GitHub specification descriptions are copied or adapted from GitHub Docs (CC BY 4.0).
// Attribution, modifications and fixed source basis: docs/GITHUB_ACTIONS_SPEC.md.
import {
  type GitHubExpressionScopeKey,
  githubExpressionScopes,
} from "./expression_scope.ts";
import type { ValueContract } from "../task/mod.ts";

const expressionBrand = Symbol("tsugiori.expression");
/** An explicit whole GitHub runtime expression created by rawExpression().
 * @example
 * ```ts
 * const branch = rawExpression("github.ref");
 * ```
 */
export type RawExpression = string & {
  /** Type-level marker distinguishing explicit raw expressions from literal strings.
   */
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

/** GitHub expressions compute values from literals, contexts, operators and functions. Comparisons coerce unlike types and ignore string case; && and || return operands rather than necessarily booleans.
 * Tsugiori stores an expression AST for YAML emission; host string interpolation throws. githubActionsSpec owns the fixed specification basis.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
 * @example
 * ```ts
 * literal("main").eq("main");
 * ```
 */
export class Expression<T = unknown, Proof extends string = never> {
  /** Type-level expression value marker; no GitHub runtime value is available on the host.
   */
  readonly [expressionBrand]!: T;
  /** Type-level presence proof carried through conjunctive conditions; no runtime value is read during authoring.
   */
  readonly __proof!: Proof;
  /** Reject host-language string interpolation with TypeError. Use format() or pass the expression into a supported field; GitHub values are unavailable during authoring.
   * @example
   * ```ts
   * try {
   *   literal("main").toString(); // throws TypeError during authoring
   * } catch (error) {
   *   console.error(error);
   * }
   * ```
   */
  toString(): never {
    throw new TypeError(
      "Expression nodes cannot be interpolated into host-language strings.",
    );
  }
  /** The public entrypoint exports Expression as a type. Obtain instances through literal(), rawNode() or field references; direct construction is not available through the public entrypoint.
   * @example
   * ```ts
   * const expression: Expression<string> = literal("main");
   * ```
   */
  constructor(readonly node: Node) {}
  /** Loose equality with GitHub numeric coercion and case-insensitive string comparison.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal("main").eq("main");
   * ```
   */
  eq(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "==", value);
  }
  /** Negates GitHub loose equality, including its coercion rules.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal("main").ne("dev");
   * ```
   */
  ne(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "!=", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(1).lt(2);
   * ```
   */
  lt(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "<", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(1).le(2);
   * ```
   */
  le(value: Operand<unknown>): Expression<boolean> {
    return binary(this, "<=", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(2).gt(1);
   * ```
   */
  gt(value: Operand<unknown>): Expression<boolean> {
    return binary(this, ">", value);
  }
  /** Relational comparisons return false for NaN after numeric coercion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(2).ge(1);
   * ```
   */
  ge(value: Operand<unknown>): Expression<boolean> {
    return binary(this, ">=", value);
  }
  /** Returns the left operand when falsy, otherwise the right operand. Falsy values include false, 0, empty strings and null.
   * Tsugiori carries conjunctive presence proofs for typed task references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(true).and(literal("deploy"));
   * ```
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
  /** Returns the left operand when truthy, otherwise the right operand; use it to select a fallback.
   * Tsugiori grants no presence proof for typed task references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal("").or("fallback");
   * ```
   */
  or<U>(value: Operand<U>): Expression<TruthyPart<T> | U> {
    return binary(this, "||", value);
  }
  /** Applies GitHub truthiness; the result is a boolean.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * literal(false).not();
   * ```
   */
  not(): Expression<boolean> {
    return new Expression({ kind: "unary", operator: "!", value: this.node });
  }
  /** An assertion about the runtime value; this does not validate JSON.
   * @example
   * ```ts
   * fromJSON(literal('{"version":22}')).as<{ version: number }>();
   * ```
   */
  as<U>(): Expression<U> {
    return this as unknown as Expression<U>;
  }
  /** Property/index dereference happens at runtime; missing property values depend on GitHub context semantics.
   * Generated references use dot syntax for names starting with a letter or `_`
   * and containing only letters, digits, `_` or `-`; other names use brackets.
   * Numeric indices retain bracket syntax.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#operators
   * @example
   * ```ts
   * fromJSON(literal('{"version":22}')).as<{ version: number }>().at("version");
   * ```
   */
  at<K extends keyof T>(key: K): Expression<T[K]> {
    return pathProperty(this, String(key));
  }
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   * @example
   * ```ts
   * fromJSON(literal('[{"name":"bug"}]')).as<readonly { name: string }[]>()
   *   .filter();
   * ```
   */
  filter(): Expression<readonly Element<T>[]>;
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   * @example
   * ```ts
   * fromJSON(literal('[{"name":"bug"}]')).as<readonly { name: string }[]>().filter(
   *   "name",
   * );
   * ```
   */
  filter<K extends keyof Element<T>>(
    key: K,
  ): Expression<readonly Element<T>[K][]>;
  /** Native object wildcard filter; object iteration order is not guaranteed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#object-filters
   * @example
   * ```ts
   * fromJSON(literal('[{"name":"bug"}]')).as<readonly { name: string }[]>().filter(
   *   "name",
   * );
   * ```
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
          [K in keyof T as K extends keyof Expression<T> ? never : K]:
            AsReference<
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
  const suffix = /^(?:[A-Za-z_][A-Za-z0-9_-]*|\*)$/.test(key)
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
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").when(({ github }) =>
 *   github.ref.eq(rawNode<string>("vars.RELEASE_REF"))
 * );
 * ```
 */
export function rawNode<T>(source: string): Expression<T> {
  if (!source.trim()) {
    throw new TypeError("Raw expression node must not be empty.");
  }
  return new Expression<T>({ kind: "raw", value: source });
}
/** Builds a literal expression without evaluating it on the runner.
 * @example
 * ```ts
 * literal("refs/heads/main").eq("refs/heads/main");
 * ```
 */
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
 * @example
 * ```ts
 * contains(literal("Hello world"), "world");
 * ```
 */
export const contains = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("contains", search, item);
/** Case-insensitive string prefix; GitHub casts operands to strings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#startswith
 * @example
 * ```ts
 * startsWith(literal("refs/heads/main"), "refs/heads/");
 * ```
 */
export const startsWith = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("startsWith", search, item);
/** Case-insensitive string suffix; GitHub casts operands to strings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#endswith
 * @example
 * ```ts
 * endsWith(literal("release.yml"), ".yml");
 * ```
 */
export const endsWith = (
  search: Operand<unknown>,
  item: Operand<unknown>,
): Expression<boolean> => call("endsWith", search, item);
/** GitHub format placeholders use numbered braces; double braces escape literal braces.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#format
 * @example
 * ```ts
 * format("release-{0}-{1}", literal("main"), 42);
 * ```
 */
export const format = (
  pattern: Operand<string>,
  ...values: readonly [Operand<unknown>, ...Operand<unknown>[]]
): Expression<string> => call("format", pattern, ...values);
/** Joins array/string elements with a separator (comma by default).
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#join
 * @example
 * ```ts
 * join(fromJSON(literal('["dev","prd"]')), ",");
 * ```
 */
export const join = (
  value: Operand<unknown>,
  separator?: Operand<string>,
): Expression<string> =>
  separator === undefined
    ? call("join", value)
    : call("join", value, separator);
/** Returns a pretty-printed JSON representation of a value, useful for inspecting contexts or passing structured data as a string.
 * The value is evaluated by GitHub, not during generation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#tojson
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Inspect event",
 *   run: 'printf "%s\\n" "$EVENT"',
 *   env: ({ github }) => ({ EVENT: toJSON(github.event) }),
 * });
 * ```
 */
export const toJSON = (value: Operand<unknown>): Expression<string> =>
  call("toJSON", value);
/** Returns a JSON object or JSON data type for a value, allowing conversion of strings into objects, booleans and numbers.
 * Typed task references retain their contract; other result types are assertions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson
 * @example Given typed optional references: `depends` needs job `prepare`, whose `stages` output uses a JSON string-array contract; `guarded` additionally proves presence with when(present(...)).
 * ```ts
 * guarded.strategy(({ needs }) => ({ matrix: { stage: fromJSON(needs.prepare.outputs.stages) } }));
 * ```
 */
export function fromJSON<
  T,
  C extends ValueContract<unknown, "json">,
  P extends string,
>(value: TypedReference<T, C, P, true>): Expression<T>;
/** Parses a GitHub JSON string; use as<T>() only when asserting its unvalidated shape.
 * @example
 * ```ts
 * fromJSON(literal('{"version":22}')).as<{ version: number }>();
 * ```
 */
export function fromJSON(value: Operand<unknown>): Expression<unknown>;
/** Returns a JSON object or JSON data type for a value, allowing conversion of strings into objects, booleans and numbers.
 * Typed task references retain their contract; other result types are assertions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#fromjson
 * @example Given typed optional references: `depends` needs job `prepare`, whose `stages` output uses a JSON string-array contract; `guarded` additionally proves presence with when(present(...)).
 * ```ts
 * guarded.strategy(({ needs }) => ({ matrix: { stage: fromJSON(needs.prepare.outputs.stages) } }));
 * ```
 */
export function fromJSON(value: Operand<unknown>): Expression<unknown> {
  return call("fromJSON", value);
}
/** Checks the output wire value for presence and grants a proof to guarded task inputs or matrix expressions.
 * @example Given typed optional references: `depends` needs job `prepare`, whose `stages` output uses a JSON string-array contract; `guarded` additionally proves presence with when(present(...)).
 * ```ts
 * guarded.strategy(({ needs }) => ({ matrix: { stage: fromJSON(needs.prepare.outputs.stages) } }));
 * ```
 */
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
/** Returns the value for the first truthy predicate/value pair, otherwise the final default value.
 * Branches do not grant presence proofs for typed task references.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#case
 * @example
 * ```ts
 * caseOf(literal(true), "production", "development");
 * ```
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
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Cleanup",
 *   run: "cleanup",
 *   if: ({ always }) => always(),
 * });
 * ```
 */
export const always = (): Expression<boolean> => call("always");
/** Checks whether the workflow was cancelled.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#cancelled
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Cancellation",
 *   run: "notify",
 *   if: ({ cancelled }) => cancelled(),
 * });
 * ```
 */
export const cancelled = (): Expression<boolean> => call("cancelled");
/** Checks earlier success; GitHub applies this implicitly to conditions without a status function.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#success
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Success",
 *   run: "notify",
 *   if: ({ success }) => success(),
 * });
 * ```
 */
export const success = (): Expression<boolean> => call("success");
/** Checks failures in preceding steps or dependent jobs.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#failure
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Failure",
 *   run: "notify",
 *   if: ({ failure }) => failure(),
 * });
 * ```
 */
export const failure = (): Expression<boolean> => call("failure");
/** Returns a SHA-256 hash for files matching the supplied glob patterns within GITHUB_WORKSPACE. Individual file hashes are combined into a final hash; no matches returns an empty string. ! patterns exclude matches; Windows matching is case-insensitive.
 * Tsugiori scenarios require an explicit site value instead of reading runner files.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#hashfiles
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Cache key",
 *   run: "true",
 *   env: ({ hashFiles }) => ({ KEY: hashFiles("deno.lock", "!vendor/*.ts") }),
 * });
 * ```
 */
export const hashFiles = (
  ...paths: readonly [Operand<string>, ...Operand<string>[]]
): Expression<string> => call("hashFiles", ...paths);

/** Information about the workflow run and its triggering event. Some properties exist only within runner steps or particular event types.
 * Tsugiori exposes a supported subset; the string-shaped catalog does not model every event-dependent null value. event remains an unknown payload.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   name: "Inspect event",
 *   run: 'printf "%s\\n" "$EVENT"',
 *   env: ({ github }) => ({ EVENT: toJSON(github.event) }),
 * });
 * ```
 */
export type GitHubContext = Readonly<{
  /** The name of the action currently running, or the [`id`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid) of a step. GitHub removes special characters, and uses the name `__run` when the current step runs a script without an `id`. If you use the same action more than once in the same job, the name will include a suffix with the sequence number with underscore before it. For example, the first script you run will have the name `__run`, and the second script will be named `__run_2`. Similarly, the second invocation of `actions/checkout` will be `actionscheckout2`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.action) }),
   * });
   * ```
   */
  action: string;
  /** The path where an action is located. This property is only supported in composite actions. You can use this path to access files located in the same repository as the action, for example by changing directories to the path (using the corresponding environment variable): `cd "$GITHUB_ACTION_PATH"` . For more information on environment variables, see [GitHub documentation](https://docs.github.com/en/actions/reference/security/secure-use#use-an-intermediate-environment-variable).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.action_path) }),
   * });
   * ```
   */
  action_path: string;
  /** For a step executing an action, this is the ref of the action being executed. For example, `v2`. Do not use in the `run` keyword. To make this context work with composite actions, reference it within the `env` context of the composite action.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.action_ref) }),
   * });
   * ```
   */
  action_ref: string;
  /** For a step executing an action, this is the owner and repository name of the action. For example, `actions/checkout`. Do not use in the `run` keyword. To make this context work with composite actions, reference it within the `env` context of the composite action.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.action_repository) }),
   * });
   * ```
   */
  action_repository: string;
  /** For a composite action, the current result of the composite action.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.action_status) }),
   * });
   * ```
   */
  action_status: string;
  /** The username of the user that triggered the initial workflow run. If the workflow run is a re-run, this value may differ from `github.triggering_actor`. Any workflow re-runs will use the privileges of `github.actor`, even if the actor initiating the re-run (`github.triggering_actor`) has different privileges.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.actor) }),
   * });
   * ```
   */
  actor: string;
  /** The account ID of the person or app that triggered the initial workflow run. For example, `1234567`. Note that this is different from the actor username.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.actor_id) }),
   * });
   * ```
   */
  actor_id: string;
  /** The URL of the GitHub REST API.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.api_url) }),
   * });
   * ```
   */
  api_url: string;
  /** The `base_ref` or target branch of the pull request in a workflow run. This property is only available when the event that triggers a workflow run is either `pull_request` or `pull_request_target`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.base_ref) }),
   * });
   * ```
   */
  base_ref: string;
  /** Path on the runner to the file that sets environment variables from workflow commands. This file is unique to the current step and is a different file for each step in a job. For more information, see [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.env) }),
   * });
   * ```
   */
  /** Variables set by workflow, job or step env. The most specific definition wins; runner-inherited environment variables are not included.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#env-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.env) }),
   * });
   * ```
   */
  env: string;
  /** The full event webhook payload. You can access individual properties of the event using this context. This object is identical to the webhook payload of the event that triggered the workflow run, and is different for each event. The webhooks for each GitHub event is linked in [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_call). For example, for a workflow run triggered by the [`push` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push), this object contains the contents of the [push webhook payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#push).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.event) }),
   * });
   * ```
   */
  event: unknown;
  /** The name of the event that triggered the workflow run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.event_name) }),
   * });
   * ```
   */
  event_name: string;
  /** The path to the file on the runner that contains the full event webhook payload.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.event_path) }),
   * });
   * ```
   */
  event_path: string;
  /** The URL of the GitHub GraphQL API.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.graphql_url) }),
   * });
   * ```
   */
  graphql_url: string;
  /** The `head_ref` or source branch of the pull request in a workflow run. This property is only available when the event that triggers a workflow run is either `pull_request` or `pull_request_target`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.head_ref) }),
   * });
   * ```
   */
  head_ref: string;
  /** The [`job_id`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id) of the current job. Note: This context property is set by the Actions runner, and is only available within the execution `steps` of a job. Otherwise, the value of this property will be `null`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.job) }),
   * });
   * ```
   */
  /** Information about the currently running job, including its status and container.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.job) }),
   * });
   * ```
   */
  job: string;
  /** Path on the runner to the file that sets system `PATH` variables from workflow commands. This file is unique to the current step and is a different file for each step in a job. For more information, see [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-system-path).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.path) }),
   * });
   * ```
   */
  path: string;
  /** The fully-formed ref of the branch or tag that triggered the workflow run. For workflows triggered by `push`, this is the branch or tag ref that was pushed. For workflows triggered by `pull_request` that were not merged, this is the pull request merge branch. If the pull request was merged, this is the branch it was merged into. For workflows triggered by `release`, this is the release tag created. For other triggers, this is the branch or tag ref that triggered the workflow run. This is only set if a branch or tag is available for the event type. The ref given is fully-formed, meaning that for branches the format is `refs/heads/<branch_name>`. For pull request events except `pull_request_target` that were not merged, it is `refs/pull/<pr_number>/merge`. `pull_request_target` events have the `ref` from the base branch. For tags it is `refs/tags/<tag_name>`. For example, `refs/heads/feature-branch-1`. For more information about pull request merge branches, see [GitHub documentation](https://docs.github.com/en/pull-requests/reference/pull-requests#pull-request-refs-and-merge-branches).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.ref) }),
   * });
   * ```
   */
  ref: string;
  /** The short ref name of the branch or tag that triggered the workflow run. This value matches the branch or tag name shown on GitHub. For example, `feature-branch-1`. For pull requests that were not merged, the format is `<pr_number>/merge`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.ref_name) }),
   * });
   * ```
   */
  ref_name: string;
  /** `true` if branch protections or [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/managing-rulesets-for-a-repository) are configured for the ref that triggered the workflow run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.ref_protected) }),
   * });
   * ```
   */
  ref_protected: boolean;
  /** The type of ref that triggered the workflow run. Valid values are `branch` or `tag`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.ref_type) }),
   * });
   * ```
   */
  ref_type: string;
  /** The owner and repository name. For example, `octocat/Hello-World`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.repository) }),
   * });
   * ```
   */
  repository: string;
  /** The ID of the repository. For example, `123456789`. Note that this is different from the repository name.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.repository_id) }),
   * });
   * ```
   */
  repository_id: string;
  /** The repository owner's username. For example, `octocat`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.repository_owner) }),
   * });
   * ```
   */
  repository_owner: string;
  /** The repository owner's account ID. For example, `1234567`. Note that this is different from the owner's name.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.repository_owner_id) }),
   * });
   * ```
   */
  repository_owner_id: string;
  /** The Git URL to the repository. For example, `git://github.com/octocat/hello-world.git`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.repositoryUrl) }),
   * });
   * ```
   */
  repositoryUrl: string;
  /** The number of days that workflow run logs and artifacts are kept.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.retention_days) }),
   * });
   * ```
   */
  retention_days: string;
  /** A unique number for each attempt of a particular workflow run in a repository. This number begins at 1 for the workflow run's first attempt, and increments with each re-run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.run_attempt) }),
   * });
   * ```
   */
  run_attempt: string;
  /** A unique number for each workflow run within a repository. This number does not change if you re-run the workflow run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.run_id) }),
   * });
   * ```
   */
  run_id: string;
  /** A unique number for each run of a particular workflow in a repository. This number begins at 1 for the workflow's first run, and increments with each new run. This number does not change if you re-run the workflow run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.run_number) }),
   * });
   * ```
   */
  run_number: string;
  /** The source of a secret used in a workflow. Possible values are `None`, `Actions`, `Codespaces`, or `Dependabot`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.secret_source) }),
   * });
   * ```
   */
  secret_source: string;
  /** The URL of the GitHub server. For example: `https://github.com`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.server_url) }),
   * });
   * ```
   */
  server_url: string;
  /** The commit SHA that triggered the workflow. The value of this commit SHA depends on the event that triggered the workflow. For more information, see [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). For example, `ffac537e6cbbf934b08745a378932722df287a53`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.sha) }),
   * });
   * ```
   */
  sha: string;
  /** A token to authenticate on behalf of the GitHub App installed on your repository. This is functionally equivalent to the `GITHUB_TOKEN` secret. For more information, see [GitHub documentation](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token). Note: This context property is set by the Actions runner, and is only available within the execution `steps` of a job. Otherwise, the value of this property will be `null`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.token) }),
   * });
   * ```
   */
  token: string;
  /** The username of the user that initiated the workflow run. If the workflow run is a re-run, this value may differ from `github.actor`. Any workflow re-runs will use the privileges of `github.actor`, even if the actor initiating the re-run (`github.triggering_actor`) has different privileges.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.triggering_actor) }),
   * });
   * ```
   */
  triggering_actor: string;
  /** The name of the workflow. If the workflow file doesn't specify a `name`, the value of this property is the full path of the workflow file in the repository.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.workflow) }),
   * });
   * ```
   */
  workflow: string;
  /** The ref path to the workflow. For example, `octocat/hello-world/.github/workflows/my-workflow.yml@refs/heads/my_branch`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.workflow_ref) }),
   * });
   * ```
   */
  workflow_ref: string;
  /** The commit SHA for the workflow file.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.workflow_sha) }),
   * });
   * ```
   */
  workflow_sha: string;
  /** The default working directory on the runner for steps, and the default location of your repository when using the [`checkout`](https://github.com/actions/checkout) action.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ github }) => ({ VALUE: toJSON(github.workspace) }),
   * });
   * ```
   */
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
  /** String outputs from this earlier step. The step must have an id; outputs are read as steps.<id>.outputs.<name>.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).run({
   *   name: "Consume",
   *   run: "true",
   *   env: ({ steps }) => ({
   *     VALUE: steps.build.outputs.version,
   *   }),
   * });
   * ```
   */
  outputs: Readonly<
    Outputs extends { readonly __actionMetadata: infer M }
      ? { [K in keyof M]: string }
      : {
        [K in Outputs[number]]: Outputs extends Readonly<{ __typed: infer M }>
          ? K extends keyof M ? Proven<M[K], `${Prefix}.outputs.${K}`, Proof>
          : string
          : string;
      }
  >;
  /** The result of a step before continue-on-error: success, failure, cancelled or skipped. A failing continued step has failure outcome and success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).run({
   *   name: "Consume",
   *   run: "true",
   *   env: ({ steps }) => ({
   *     VALUE: steps.build.outcome,
   *   }),
   * });
   * ```
   */
  outcome: string;
  /** The final result of a step after continue-on-error: success, failure, cancelled or skipped.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).run({
   *   name: "Consume",
   *   run: "true",
   *   env: ({ steps }) => ({
   *     VALUE: steps.build.conclusion,
   *   }),
   * });
   * ```
   */
  conclusion: string;
}>;
export type JobContext<
  Outputs extends readonly string[],
  Proof extends string = never,
  Prefix extends string = string,
> = Readonly<{
  /** Outputs from a job listed in this job's needs. Read as needs.<id>.outputs.<name>; transitive dependencies are not included.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .job(
   *     "deploy",
   *     ({ job, jobs }) =>
   *       job.needs(jobs.build).runsOn("ubuntu-latest")
   *         .run({
   *           name: "Deploy",
   *           run: "deploy",
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.outputs.version,
   *           }),
   *         }),
   *   );
   * ```
   */
  outputs: Readonly<
    {
      [K in Outputs[number]]: Outputs extends Readonly<{ __typed: infer M }>
        ? K extends keyof M ? Proven<M[K], `${Prefix}.outputs.${K}`, Proof>
        : string
        : string;
    }
  >;
  /** The result of a dependency job: success, failure, cancelled or skipped.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .job(
   *     "deploy",
   *     ({ job, jobs }) =>
   *       job.needs(jobs.build).runsOn("ubuntu-latest")
   *         .run({
   *           name: "Deploy",
   *           run: "deploy",
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.result,
   *           }),
   *         }),
   *   );
   * ```
   */
  result: string;
}>;
export type ScopeValues<
  Needs extends Record<string, readonly string[]>,
  Steps extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
> = {
  /** Information about the workflow run and the event that triggered it. Some properties are available only within runner steps.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Inspect event",
   *   run: 'printf "%s\\n" "$EVENT"',
   *   env: ({ github }) => ({ EVENT: toJSON(github.event) }),
   * });
   * ```
   */
  github: GitHubContext;
  /** Results and outputs of this job's direct dependencies, not every transitive dependency. Only jobs named in needs are included.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .job(
   *     "deploy",
   *     ({ job, jobs }) =>
   *       job.needs(jobs.build).runsOn("ubuntu-latest")
   *         .run({
   *           name: "Deploy",
   *           run: "deploy",
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.outputs.version,
   *           }),
   *         }),
   *   );
   * ```
   */
  needs: {
    readonly [K in keyof Needs]: JobContext<
      Needs[K],
      Proof,
      `needs.${K & string}`
    >;
  };
  /** Outputs and results of earlier steps with an id in the current job.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#steps-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
   * ```
   */
  steps: {
    readonly [K in keyof Steps]: StepContext<
      Steps[K],
      Proof,
      `steps.${K & string}`
    >;
  };
  /** The matrix parameters for this job variant; property names come from the workflow matrix definition.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#matrix-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest")
   *   .strategy({
   *     matrix: { os: ["ubuntu-latest", "macos-latest"] },
   *     failFast: false,
   *   })
   *   .runsOn(({ matrix }) => matrix.os)
   *   .run({ name: "Test", run: "deno test" });
   * ```
   */
  matrix: Matrix;
  /** Information about the current matrix strategy and expansion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#strategy-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ strategy }) => ({ VALUE: toJSON(strategy) }),
   * });
   * ```
   */
  strategy: Readonly<
    {
      /** The matrix strategy fail-fast setting: true cancels queued or running matrix members when a member fails.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#strategy-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ strategy }) => ({ VALUE: toJSON(strategy.fail_fast) }),
       * });
       * ```
       */
      fail_fast: boolean;
      /** The zero-based index of this job in the matrix expansion.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#strategy-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ strategy }) => ({ VALUE: toJSON(strategy.job_index) }),
       * });
       * ```
       */
      job_index: number;
      /** The total number of jobs generated by the matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#strategy-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ strategy }) => ({ VALUE: toJSON(strategy.job_total) }),
       * });
       * ```
       */
      job_total: number;
      /** The maximum number of matrix jobs allowed to run simultaneously.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#strategy-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ strategy }) => ({ VALUE: toJSON(strategy.max_parallel) }),
       * });
       * ```
       */
      max_parallel: number;
    }
  >;
  /** Repository, organization and environment configuration variables. Unset variables return an empty string. Environment variables become available after the environment is declared by the runner.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#vars-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   vars: ["REGION"],
   * }).job("test", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     name: "Use context",
   *     run: "true",
   *     env: ({ vars }) => ({ VALUE: toJSON(vars.REGION) }),
   *   }));
   * ```
   */
  vars: Readonly<Record<Vars, string>>;
  /** Secrets available to this workflow. An unset secret returns an empty string. Reusable workflows receive only explicitly passed or inherited secrets.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#secrets-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   secrets: ["DEPLOY_TOKEN"],
   * }).job("test", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     name: "Use context",
   *     run: "true",
   *     env: ({ secrets }) => ({ VALUE: toJSON(secrets.DEPLOY_TOKEN) }),
   *   }));
   * ```
   */
  secrets: Readonly<Record<Secrets, string>>;
  /** Inputs passed to a manually dispatched or reusable workflow. Unlike github.event.inputs, this context preserves boolean values.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: {
   *     workflow_dispatch: {
   *       inputs: { stage: { type: "string", default: "dev" } },
   *     },
   *   },
   * }).job("test", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     name: "Use context",
   *     run: "true",
   *     env: ({ inputs }) => ({ VALUE: toJSON(inputs.stage) }),
   *   }));
   * ```
   */
  inputs: InputValues;
  /** Path on the runner to the file that sets environment variables from workflow commands. This file is unique to the current step and is a different file for each step in a job. For more information, see [GitHub documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-environment-variable).
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ env }) => ({ VALUE: toJSON(env.CI) }),
   * });
   * ```
   */
  /** Variables set by workflow, job or step env. The most specific definition wins; runner-inherited environment variables are not included.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#env-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ env }) => ({ VALUE: toJSON(env.CI) }),
   * });
   * ```
   */
  env: Readonly<Record<string, string>>;
  /** The [`job_id`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id) of the current job. Note: This context property is set by the Actions runner, and is only available within the execution `steps` of a job. Otherwise, the value of this property will be `null`.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ job }) => ({ VALUE: toJSON(job) }),
   * });
   * ```
   */
  /** Information about the currently running job, including its status and container.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ job }) => ({ VALUE: toJSON(job) }),
   * });
   * ```
   */
  job: Readonly<
    {
      /** The current job status: success, failure or cancelled.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ job }) => ({ VALUE: toJSON(job.status) }),
       * });
       * ```
       */
      status: string;
      /** Information about the job container when the job runs in a container.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ job }) => ({ VALUE: toJSON(job.container) }),
       * });
       * ```
       */
      container: Readonly<{
        /** The id of the container running this job.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").run({
         *   name: "Use context",
         *   run: "true",
         *   env: ({ job }) => ({ VALUE: toJSON(job.container.id) }),
         * });
         * ```
         */
        id: string;
        /** The id of the container network. Service containers join the same network.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").run({
         *   name: "Use context",
         *   run: "true",
         *   env: ({ job }) => ({ VALUE: toJSON(job.container.network) }),
         * });
         * ```
         */
        network: string;
      }>;
    }
  >;
  /** Information about the runner executing this job.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Use context",
   *   run: "true",
   *   env: ({ runner }) => ({ VALUE: toJSON(runner) }),
   * });
   * ```
   */
  runner: Readonly<
    {
      /** The name of the runner executing the job. This name may not be unique in a workflow run as runners at the repository and organization levels could use the same name.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.name) }),
       * });
       * ```
       */
      name: string;
      /** The operating system of the runner executing the job. Possible values are `Linux`, `Windows`, or `macOS`.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.os) }),
       * });
       * ```
       */
      os: string;
      /** The architecture of the runner executing the job. Possible values are `X86`, `X64`, `ARM`, or `ARM64`.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.arch) }),
       * });
       * ```
       */
      arch: string;
      /** The path to a temporary directory on the runner. This directory is emptied at the beginning and end of each job. Note that files will not be removed if the runner's user account does not have permission to delete them.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.temp) }),
       * });
       * ```
       */
      temp: string;
      /** The path to the directory containing preinstalled tools for GitHub-hosted runners. For more information, see [GitHub documentation](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners#preinstalled-software-for-github-owned-images).
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.tool_cache) }),
       * });
       * ```
       */
      tool_cache: string;
      /** This is set only if [debug logging](https://docs.github.com/en/actions/how-tos/monitor-workflows/enable-debug-logging) is enabled, and always has the value of `1`. It can be useful as an indicator to enable additional debugging or verbose logging in your own job steps.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#runner-context
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Use context",
       *   run: "true",
       *   env: ({ runner }) => ({ VALUE: toJSON(runner.debug) }),
       * });
       * ```
       */
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
/** Context availability depends on the workflow field being evaluated: job conditions, step conditions and input expressions do not all expose the same contexts or functions.
 * Tsugiori narrows fields using the fixed availability catalog; unavailable properties require explicit raw assertions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").when(({ github, success }) =>
 *   success().and(github.ref.eq("refs/heads/main"))
 * );
 * ```
 */
export type Scope<
  S extends GitHubExpressionScopeKey,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
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
        InputValues,
        Proof
      >[
        & K
        & keyof ScopeValues<
          Needs,
          Steps,
          Matrix,
          Vars,
          Secrets,
          InputValues,
          Proof
        >
      ],
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
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
>(
  key: S,
  contracts?: ReadonlyMap<string, ReferenceBinding>,
): Scope<S, Needs, Steps, Matrix, Vars, Secrets, InputValues, Proof> {
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
    InputValues,
    Proof
  >;
}

export { caseOf as case };
