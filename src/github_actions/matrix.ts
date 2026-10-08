/** Shared native matrix expansion for compiler validation and scenarios. */
export class MatrixError extends TypeError {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}
function matrixValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number" && Number.isFinite(value) ||
    record(value) && Object.values(value).every(matrixValue);
}
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return record(a) && record(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([key, value]) =>
      Object.hasOwn(b, key) && equal(value, b[key])
    );
}
function entries(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const rows = value[key];
  if (rows === undefined) return [];
  if (
    !Array.isArray(rows) ||
    !rows.every((row) => record(row) && Object.values(row).every(matrixValue))
  ) {
    throw new MatrixError(key, `${key} must be an array of matrix objects.`);
  }
  return rows;
}
function matches(
  row: Record<string, unknown>,
  entry: Record<string, unknown>,
): boolean {
  return Object.entries(entry).every(([key, value]) =>
    Object.hasOwn(row, key) && equal(row[key], value)
  );
}
/** Validate syntax without resolving expression axes, then expand only known matrices. */
export function matrixRows(
  value: unknown,
  allowExpressions = false,
): Record<string, unknown>[] | undefined {
  if (!record(value) || Object.keys(value).length === 0) {
    throw new MatrixError("", "Matrix must be a nonempty object.");
  }
  const names = Object.keys(value).map((key) => key.toLowerCase());
  if (
    new Set(names).size !== names.length || names.some((key) => !key.trim())
  ) {
    throw new MatrixError(
      "",
      "Matrix keys must be nonempty and unique ignoring case.",
    );
  }
  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key.toLowerCase(), v]),
  );
  const included = entries(normalized, "include");
  const excluded = entries(normalized, "exclude");
  const axes = Object.entries(value).filter(([key]) =>
    key.toLowerCase() !== "include" && key.toLowerCase() !== "exclude"
  );
  let dynamic = false;
  for (const [name, axis] of axes) {
    if (
      allowExpressions && typeof axis === "string" &&
      /^\s*\$\{\{[\s\S]+\}\}\s*$/.test(axis)
    ) {
      dynamic = true;
      continue;
    }
    if (!Array.isArray(axis) || axis.length === 0 || !axis.every(matrixValue)) {
      throw new MatrixError(
        name,
        "Matrix axis must be a nonempty array of scalar or object values.",
      );
    }
  }
  for (const row of [...included, ...excluded]) {
    const keys = Object.keys(row).map((key) => key.toLowerCase());
    if (new Set(keys).size !== keys.length || keys.some((key) => !key.trim())) {
      throw new MatrixError(
        "",
        "Matrix row keys must be nonempty and unique ignoring case.",
      );
    }
  }
  if (dynamic) return undefined;
  const rows: Record<string, unknown>[] = [];
  const add = (row: Record<string, unknown>) => {
    rows.push(row);
    if (rows.length > 256) {
      throw new MatrixError("", "Matrix expands to more than 256 jobs.");
    }
  };
  const canonical = new Map(axes.map(([key]) => [key.toLowerCase(), key]));
  const normalizedRow = (row: Record<string, unknown>) => {
    return Object.fromEntries(
      Object.entries(row).map(([key, v]) => {
        const lower = key.toLowerCase();
        if (!canonical.has(lower)) canonical.set(lower, key);
        return [canonical.get(lower)!, v];
      }),
    );
  };
  const excludes = excluded.map(normalizedRow);
  const visit = (index: number, row: Record<string, unknown>) => {
    if (index === axes.length) {
      if (!excludes.some((entry) => matches(row, entry))) add(row);
      return;
    }
    const [name, values] = axes[index];
    for (const v of values as unknown[]) {
      visit(index + 1, { ...row, [name]: v });
    }
  };
  if (axes.length) visit(0, {});
  const original = rows.map((row) => ({ ...row }));
  for (const item of included) {
    const entry = normalizedRow(item);
    let matched = false;
    for (const [index, row] of original.entries()) {
      if (
        Object.entries(entry).every(([key, expected]) =>
          !(key in row) || equal(row[key], expected)
        )
      ) {
        Object.assign(rows[index], entry);
        matched = true;
      }
    }
    if (!matched) add({ ...entry });
  }
  return rows;
}
