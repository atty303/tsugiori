import { parse } from "../../deps.ts";
import type { ActionContract } from "../../../../../src/github_actions/action_contract.ts";
import { ServiceError } from "../../errors.ts";

// v1 is immutable: changes that alter emitted bytes require a new generator module.
export function generateV1(
  yaml: string,
  uses: string,
  sourceUrl: string,
  originalRef?: string,
): string {
  let value: unknown;
  try {
    value = parse(yaml);
    validateMetadata(value);
  } catch (cause) {
    throw new ServiceError("metadata_invalid", 422, { cause });
  }
  const { runs: _runs, ...metadata } = value;
  const { originalRef: _originalRef, ...fields } = metadata;
  const contract = {
    ...fields,
    uses,
    ...(originalRef === undefined ? {} : { originalRef }),
  };
  return `${
    doc([
      metadata.name,
      metadata.description,
      ...(metadata.author ? [`@author ${metadata.author}`] : []),
      `@see ${sourceUrl}`,
    ])
  }\nconst contract = ${
    emit(contract)
  } as const;\n\nexport default contract;\n`;
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) throw new TypeError("Expected mapping");
}
function string(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new TypeError("Expected string");
}
function validateMetadata(
  value: unknown,
): asserts value is ActionContract & Record<string, unknown> & {
  runs: unknown;
} {
  record(value);
  string(value.name);
  string(value.description);
  if (value.author !== undefined) string(value.author);
  record(value.runs);
  if (value.branding !== undefined) {
    record(value.branding);
    for (const key of ["icon", "color"]) {
      if (value.branding[key] !== undefined) string(value.branding[key]);
    }
  }
  for (const kind of ["inputs", "outputs"]) {
    if (value[kind] === undefined) continue;
    record(value[kind]);
    for (const [name, entry] of Object.entries(value[kind])) {
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
        throw new TypeError("Invalid input/output name");
      }
      record(entry);
      string(entry.description);
      if (kind === "inputs") {
        if (
          entry.required !== undefined && typeof entry.required !== "boolean"
        ) throw new TypeError("Invalid required flag");
        if (entry.deprecationMessage !== undefined) {
          string(entry.deprecationMessage);
        }
        if (
          entry.default !== undefined && entry.default !== null &&
          typeof entry.default !== "string" &&
          typeof entry.default !== "boolean" &&
          !(typeof entry.default === "number" && Number.isFinite(entry.default))
        ) throw new TypeError("Invalid default scalar");
      } else if (entry.value !== undefined) string(entry.value);
    }
  }
  // Unknown metadata is retained only when it has a faithful JSON/TS representation.
  validateData(value, new Set(), 0, { remaining: 10_000 });
}
function validateData(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
  budget: { remaining: number },
): void {
  if (--budget.remaining < 0) throw new TypeError("Metadata expansion limit");
  if (depth > 64) throw new TypeError("Metadata nesting limit");
  if (
    value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (typeof value !== "object" || ancestors.has(value)) {
    throw new TypeError("Unsupported or recursive metadata");
  }
  if (!Array.isArray(value)) record(value);
  ancestors.add(value);
  for (const item of Object.values(value)) {
    validateData(item, ancestors, depth + 1, budget);
  }
  ancestors.delete(value);
}
function doc(lines: readonly string[], indent = ""): string {
  return `${indent}/**\n${
    lines.flatMap((line) =>
      line.replaceAll("*/", "*\\/").replaceAll("\r", "").split("\n")
    ).map((line) => `${indent} * ${line}`).join("\n")
  }\n${indent} */`;
}
function emit(value: unknown, level = 0, kind?: string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => emit(item, level + 1)).join(", ")}]`;
  }
  const indent = "  ".repeat(level + 1);
  const properties = Object.entries(value).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  ).map(([key, entry]) => {
    let comment = "";
    if (
      (kind === "inputs" || kind === "outputs") && typeof entry === "object" &&
      entry !== null
    ) {
      const info = entry as Record<string, unknown>;
      const lines = [String(info.description)];
      if (info.default !== undefined) {
        lines.push(`Default: ${JSON.stringify(info.default)}`);
      }
      if (info.deprecationMessage !== undefined) {
        lines.push(`@deprecated ${info.deprecationMessage}`);
      }
      comment = `${doc(lines, indent)}\n`;
    }
    // Computed keys preserve even __proto__ as data rather than prototype setters.
    return `${comment}${indent}[${JSON.stringify(key)}]: ${
      emit(entry, level + 1, key)
    },`;
  });
  return `{\n${properties.join("\n")}\n${"  ".repeat(level)}}`;
}
