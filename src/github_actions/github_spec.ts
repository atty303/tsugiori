import snapshot from "./github_spec.json" with { type: "json" };

type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> }
  : T;
/** The specification basis and coverage shipped with this Tsugiori source/version.
 * Normal authoring, generation and scenario interpretation never fetch specifications.
 * Coverage describes Tsugiori capability, not successful hosted execution.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
 */
export const githubActionsSpec: Frozen<typeof snapshot> = freeze(snapshot);

function freeze<T>(value: T): Frozen<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Frozen<T>;
}
