import type {
  AuthoringPipeline,
  TaskFunction,
  TsugioriConfig,
} from "@tsugiori/core";
import type { Job, Step, Workflow } from "./github_actions/ast.ts";
import {
  type Diagnostic,
  type ValidatedWorkflow,
  validateWorkflow,
} from "./github_actions/validation.ts";

const ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const ACTIONS_CACHE_COMMIT = "55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const ARTIFACT_STEP_ID = "tsugiori-task-artifact";
const PREPARE_STEP_ID = "tsugiori-task-prepare";
const ARTIFACT_KEY_EXPRESSION =
  `\${{ steps.${ARTIFACT_STEP_ID}.outputs.artifact-key }}`;
const CACHE_PATH_EXPRESSION =
  `\${{ steps.${ARTIFACT_STEP_ID}.outputs.cache-path }}`;
const CACHE_KEY =
  `tsugiori-task-${ARTIFACT_KEY_EXPRESSION}-\${{ github.run_id }}-\${{ github.run_attempt }}`;
const CACHE_RESTORE_PREFIX = `tsugiori-task-${ARTIFACT_KEY_EXPRESSION}-`;

export type RegisteredTask = Readonly<{
  entrypoint: string;
  name: string;
  pipelineId: string;
  jobId: string;
  task: TaskFunction;
}>;

export type LoweredPipeline = Readonly<{
  id: string;
  output: string;
  workflow: ValidatedWorkflow;
}>;

export type LoweredConfig = Readonly<{
  pipelines: readonly LoweredPipeline[];
  tasks: readonly RegisteredTask[];
  layoutFingerprints: ReadonlyMap<string, string>;
}>;

export class AuthoringValidationError extends Error {
  readonly errorType = "schema_invalid";
  readonly diagnostics: readonly string[];

  constructor(diagnostics: readonly string[]) {
    super(diagnostics.join("\n"));
    this.name = "AuthoringValidationError";
    this.diagnostics = diagnostics;
  }
}

export async function lowerConfig(
  config: TsugioriConfig,
  configArgument: string,
): Promise<LoweredConfig> {
  const diagnostics: string[] = [];
  const tasks: RegisteredTask[] = [];
  const layoutFingerprints = new Map<string, string>();
  const pipelineIds = new Set<string>();
  const outputs = new Set<string>();
  const loweredPipelines: LoweredPipeline[] = [];

  if (config.kind !== "tsugiori.config") {
    diagnostics.push("Default export must be created by defineTsugiori().");
  }
  if (config.pipelines.length === 0) {
    diagnostics.push("Configuration must contain at least one pipeline.");
  }

  for (const pipeline of config.pipelines) {
    validatePipelineIdentity(pipeline, pipelineIds, outputs, diagnostics);
    const jobs: Job[] = [];

    for (const job of pipeline.jobs) {
      const steps: Step[] = [];
      const taskNames = job.steps
        .filter((step) => step.type === "task")
        .map((step) => step.name);
      if (
        taskNames.length > 0 &&
        job.runsOn.toLowerCase().includes("windows")
      ) {
        diagnostics.push(
          `Job ${JSON.stringify(job.id)} in pipeline ${
            JSON.stringify(pipeline.id)
          } uses task-backed steps on an unsupported Windows runner.`,
        );
      }
      const layoutKey = `${pipeline.id}/${job.id}`;
      const fingerprint = await layoutFingerprint(
        pipeline.id,
        job.id,
        taskNames,
      );
      layoutFingerprints.set(layoutKey, fingerprint);

      let taskOrdinal = 0;
      let preparationEmitted = false;
      for (const step of job.steps) {
        if (step.type === "uses") {
          steps.push({
            type: "uses",
            name: step.name,
            uses: step.uses,
            ...(step.with === undefined ? {} : { with: step.with }),
          });
          continue;
        }
        if (step.type === "run") {
          steps.push({ type: "run", name: step.name, run: step.run });
          continue;
        }

        taskOrdinal += 1;
        if (!preparationEmitted) {
          steps.push(...preparationSteps(
            configArgument,
            `${layoutKey}=${fingerprint}`,
          ));
          preparationEmitted = true;
        }
        const entrypoint = `${layoutKey}/task-${taskOrdinal}`;
        tasks.push({
          entrypoint,
          name: step.name,
          pipelineId: pipeline.id,
          jobId: job.id,
          task: step.task,
        });
        steps.push({
          type: "run",
          name: step.name,
          run: `./.tsugiori/task-runtime ${entrypoint}`,
        });
      }

      jobs.push({
        id: job.id,
        runsOn: { type: "labels", labels: [job.runsOn] },
        needs: job.needs,
        steps,
      });
    }

    const workflow: Workflow = {
      name: pipeline.name,
      events: pipeline.events,
      ...(pipeline.permissions === undefined
        ? {}
        : { permissions: pipeline.permissions }),
      jobs,
    };
    const validation = validateWorkflow(workflow);
    if (validation.ok) {
      loweredPipelines.push({
        id: pipeline.id,
        output: pipeline.output,
        workflow: validation.value,
      });
    } else {
      diagnostics.push(...validation.diagnostics.map(formatDiagnostic));
    }
  }

  if (diagnostics.length > 0) {
    throw new AuthoringValidationError(diagnostics);
  }

  return Object.freeze({
    pipelines: Object.freeze(loweredPipelines),
    tasks: Object.freeze(tasks),
    layoutFingerprints,
  });
}

function validatePipelineIdentity(
  pipeline: AuthoringPipeline,
  ids: Set<string>,
  outputs: Set<string>,
  diagnostics: string[],
): void {
  if (!ID_PATTERN.test(pipeline.id)) {
    diagnostics.push(
      `Pipeline ID ${
        JSON.stringify(pipeline.id)
      } is not a valid entrypoint segment.`,
    );
  }
  if (ids.has(pipeline.id)) {
    diagnostics.push(
      `Pipeline ID ${JSON.stringify(pipeline.id)} is duplicated.`,
    );
  }
  ids.add(pipeline.id);
  if (outputs.has(pipeline.output)) {
    diagnostics.push(
      `Pipeline output ${JSON.stringify(pipeline.output)} is duplicated.`,
    );
  }
  outputs.add(pipeline.output);
}

async function layoutFingerprint(
  pipelineId: string,
  jobId: string,
  taskNames: readonly string[],
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    pipelineId,
    jobId,
    taskNames,
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function preparationSteps(
  configArgument: string,
  expectedLayout: string,
): readonly Step[] {
  const commonArguments = [
    "--config",
    quotePosix(configArgument),
    "--expect-layout",
    quotePosix(expectedLayout),
  ];
  return [
    {
      type: "run",
      name: "Resolve task artifact",
      id: ARTIFACT_STEP_ID,
      run: [
        "tsugiori github-actions task cache-key",
        ...commonArguments,
      ].join(" "),
    },
    {
      type: "uses",
      name: "Restore task artifact cache",
      id: "tsugiori-task-cache-restore",
      continueOnError: true,
      uses: `actions/cache/restore@${ACTIONS_CACHE_COMMIT}`,
      with: {
        path: CACHE_PATH_EXPRESSION,
        key: CACHE_KEY,
        "restore-keys": CACHE_RESTORE_PREFIX,
      },
    },
    {
      type: "run",
      name: "Prepare task artifact",
      id: PREPARE_STEP_ID,
      run: [
        "tsugiori github-actions task prepare",
        ...commonArguments,
        "--expected-key",
        quotePosix(ARTIFACT_KEY_EXPRESSION),
      ].join(" "),
    },
    {
      type: "uses",
      name: "Save task artifact cache",
      if: `steps.${PREPARE_STEP_ID}.outputs.cache-write-required == 'true'`,
      continueOnError: true,
      uses: `actions/cache/save@${ACTIONS_CACHE_COMMIT}`,
      with: {
        path: CACHE_PATH_EXPRESSION,
        key: CACHE_KEY,
      },
    },
  ];
}

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const path = diagnostic.path.length === 0
    ? "<root>"
    : diagnostic.path.join(".");
  return `${diagnostic.code} at ${path}: ${diagnostic.message}`;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
