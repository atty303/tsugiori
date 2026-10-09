// Fixed Docs semantics and supplemental actions/runner references are linked in
// docs/GITHUB_ACTIONS_SPEC.md. External fixture reads remain deliberately strict.
export class MissingContextError extends Error {
  constructor(readonly path: string) {
    super(`Scenario fixture is missing referenced context ${path}.`);
    this.name = "MissingContextError";
  }
}

export class MissingHashFilesError extends Error {
  constructor() {
    super("Reached hashFiles() has no matching step return-value fixture.");
  }
}

type Context = Readonly<Record<string, unknown>>;
type Status = Readonly<
  { success: boolean; failure: boolean; cancelled: boolean }
>;
type Token = Readonly<{ type: string; value: string }>;
type Node =
  | Readonly<{ kind: "literal"; value: unknown }>
  | Readonly<{ kind: "context"; name: string }>
  | Readonly<{ kind: "access"; value: Node; key: Node | "*" }>
  | Readonly<{ kind: "unary"; value: Node }>
  | Readonly<{ kind: "binary"; op: string; left: Node; right: Node }>
  | Readonly<{ kind: "call"; name: string; args: readonly Node[] }>;

function parseNumber(source: string): number {
  const text = source.trim();
  if (!text) return 0;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    return Number(text);
  }
  if (
    /^0(?:x[\da-f]+|o[0-7]+)$/.test(text.toLowerCase()) &&
    text[1] === text[1].toLowerCase()
  ) {
    const value = Number(text);
    return value <= 0xffffffff ? value | 0 : NaN;
  }
  return text === "Infinity"
    ? Infinity
    : text === "-Infinity"
    ? -Infinity
    : NaN;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;
  while (offset < source.length) {
    const rest = source.slice(offset);
    const spaces = /^\s+/.exec(rest);
    if (spaces) {
      offset += spaces[0].length;
      continue;
    }
    if (rest[0] === "'") {
      let cursor = 1;
      let value = "";
      while (cursor < rest.length) {
        if (rest[cursor] === "'") {
          if (rest[cursor + 1] === "'") {
            value += "'";
            cursor += 2;
            continue;
          }
          break;
        }
        value += rest[cursor++];
      }
      if (rest[cursor] !== "'") throw new SyntaxError(source);
      tokens.push({ type: "string", value });
      offset += cursor + 1;
      continue;
    }
    if (/^[+\-\d]/.test(rest) || /^\.\d/.test(rest)) {
      const text = /^[^\s!<>=&|(),\[\]*]+/.exec(rest)?.[0];
      if (!text || Number.isNaN(parseNumber(text))) {
        throw new SyntaxError(source);
      }
      tokens.push({ type: "number", value: text });
      offset += text.length;
      continue;
    }
    const operator = /^(?:&&|\|\||==|!=|<=|>=|[!<>().,\[\]*])/.exec(rest);
    if (operator) {
      tokens.push({ type: operator[0], value: operator[0] });
      offset += operator[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(rest);
    if (!identifier) throw new SyntaxError(source);
    tokens.push({ type: "identifier", value: identifier[0] });
    offset += identifier[0].length;
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

const arities: Readonly<Record<string, readonly [number, number]>> = {
  always: [0, 0],
  success: [0, 0],
  failure: [0, 0],
  cancelled: [0, 0],
  contains: [2, 2],
  startswith: [2, 2],
  endswith: [2, 2],
  fromjson: [1, 1],
  tojson: [1, 1],
  join: [1, 2],
  format: [1, 255],
  case: [3, 255],
  hashfiles: [1, 255],
};

class Parser {
  private offset = 0;
  constructor(readonly source: string, readonly tokens: readonly Token[]) {}
  private current(): Token {
    return this.tokens[this.offset];
  }
  private take(type: string): boolean {
    if (this.current().type !== type) return false;
    this.offset++;
    return true;
  }
  private require(type: string): Token {
    const token = this.current();
    if (!this.take(type)) throw new SyntaxError(this.source);
    return token;
  }
  parse(): Node {
    const result = this.binary(0);
    this.require("eof");
    return result;
  }
  private binary(level: number): Node {
    const operators = [["||"], ["&&"], ["==", "!="], ["<", "<=", ">", ">="]];
    if (level === operators.length) {
      return this.take("!")
        ? { kind: "unary", value: this.binary(level) }
        : this.primary();
    }
    let left = this.binary(level + 1);
    while (operators[level].includes(this.current().type)) {
      const op = this.current().type;
      this.offset++;
      left = { kind: "binary", op, left, right: this.binary(level + 1) };
    }
    return left;
  }
  private primary(): Node {
    let value: Node;
    if (this.take("(")) {
      value = this.binary(0);
      this.require(")");
    } else if (this.current().type === "string") {
      value = { kind: "literal", value: this.require("string").value };
    } else if (this.current().type === "number") {
      value = {
        kind: "literal",
        value: parseNumber(this.require("number").value),
      };
    } else {
      const name = this.require("identifier").value;
      if (this.take("(")) {
        const args: Node[] = [];
        if (!this.take(")")) {
          do args.push(this.binary(0)); while (this.take(","));
          this.require(")");
        }
        const range = arities[name.toLowerCase()];
        if (!range) throw new SyntaxError(name);
        if (args.length < range[0] || args.length > range[1]) {
          throw new TypeError(`Invalid argument count for ${name}.`);
        }
        value = { kind: "call", name, args };
      } else {
        const literals: Readonly<Record<string, unknown>> = {
          true: true,
          false: false,
          null: null,
          NaN: NaN,
          Infinity: Infinity,
        };
        value = Object.hasOwn(literals, name)
          ? { kind: "literal", value: literals[name] }
          : { kind: "context", name };
      }
    }
    while (true) {
      if (this.take(".")) {
        const key = this.take("*") ? "*" : {
          kind: "literal" as const,
          value: this.require("identifier").value,
        };
        value = { kind: "access", value, key };
      } else if (this.take("[")) {
        const key = this.take("*") ? "*" : this.binary(0);
        this.require("]");
        value = { kind: "access", value, key };
      } else break;
    }
    return value;
  }
}

export function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false &&
    value !== 0 && value !== "" && !Number.isNaN(value);
}
function primitive(value: unknown): boolean {
  return value === null || value === undefined || typeof value !== "object";
}
function fold(value: string): string {
  return Array.from(value, (char) => {
    const upper = char.toUpperCase();
    return Array.from(upper).length === 1 ? upper : char;
  }).join("");
}
function numberValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  return typeof value === "number"
    ? value
    : typeof value === "string"
    ? parseNumber(value)
    : NaN;
}
function numberString(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const [digits, exponent] = value.toExponential(14).split("e");
  const power = Number(exponent);
  const mantissa = digits.replace(/\.?0+$/, "");
  return power < -4 || power >= 15
    ? `${mantissa}E${power < 0 ? "-" : "+"}${
      String(Math.abs(power)).padStart(2, "0")
    }`
    : String(Number(`${mantissa}e${power}`));
}
function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return numberString(value);
  if (Array.isArray(value)) return "Array";
  return typeof value === "object" ? "Object" : String(value);
}
function coerce(left: unknown, right: unknown): readonly [unknown, unknown] {
  if (left == null) left = null;
  if (right == null) right = null;
  if (typeof left === typeof right) return [left, right];
  if (typeof left === "boolean" || left === null) {
    return coerce(numberValue(left), right);
  }
  if (typeof right === "boolean" || right === null) {
    return coerce(left, numberValue(right));
  }
  if (
    typeof left === "number" && typeof right === "string" ||
    typeof left === "string" && typeof right === "number"
  ) {
    return [numberValue(left), numberValue(right)];
  }
  return [left, right];
}
function equal(left: unknown, right: unknown): boolean {
  [left, right] = coerce(left, right);
  return typeof left === "string" && typeof right === "string"
    ? fold(left) === fold(right)
    : left === right;
}
function less(left: unknown, right: unknown): boolean {
  [left, right] = coerce(left, right);
  if (typeof left === "string" && typeof right === "string") {
    return fold(left) < fold(right);
  }
  if (typeof left === "boolean" && typeof right === "boolean") {
    return !left && right;
  }
  return typeof left === "number" && typeof right === "number" && left < right;
}

type Value = Readonly<
  { value: unknown; path?: readonly string[]; filtered?: readonly Value[] }
>;
function knownMissing(path: readonly string[]): boolean {
  return ["steps", "needs", "jobs", "inputs", "matrix", "env"].includes(
    path[0],
  ) ||
    path[0] === "job" && ["container", "services"].includes(path[1]);
}
function access(
  base: Value,
  key: unknown,
  wildcard: boolean,
): Value | undefined {
  if (base.filtered) {
    const items = base.filtered.flatMap((item) => {
      const selected = access(item, key, wildcard);
      return selected?.filtered ?? (selected ? [selected] : []);
    });
    return { value: items.map((v) => v.value), filtered: items };
  }
  const value = base.value;
  if (wildcard) {
    const items = value !== null && typeof value === "object"
      ? Object.entries(value).map(([name, value]) => ({
        value,
        ...(base.path ? { path: [...base.path, name] } : {}),
      }))
      : [];
    return { value: items.map((v) => v.value), filtered: items };
  }
  const name = stringValue(key);
  const path = base.path ? [...base.path, name] : undefined;
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      const index = numberValue(key);
      if (index >= 0 && Math.floor(index) < value.length) {
        return { value: value[Math.floor(index)], path };
      }
      return undefined;
    } else if (primitive(key)) {
      const actual = Object.hasOwn(value, name) || base.path?.[0] === "env"
        ? name
        : Object.keys(value).find((k) => fold(k) === fold(name));
      if (
        actual !== undefined && Object.hasOwn(value, actual) &&
        (value as Context)[actual] !== undefined
      ) {
        return { value: (value as Context)[actual], path };
      }
    }
  }
  if (path && !knownMissing(path) && value !== null) {
    throw new MissingContextError(path.join("."));
  }
  return undefined;
}

function format(
  template: string,
  args: readonly Node[],
  evaluate: (node: Node) => unknown,
): string {
  let result = "";
  for (let index = 0; index < template.length;) {
    const char = template[index];
    if (char !== "{" && char !== "}") {
      result += char;
      index++;
      continue;
    }
    if (template[index + 1] === char) {
      result += char;
      index += 2;
      continue;
    }
    const parameter = /^\{(\d+)(?::)?\}/.exec(template.slice(index));
    if (
      char !== "{" || !parameter || Number(parameter[1]) > 255 ||
      Number(parameter[1]) >= args.length
    ) {
      throw new TypeError("Invalid format string or argument index.");
    }
    result += stringValue(evaluate(args[Number(parameter[1])]));
    index += parameter[0].length;
  }
  return result;
}

function json(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return numberString(value);
  if (typeof value !== "object") return JSON.stringify(value);
  const array = Array.isArray(value);
  const entries = Object.entries(value);
  if (!entries.length) return array ? "[]" : "{}";
  const prefix = "  ".repeat(depth + 1);
  const lines = entries.map(([key, value]) =>
    `${prefix}${array ? "" : `${JSON.stringify(key)}: `}${
      json(value, depth + 1)
    }`
  );
  return `${array ? "[" : "{"}\n${lines.join(",\n")}\n${"  ".repeat(depth)}${
    array ? "]" : "}"
  }`;
}

function evalNode(
  node: Node,
  context: Context,
  status: Status,
  hashes?: ReadonlyMap<string, string>,
): Value {
  const resolve = (node: Node) => evalNode(node, context, status, hashes);
  const evaluate = (node: Node) => resolve(node).value;
  switch (node.kind) {
    case "literal":
      return { value: node.value };
    case "context": {
      const name = Object.keys(context).find((k) =>
        fold(k) === fold(node.name)
      );
      if (name === undefined || context[name] === undefined) {
        throw new MissingContextError(node.name);
      }
      return { value: context[name], path: [name.toLowerCase()] };
    }
    case "access": {
      const base = resolve(node.value);
      if (base.value === null || typeof base.value !== "object") {
        return node.key === "*" ? { value: [], filtered: [] } : { value: null };
      }
      return access(
        base,
        node.key === "*" ? null : evaluate(node.key),
        node.key === "*",
      ) ?? { value: null };
    }
    case "unary":
      return { value: !truthy(evaluate(node.value)) };
    case "binary": {
      const left = resolve(node.left);
      if (node.op === "&&") {
        return truthy(left.value) ? resolve(node.right) : left;
      }
      if (node.op === "||") {
        return truthy(left.value) ? left : resolve(node.right);
      }
      const right = evaluate(node.right);
      const a = left.value;
      return {
        value: node.op === "=="
          ? equal(a, right)
          : node.op === "!="
          ? !equal(a, right)
          : node.op === "<"
          ? less(a, right)
          : node.op === ">"
          ? less(right, a)
          : node.op === "<="
          ? equal(a, right) || less(a, right)
          : equal(a, right) || less(right, a),
      };
    }
    case "call": {
      const name = node.name.toLowerCase();
      if (name === "always") return { value: true };
      if (name === "success" || name === "failure" || name === "cancelled") {
        return { value: status[name] };
      }
      if (name === "hashfiles") {
        const key = JSON.stringify(
          node.args.map((arg) => stringValue(evaluate(arg))),
        );
        if (!hashes?.has(key)) throw new MissingHashFilesError();
        return { value: hashes!.get(key)! };
      }
      if (name === "case") {
        if (node.args.length % 2 !== 1) {
          throw new TypeError(
            "case() requires condition/value pairs and a default.",
          );
        }
        for (let index = 0; index < node.args.length - 1; index += 2) {
          if (truthy(evaluate(node.args[index]))) {
            return resolve(node.args[index + 1]);
          }
        }
        return resolve(node.args[node.args.length - 1]);
      }
      const first = evaluate(node.args[0]);
      if (name === "fromjson") return { value: JSON.parse(stringValue(first)) };
      if (name === "tojson") return { value: json(first) };
      if (name === "format") {
        return {
          value: format(stringValue(first), node.args.slice(1), evaluate),
        };
      }
      if (name === "join") {
        if (!Array.isArray(first)) {
          return { value: primitive(first) ? stringValue(first) : "" };
        }
        const separator = first.length > 1 && node.args.length > 1
          ? evaluate(node.args[1])
          : ",";
        return {
          value: first.map(stringValue).join(
            primitive(separator) ? stringValue(separator) : ",",
          ),
        };
      }
      if (
        !primitive(first) &&
        (name !== "contains" || !Array.isArray(first) || !first.length)
      ) return { value: false };
      const second = evaluate(node.args[1]);
      if (name === "contains" && Array.isArray(first)) {
        return { value: first.some((value) => equal(value, second)) };
      }
      if (!primitive(second)) return { value: false };
      const a = fold(stringValue(first));
      const b = fold(stringValue(second));
      return {
        value: name === "contains"
          ? a.includes(b)
          : name === "startswith"
          ? a.startsWith(b)
          : a.endsWith(b),
      };
    }
  }
}

export function hasStatusFunction(source: string): boolean {
  let tokens: Token[];
  try {
    tokens = tokenize(source.trim().replace(/^\$\{\{|\}\}$/g, ""));
  } catch {
    return true;
  }
  return tokens.some((token, index) =>
    token.type === "identifier" &&
    ["always", "success", "failure", "cancelled"].includes(
      token.value.toLowerCase(),
    ) &&
    tokens[index + 1]?.type === "(" && tokens[index - 1]?.type !== "."
  );
}

export function evaluateExpression(
  value: string,
  context: Context,
  status: Status,
  hashes?: ReadonlyMap<string, string>,
): unknown {
  if (!value.includes("${{")) return value;
  const parts: (string | Node)[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("${{", cursor);
    if (start < 0) {
      parts.push(value.slice(cursor));
      break;
    }
    if (start > cursor) parts.push(value.slice(cursor, start));
    let end = start + 3;
    let quoted = false;
    for (; end < value.length; end++) {
      if (value[end] === "'") {
        if (quoted && value[end + 1] === "'") {
          end++;
          continue;
        }
        quoted = !quoted;
      }
      if (!quoted && value.slice(end, end + 2) === "}}") break;
    }
    if (end === value.length) throw new SyntaxError(value);
    const source = value.slice(start + 3, end);
    parts.push(new Parser(source, tokenize(source)).parse());
    cursor = end + 2;
  }
  if (parts.length === 1 && typeof parts[0] !== "string") {
    return evalNode(parts[0], context, status, hashes).value;
  }
  return parts.map((part) =>
    typeof part === "string"
      ? part
      : stringValue(evalNode(part, context, status, hashes).value)
  ).join("");
}
