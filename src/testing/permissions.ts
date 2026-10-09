import { permissionLevels } from "../github_actions/permissions.ts";
import type { WorkflowPermissions } from "../github_actions/mod.ts";
import { ScenarioError, type TokenPermissions } from "./mod.ts";

export type TokenPolicy = Readonly<{
  permissions: TokenPermissions;
  path: readonly string[];
}>;

export function expandPermissions(
  value: WorkflowPermissions,
  location: string,
): TokenPermissions {
  if (
    value !== "read-all" && value !== "write-all" && (
      !value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
  ) {
    throw new ScenarioError(
      "fixture_invalid",
      location,
      "Supply a native permission map or read-all/write-all.",
    );
  }
  if (typeof value === "object") {
    for (const [scope, level] of Object.entries(value)) {
      const levels = permissionLevels[scope as keyof typeof permissionLevels] as
        | readonly string[]
        | undefined;
      if (!Object.hasOwn(permissionLevels, scope) || !levels?.includes(level)) {
        throw new ScenarioError(
          "fixture_invalid",
          `${location}.${scope}`,
          "Unknown scope or unsupported permission level.",
        );
      }
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(permissionLevels).map(([scope, levels]) => {
        const allowed: readonly string[] = levels;
        const level = value === "write-all"
          ? allowed.at(-1)!
          : value === "read-all"
          ? (allowed.includes("read") ? "read" : "none")
          : value[scope as keyof typeof value] ?? "none";
        return [scope, level];
      }),
    ) as TokenPermissions,
  );
}

export function resolvePermissions(
  declaration: WorkflowPermissions | undefined,
  defaults: TokenPermissions,
  restrictWrites: boolean,
  location: string,
  caller?: TokenPolicy,
): TokenPermissions {
  const requested = declaration === undefined
    ? defaults
    : expandPermissions(declaration, location);
  if (caller) {
    const rank = { none: 0, read: 1, write: 2 };
    for (
      const scope of Object.keys(permissionLevels) as (keyof TokenPermissions)[]
    ) {
      if (rank[requested[scope]] > rank[caller.permissions[scope]]) {
        throw new ScenarioError(
          "fixture_invalid",
          `${location}.${scope}`,
          `Token permission demand exceeds caller ceiling along ${
            [...caller.path, location].join(" -> ")
          }: ${scope} requests ${requested[scope]}, ceiling ${
            caller.permissions[scope]
          }.`,
        );
      }
    }
  }
  if (!restrictWrites) return requested;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(requested).map(([scope, level]) => [
        scope,
        level === "write"
          ? ((permissionLevels[
              scope as keyof typeof permissionLevels
            ] as readonly string[]).includes("read")
            ? "read"
            : "none")
          : level,
      ]),
    ) as TokenPermissions,
  );
}
