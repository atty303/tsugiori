import type {
  AuthoringWorkflow,
  ProjectConfig,
} from "../github_actions/mod.ts";
import type { AuthoringTaskStep } from "../github_actions/mod.ts";
import { isAbsolute } from "node:path";
import type { Job, Step, Workflow } from "./github_actions/ast.ts";
import {
  type Diagnostic,
  type ValidatedWorkflow,
  validateWorkflow,
} from "./github_actions/validation.ts";

const ACTIONS_CACHE_COMMIT = "55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
import { taskPrepareAction } from "../package_identity.ts";
const CACHE_STEP_ID = "tsugiori-task-cache";
const PREPARE_STEP_ID = "tsugiori-task-prepare";

export type RegisteredTask = Readonly<{
  entrypoint: string;
  name: string;
  workflowPath: string;
  jobId: string;
  task: AuthoringTaskStep;
}>;

export type LoweredWorkflow = Readonly<{
  path: string;
  workflow: ValidatedWorkflow;
}>;

export type LoweredProject = Readonly<{
  workflows: readonly LoweredWorkflow[];
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

export async function lowerProject(
  project: ProjectConfig,
  entrypointArgument: string,
  sourceKey = "unresolved",
): Promise<LoweredProject> {
  const diagnostics: string[] = [];
  validateCalls(project, diagnostics);
  const tasks: RegisteredTask[] = [];
  const layoutFingerprints = new Map<string, string>();
  const outputs = new Set<string>();
  const loweredWorkflows: LoweredWorkflow[] = [];
  const projectDirectory = project.workingDirectory;

  if (project.kind !== "github-actions.project") {
    diagnostics.push("Default export must be created by defineProject().");
  }
  if (project.workflows.length === 0) {
    diagnostics.push("Project must contain at least one workflow.");
  }

  for (const workflow of project.workflows) {
    validateWorkflowPath(workflow, outputs, diagnostics);
    const jobs: Job[] = [];

    for (const job of workflow.jobs) {
      if (job.uses !== undefined) {
        jobs.push({
          id: job.id,
          needs: job.needs,
          uses: job.uses,
          callOutputNames: Object.keys(
            job.callee?.on.workflow_call?.outputs ?? {},
          ),
          with: job.with,
          callSecrets: job.callSecrets,
          if: job.if,
          name: job.name,
          strategy: job.strategy,
          concurrency: job.concurrency,
          permissions: job.permissions,
          steps: [],
        });
        continue;
      }
      const steps: Step[] = [];
      const usedStepIds = new Set(
        job.steps.flatMap((step) => step.id === undefined ? [] : [step.id]),
      );
      const taskNames = job.steps
        .filter((step) => step.type === "task")
        .map((step) => step.name);
      if (
        taskNames.length > 0 &&
        (typeof job.runsOn === "string"
          ? job.runsOn
          : job.runsOn?.join(" ") ?? "").toLowerCase().includes("windows")
      ) {
        diagnostics.push(
          `Job ${JSON.stringify(job.id)} in workflow ${
            JSON.stringify(workflow.path)
          } uses task-backed steps on an unsupported Windows runner.`,
        );
      }
      const layoutKey = `${workflow.path}/${job.id}`;
      const fingerprint = await layoutFingerprint(
        workflow.path,
        job.id,
        taskNames,
      );
      layoutFingerprints.set(layoutKey, fingerprint);

      let taskOrdinal = 0;
      let preparationEmitted = false;
      const prepareStepId = allocateStepId(PREPARE_STEP_ID, usedStepIds);
      for (const step of job.steps) {
        if (step.type === "uses") {
          steps.push({
            type: "uses",
            name: step.name,
            ...(step.id === undefined ? {} : { id: step.id }),
            uses: step.uses,
            ...(step.originalRef === undefined
              ? {}
              : { originalRef: step.originalRef }),
            ...(step.if === undefined ? {} : { if: step.if }),
            ...(step.continueOnError === undefined ? {} : {
              continueOnError: step.continueOnError,
            }),
            ...(step.timeoutMinutes === undefined
              ? {}
              : { timeoutMinutes: step.timeoutMinutes }),
            ...(step.env === undefined ? {} : { env: step.env }),
            ...(step.with === undefined ? {} : { with: step.with }),
          });
          continue;
        }
        if (step.type === "run") {
          steps.push({
            type: "run",
            name: step.name,
            ...(step.id === undefined ? {} : { id: step.id }),
            run: step.run,
            ...(step.shell === undefined ? {} : { shell: step.shell }),
            ...(step.if === undefined ? {} : { if: step.if }),
            ...(step.continueOnError === undefined ? {} : {
              continueOnError: step.continueOnError,
            }),
            ...(step.timeoutMinutes === undefined
              ? {}
              : { timeoutMinutes: step.timeoutMinutes }),
            ...(step.env === undefined ? {} : { env: step.env }),
            ...(step.workingDirectory === undefined ? {} : {
              workingDirectory: step.workingDirectory,
            }),
          });
          continue;
        }

        taskOrdinal += 1;
        if (!preparationEmitted) {
          steps.push(...preparationSteps(
            entrypointArgument,
            `${layoutKey}=${fingerprint}`,
            usedStepIds,
            projectDirectory,
            prepareStepId,
            sourceKey,
            taskPrepareAction(project.localTaskPrepareAction) ?? "unresolved",
          ));
          preparationEmitted = true;
        }
        const entrypoint = `${layoutKey}/task-${taskOrdinal}`;
        tasks.push({
          entrypoint,
          name: step.name,
          workflowPath: workflow.path,
          jobId: job.id,
          task: step,
        });
        steps.push({
          type: "run",
          name: step.name,
          ...(step.id === undefined ? {} : { id: step.id }),
          ...(step.if === undefined ? {} : { if: step.if }),
          ...(step.continueOnError === undefined ? {} : {
            continueOnError: step.continueOnError,
          }),
          ...(step.env === undefined ? {} : { env: step.env }),
          ...(step.timeoutMinutes === undefined
            ? {}
            : { timeoutMinutes: step.timeoutMinutes }),
          run: `"\${{ steps.${prepareStepId}.outputs.runtime-path }}" ${
            quotePosix(entrypoint)
          }`,
        });
      }

      jobs.push({
        id: job.id,
        runsOn: {
          type: "labels",
          labels: typeof job.runsOn === "string"
            ? [job.runsOn]
            : job.runsOn ?? [""],
        },
        name: job.name,
        env: job.env,
        defaults: job.defaults,
        needs: job.needs,
        ...(job.if === undefined ? {} : { if: job.if }),
        ...(job.permissions === undefined
          ? {}
          : { permissions: job.permissions }),
        ...(job.timeoutMinutes === undefined
          ? {}
          : { timeoutMinutes: job.timeoutMinutes }),
        ...(job.environment === undefined
          ? {}
          : { environment: job.environment }),
        ...(job.outputs === undefined ? {} : { outputs: job.outputs }),
        ...(job.strategy === undefined ? {} : { strategy: job.strategy }),
        ...(job.concurrency === undefined
          ? {}
          : { concurrency: job.concurrency }),
        steps,
      });
    }

    const nativeWorkflow: Workflow = {
      name: workflow.name,
      on: workflow.on,
      runName: workflow.runName,
      env: workflow.env,
      ...(workflow.concurrency === undefined
        ? {}
        : { concurrency: workflow.concurrency }),
      ...(workflow.permissions === undefined
        ? {}
        : { permissions: workflow.permissions }),
      jobs,
    };
    const validation = validateWorkflow(nativeWorkflow);
    if (validation.ok) {
      loweredWorkflows.push({
        path: workflow.path,
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
    workflows: Object.freeze(loweredWorkflows),
    tasks: Object.freeze(tasks),
    layoutFingerprints,
  });
}

function validateWorkflowPath(
  workflow: AuthoringWorkflow,
  outputs: Set<string>,
  diagnostics: string[],
): void {
  if (!workflow.path.trim() || isAbsolute(workflow.path)) {
    diagnostics.push(
      `Workflow path must be a nonempty project-relative path: ${
        JSON.stringify(workflow.path)
      }`,
    );
  }
  if (outputs.has(workflow.path)) {
    diagnostics.push(
      `Workflow output ${JSON.stringify(workflow.path)} is duplicated.`,
    );
  }
  outputs.add(workflow.path);
}

async function layoutFingerprint(
  workflowPath: string,
  jobId: string,
  taskNames: readonly string[],
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    workflowPath,
    jobId,
    taskNames,
  }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function preparationSteps(
  entrypointArgument: string,
  expectedLayout: string,
  usedStepIds: Set<string>,
  projectDirectory: string,
  prepareStepId: string,
  sourceKey: string,
  action: string,
): readonly Step[] {
  const cacheStepId = allocateStepId(CACHE_STEP_ID, usedStepIds);
  const suffix = `${sourceKey}-\${{ runner.os }}-\${{ runner.arch }}`;
  const cachePath = `\${{ runner.temp }}/tsugiori-artifacts/${suffix}`;
  const entrypoint = entrypointArgument.startsWith(".")
    ? entrypointArgument
    : `./${entrypointArgument}`;
  return [
    {
      type: "uses",
      name: "Cache task artifact",
      id: cacheStepId,
      continueOnError: true,
      uses: `actions/cache@${ACTIONS_CACHE_COMMIT}`,
      with: { path: cachePath, key: `tsugiori-task-${suffix}` },
    },
    {
      type: "uses",
      name: "Prepare task artifact",
      id: prepareStepId,
      uses: action,
      with: {
        "project-directory": projectDirectory,
        entrypoint,
        "expected-layout": expectedLayout,
        "source-key": sourceKey,
        "cache-directory": cachePath,
      },
    },
  ];
}

function allocateStepId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
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

function validateCalls(project: ProjectConfig, diagnostics: string[]): void {
  const workflows = new Set(project.workflows);
  const visit = (
    workflow: AuthoringWorkflow,
    ancestors: readonly AuthoringWorkflow[],
  ): void => {
    if (ancestors.includes(workflow)) {
      diagnostics.push(`Reusable workflow cycle at ${workflow.path}.`);
      return;
    }
    if (ancestors.length >= 10) {
      diagnostics.push(
        `Reusable workflow nesting exceeds ten levels at ${workflow.path}.`,
      );
      return;
    }
    for (const job of workflow.jobs) {
      const target = job.callee;
      if (!target) continue;
      const location = `${workflow.path}.${job.id}`;
      if (!workflows.has(target)) {
        diagnostics.push(
          `${location}: called workflow must be included in the same project.`,
        );
      }
      if (!Object.hasOwn(target.on, "workflow_call")) {
        diagnostics.push(`${location}: target requires workflow_call.`);
      }
      const check = (
        definitions: Readonly<
          Record<
            string,
            { required?: boolean; type?: string; default?: unknown }
          >
        >,
        values: Readonly<Record<string, unknown>>,
        secret: boolean,
      ) => {
        for (const [name, value] of Object.entries(values)) {
          const definition = definitions[name];
          if (!definition) {
            diagnostics.push(
              `${location}: undeclared ${secret ? "secret" : "input"} ${name}.`,
            );
            continue;
          }
          if (typeof value === "string" && value.includes("${{")) continue;
          const actualType = typeof value;
          if (actualType !== (secret ? "string" : definition.type)) {
            diagnostics.push(
              `${location}: invalid type for ${
                secret ? "secret" : "input"
              } ${name}.`,
            );
          }
        }
        for (const [name, definition] of Object.entries(definitions)) {
          if (definition.required && !Object.hasOwn(values, name)) {
            diagnostics.push(
              `${location}: required ${
                secret ? "secret" : "input"
              } ${name} is missing.`,
            );
          }
        }
      };
      check(target.on.workflow_call?.inputs ?? {}, job.with ?? {}, false);
      if (job.callSecrets !== "inherit") {
        check(
          target.on.workflow_call?.secrets ?? {},
          job.callSecrets ?? {},
          true,
        );
      }
      visit(target, [...ancestors, workflow]);
    }
  };
  for (const workflow of project.workflows) visit(workflow, []);
}
