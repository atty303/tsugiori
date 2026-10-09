import snapshot from "./github_spec.json" with { type: "json" };

type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> }
  : T;
/** The specification basis and coverage shipped with this Tsugiori source/version.
 * Normal authoring, generation and scenario interpretation never fetch specifications.
 * Coverage describes Tsugiori capability, not successful hosted execution.
 * Schema 2 classifies each implementation unit as implemented, limited,
 * unimplemented or excluded; reference rows describe source guidance rather
 * than additional capabilities. Unimplemented does not promise a delivery date.
 * Count implemented/limited/unimplemented rows for the implementation scope;
 * report excluded and reference rows separately. Counts describe inventory
 * units, not a percentage of all GitHub behavior. Assessments explain evidence
 * or boundaries, notes give the concrete scope, and optional related entries
 * link other rows by `domain:key` within this same inventory.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
 * @example Count the shipped classification without including reference or excluded rows in implementation scope.
 * ```ts
 * const counts = githubActionsSpec.coverage.reduce<Record<string, number>>(
 *   (result, item) => {
 *     result[item.status] = (result[item.status] ?? 0) + 1;
 *     return result;
 *   },
 *   {},
 * );
 * const implementationScope = githubActionsSpec.coverage.filter((item) =>
 *   ["implemented", "limited", "unimplemented"].includes(item.status)
 * );
 * ```
 */
export const githubActionsSpec: Frozen<typeof snapshot> = freeze(snapshot);

function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
