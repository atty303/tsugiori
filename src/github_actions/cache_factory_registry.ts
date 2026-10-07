import type { AuthoringStep, TaskArtifactCacheContext } from "./mod.ts";

type CacheSteps = (
  context: TaskArtifactCacheContext,
) => readonly AuthoringStep[];

const factories = new WeakMap<object, CacheSteps>();

export function registerCacheSteps(project: object, factory: CacheSteps): void {
  factories.set(project, factory);
}

export function cacheStepsFor(project: object): CacheSteps | undefined {
  return factories.get(project);
}
