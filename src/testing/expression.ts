export class UnsupportedExpressionError extends Error {
  constructor(readonly source: string) {
    super(`Unsupported GitHub Actions expression: ${source}`);
    this.name = "UnsupportedExpressionError";
  }
}

export class MissingContextError extends Error {
  constructor(readonly path: string) {
    super(`Scenario fixture is missing referenced context ${path}.`);
    this.name = "MissingContextError";
  }
}

type Value = unknown;
type Context = Readonly<Record<string, unknown>>;
type Status = Readonly<{
  success: boolean;
  failure: boolean;
  cancelled: boolean;
}>;

type Token = Readonly<{ type: string; value: string }>;

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
      if (rest[cursor] !== "'") throw new UnsupportedExpressionError(source);
      tokens.push({ type: "string", value });
      offset += cursor + 1;
      continue;
    }
    const operator = /^(?:&&|\|\||==|!=|<=|>=|[!<>().,\[\]*])/.exec(rest);
    if (operator) {
      tokens.push({ type: operator[0], value: operator[0] });
      offset += operator[0].length;
      continue;
    }
    const number = /^-?(?:\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      offset += number[0].length;
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_-]*/.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] });
      offset += identifier[0].length;
      continue;
    }
    throw new UnsupportedExpressionError(source);
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

type Node =
  | Readonly<{ kind: "literal"; value: Value }>
  | Readonly<{ kind: "path"; parts: readonly string[] }>
  | Readonly<{ kind: "unary"; value: Node }>
  | Readonly<{ kind: "binary"; op: string; left: Node; right: Node }>
  | Readonly<{ kind: "call"; name: string; args: readonly Node[] }>;

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
    if (!this.take(type)) throw new UnsupportedExpressionError(this.source);
    return token;
  }
  parse(): Node {
    const result = this.parseOr();
    this.require("eof");
    return result;
  }
  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.take("||")) {
      left = { kind: "binary", op: "||", left, right: this.parseAnd() };
    }
    return left;
  }
  private parseAnd(): Node {
    let left = this.parseCompare();
    while (this.take("&&")) {
      left = { kind: "binary", op: "&&", left, right: this.parseCompare() };
    }
    return left;
  }
  private parseCompare(): Node {
    let left = this.parseUnary();
    while (["==", "!=", "<", "<=", ">", ">="].includes(this.current().type)) {
      const op = this.current().type;
      this.offset++;
      left = { kind: "binary", op, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Node {
    if (this.take("!")) return { kind: "unary", value: this.parseUnary() };
    return this.parsePrimary();
  }
  private parsePrimary(): Node {
    if (this.take("(")) {
      const value = this.parseOr();
      this.require(")");
      return value;
    }
    if (this.current().type === "string") {
      return { kind: "literal", value: this.require("string").value };
    }
    if (this.current().type === "number") {
      return { kind: "literal", value: Number(this.require("number").value) };
    }
    const identifier = this.require("identifier").value;
    if (identifier === "true") return { kind: "literal", value: true };
    if (identifier === "false") return { kind: "literal", value: false };
    if (identifier === "null") return { kind: "literal", value: null };
    if (this.take("(")) {
      const args: Node[] = [];
      if (!this.take(")")) {
        do args.push(this.parseOr()); while (this.take(","));
        this.require(")");
      }
      return { kind: "call", name: identifier, args };
    }
    const parts = [identifier];
    while (true) {
      if (this.take(".")) {
        if (this.take("*")) parts.push("*");
        else parts.push(this.require("identifier").value);
      } else if (this.take("[")) {
        const token = this.current();
        if (token.type !== "string" && token.type !== "number") {
          throw new UnsupportedExpressionError(this.source);
        }
        this.offset++;
        parts.push(token.value);
        this.require("]");
      } else break;
    }
    return { kind: "path", parts };
  }
}

export function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false &&
    value !== 0 && value !== "";
}

function numberValue(value: unknown): number {
  if (value === null) return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value.trim() === "" ? 0 : Number(value);
  return NaN;
}

function equal(left: unknown, right: unknown): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  if (typeof left === typeof right) return left === right;
  return numberValue(left) === numberValue(right);
}

function pathValue(parts: readonly string[], context: Context): unknown {
  function visit(current: unknown, index: number): unknown {
    if (index === parts.length) return current;
    const requested = parts[index];
    const part = parts[0] === "matrix" && index > 0 && current !== null &&
        typeof current === "object"
      ? Object.keys(current).find((key) =>
        key.toLowerCase() === requested.toLowerCase()
      ) ?? requested
      : requested;
    if (part === "*") {
      const values = Array.isArray(current)
        ? current
        : current && typeof current === "object"
        ? Object.values(current)
        : [];
      return values.map((value) => visit(value, index + 1));
    }
    if (current === null || typeof current !== "object" || !(part in current)) {
      if (
        parts[0] === "steps" || parts[0] === "needs" || parts[0] === "jobs" ||
        (parts[0] === "inputs" || parts[0] === "matrix") && index > 0
      ) return "";
      throw new MissingContextError(parts.slice(0, index + 1).join("."));
    }
    return visit((current as Record<string, unknown>)[part], index + 1);
  }
  return visit(context, 0);
}

function evalNode(node: Node, context: Context, status: Status): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "path":
      return pathValue(node.parts, context);
    case "unary":
      return !truthy(evalNode(node.value, context, status));
    case "binary": {
      const left = evalNode(node.left, context, status);
      if (node.op === "&&") {
        return truthy(left) ? evalNode(node.right, context, status) : left;
      }
      if (node.op === "||") {
        return truthy(left) ? left : evalNode(node.right, context, status);
      }
      const right = evalNode(node.right, context, status);
      if (node.op === "==") return equal(left, right);
      if (node.op === "!=") return !equal(left, right);
      const a = numberValue(left);
      const b = numberValue(right);
      if (node.op === "<") return a < b;
      if (node.op === "<=") return a <= b;
      if (node.op === ">") return a > b;
      if (node.op === ">=") return a >= b;
      throw new UnsupportedExpressionError(node.op);
    }
    case "call": {
      const name = node.name.toLowerCase();
      if (name === "always") return true;
      if (name === "success") return status.success;
      if (name === "failure") return status.failure;
      if (name === "cancelled") return status.cancelled;
      if (name === "hashfiles") {
        throw new UnsupportedExpressionError("hashFiles()");
      }
      if (name === "case") {
        for (let index = 0; index < node.args.length - 1; index += 2) {
          if (truthy(evalNode(node.args[index], context, status))) {
            return evalNode(node.args[index + 1], context, status);
          }
        }
        return evalNode(node.args[node.args.length - 1], context, status);
      }
      if (
        ![
          "fromjson",
          "tojson",
          "contains",
          "startswith",
          "endswith",
          "join",
          "format",
        ].includes(name)
      ) {
        throw new UnsupportedExpressionError(node.name);
      }
      const args = node.args.map((arg) => evalNode(arg, context, status));
      if (name === "fromjson") return JSON.parse(String(args[0]));
      if (name === "tojson") return JSON.stringify(args[0]);
      if (name === "contains") {
        return Array.isArray(args[0])
          ? args[0].some((value) => equal(value, args[1]))
          : String(args[0]).toLowerCase().includes(
            String(args[1]).toLowerCase(),
          );
      }
      if (name === "startswith") {
        return String(args[0]).toLowerCase()
          .startsWith(String(args[1]).toLowerCase());
      }
      if (name === "endswith") {
        return String(args[0]).toLowerCase()
          .endsWith(String(args[1]).toLowerCase());
      }
      if (name === "join") {
        return Array.isArray(args[0])
          ? args[0].join(args[1] === undefined ? "," : String(args[1]))
          : String(args[0]);
      }
      if (name === "format") {
        return String(args[0]).replace(
          /\{\{|\}\}|\{(\d+)\}/g,
          (token, index: string | undefined) =>
            index === undefined
              ? token[0]
              : String(args[Number(index) + 1] ?? ""),
        );
      }
      throw new UnsupportedExpressionError(node.name);
    }
  }
}

export function hasStatusFunction(source: string): boolean {
  return /\b(?:always|success|failure|cancelled)\s*\(/i.test(source);
}

export function evaluateExpression(
  value: string,
  context: Context,
  status: Status,
): unknown {
  const evaluate = (source: string) =>
    evalNode(new Parser(source, tokenize(source)).parse(), context, status);
  const whole = /^\$\{\{([\s\S]*?)\}\}$/.exec(value);
  if (whole) return evaluate(whole[1]);
  if (!value.includes("${{")) return value;
  const pattern = /\$\{\{([\s\S]*?)\}\}/g;
  const interpolated = value.replace(
    pattern,
    (_match, source: string) => String(evaluate(source) ?? ""),
  );
  if (interpolated.includes("${{")) throw new UnsupportedExpressionError(value);
  return interpolated;
}
