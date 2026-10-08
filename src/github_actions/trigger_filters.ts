// GitHub's documented filter grammar is deliberately narrower than a shell glob.
export function filterPattern(pattern: string): RegExp {
  let source = "^";
  let repeatable = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      if (++i === pattern.length) {
        throw new TypeError("Filter ends in an escape.");
      }
      source += escape(pattern[i]);
      repeatable = true;
    } else if (char === "*" && pattern[i + 1] === "*") {
      i++;
      repeatable = false;
      if (pattern[i + 1] === "/") {
        source += "(?:.*/)?";
        i++;
      } else source += ".*";
    } else if (char === "*") {
      source += "[^/]*";
      repeatable = false;
    } else if (char === "?" || char === "+") {
      if (!repeatable) {
        throw new TypeError("Filter repetition has no preceding atom.");
      }
      source += char;
      repeatable = false;
    } else if (char === "[") {
      const end = pattern.indexOf("]", i + 1);
      const contents = pattern.slice(i + 1, end);
      if (end < 0 || !/^[A-Za-z0-9-]+$/.test(contents)) {
        throw new TypeError("Invalid filter character range.");
      }
      source += `[${contents}]`;
      i = end;
      repeatable = true;
    } else {
      source += escape(char);
      repeatable = true;
    }
  }
  return new RegExp(`${source}$`);
}
function escape(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function matchesPatterns(
  name: string,
  patterns: readonly string[],
): boolean {
  let included = false;
  for (const pattern of patterns) {
    const negative = pattern.startsWith("!");
    if (filterPattern(negative ? pattern.slice(1) : pattern).test(name)) {
      included = !negative;
    }
  }
  return included;
}
export function acceptsFilter(
  name: string,
  filters: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  const include = filters[key] as readonly string[] | undefined;
  const ignore = filters[`${key}-ignore`] as readonly string[] | undefined;
  return include
    ? matchesPatterns(name, include)
    : ignore
    ? !matchesPatterns(name, ignore)
    : true;
}
export function validCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const bounds = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const names: Readonly<Record<string, number>>[] = [{}, {}, {}, {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  }, { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 }];
  return fields.every((field, i) =>
    field.split(",").every((item) => {
      const split = item.toUpperCase().split("/");
      if (
        split.length > 2 ||
        split[1] !== undefined &&
          (!/^\d+$/.test(split[1]) || Number(split[1]) < 1)
      ) return false;
      if (split[0] === "*") return true;
      const range = split[0].split("-");
      if (range.length > 2) return false;
      const values = range.map((v) =>
        /^\d+$/.test(v) ? Number(v) : names[i][v]
      );
      return values.every((v) =>
        v !== undefined && v >= bounds[i][0] && v <= bounds[i][1]
      ) && (values.length === 1 || values[0] <= values[1]);
    })
  );
}
