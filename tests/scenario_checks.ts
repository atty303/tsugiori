import { assertEquals } from "@std/assert";
import { scenario, type ScenarioResult } from "../src/testing/mod.ts";
import type {
  TestableWorkflow,
  TestJobsOf,
} from "../src/github_actions/mod.ts";

// Keep assertions captured in matrix/callee fixture scopes outside interpretation.
export async function checkedScenario<const W extends TestableWorkflow>(
  workflow: W,
  define: (
    test: Parameters<Parameters<typeof scenario<W>>[1]>[0],
    check: (assertion: (result: ScenarioResult<TestJobsOf<W>>) => void) => void,
  ) => void,
  options: Parameters<typeof scenario>[2] = {},
): Promise<ScenarioResult<TestJobsOf<W>>> {
  const checks: ((result: ScenarioResult<TestJobsOf<W>>) => void)[] = [];
  const result = await scenario(
    workflow,
    (test) => define(test, (check) => checks.push(check)),
    options,
  );
  for (const check of checks) check(result);
  return result;
}
export function assertEntries(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
): void {
  for (const [key, value] of Object.entries(expected)) {
    assertEquals(actual[key], value);
  }
}
export function matchingInstances<
  T extends { matrix: Readonly<Record<string, unknown>> },
>(
  instances: readonly T[],
  matrix: Readonly<Record<string, unknown>>,
): readonly T[] {
  return instances.filter((instance) =>
    Object.entries(matrix).every(([key, value]) =>
      JSON.stringify(instance.matrix[key]) === JSON.stringify(value)
    )
  );
}
