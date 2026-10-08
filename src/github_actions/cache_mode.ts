import type { CacheMode } from "./mod.ts";

const capabilities = { none: 0, read: 1, "write-only": 2, write: 3 } as const;

export function isCacheMode(value: unknown): value is CacheMode {
  return typeof value === "string" && Object.hasOwn(capabilities, value);
}

export function cacheModeWithin(mode: CacheMode, limit: CacheMode): boolean {
  return (capabilities[mode] & capabilities[limit]) === capabilities[mode];
}

// The frozen dependency-caching defaults table and trigger breakdown own this
// classification. PR caches are merge-ref scoped, outside default-branch limits.
const writeTriggers = new Set([
  "push",
  "workflow_dispatch",
  "repository_dispatch",
  "delete",
  "registry_package",
  "page_build",
  "schedule",
  "pull_request",
]);

export function defaultCacheMode(event: string): CacheMode {
  return writeTriggers.has(event) ? "write" : "read";
}
