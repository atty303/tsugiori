import type { JobRuntime, RunnerRuntime, StepGitHub } from "./mod.ts";
import { ScenarioError } from "./mod.ts";

const jobFields = [
  "check_run_id",
  "workflow_ref",
  "workflow_sha",
  "workflow_repository",
  "workflow_file_path",
] as const satisfies readonly (keyof JobRuntime)[];
const runnerFields = [
  "name",
  "os",
  "arch",
  "temp",
  "tool_cache",
  "debug",
  "environment",
] as const satisfies readonly (keyof RunnerRuntime)[];
const stepFields = [
  "action",
  "action_path",
  "action_ref",
  "action_repository",
  "action_status",
  "artifacts",
  "artifacts_list",
  "env",
  "event_path",
  "job",
  "path",
  "token",
  "workspace",
] as const satisfies readonly (keyof StepGitHub)[];

function validate(
  value: unknown,
  fields: readonly string[],
  accepts: (key: string, value: unknown) => boolean,
  location: string,
): void {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some((key) =>
      typeof key !== "string" || !fields.includes(key) ||
      !accepts(key, (value as Record<string, unknown>)[key])
    )
  ) {
    throw new ScenarioError(
      "fixture_invalid",
      location,
      "Context fixture must contain only allowed runner-owned fields with their native value types.",
    );
  }
}

export function validateJobRuntime(value: JobRuntime, location: string): void {
  validate(
    value,
    jobFields,
    (key, v) =>
      key === "check_run_id"
        ? typeof v === "number" && Number.isSafeInteger(v) && v >= 0
        : typeof v === "string",
    location,
  );
}
export function validateRunnerRuntime(
  value: RunnerRuntime,
  location: string,
): void {
  validate(
    value,
    runnerFields,
    (key, v) =>
      key === "environment"
        ? v === "github-hosted" || v === "self-hosted"
        : typeof v === "string",
    location,
  );
}
export function validateStepGitHub(value: StepGitHub, location: string): void {
  validate(value, stepFields, (_key, v) => typeof v === "string", location);
}
