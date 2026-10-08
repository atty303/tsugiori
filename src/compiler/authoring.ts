import { collectCompositeActions } from "./composite.ts";
import { cacheStepsFor } from "../github_actions/cache_factory_registry.ts";
import type {
  AuthoringCompositeAction,
  AuthoringStep,
  AuthoringWorkflow,
  ProjectConfig,
} from "../github_actions/mod.ts";
import type { AuthoringTaskStep } from "../github_actions/mod.ts";
import { isAbsolute, posix } from "node:path";
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
  prepareStepIds: Readonly<Record<string, string>>;
}>;

export type LoweredCompositeAction = Readonly<
  {
    action: AuthoringCompositeAction;
    steps: readonly Step[];
    preparation?: Readonly<{ prepareStepId: string }>;
  }
>;

export type LoweredProject = Readonly<{
  workflows: readonly LoweredWorkflow[];
  actions: readonly LoweredCompositeAction[];
  tasks: readonly RegisteredTask[];
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

export function taskEntrypointSuffixes(
  steps: readonly AuthoringStep[],
): readonly string[] {
  const tasks = steps.filter((step) => step.type === "task");
  const used = new Set(
    tasks.flatMap((task) => task.id === undefined ? [] : [task.id]),
  );
  let ordinal = 0;
  return tasks.map((task) => {
    if (task.id !== undefined) return task.id;
    let suffix: string;
    do suffix = `task-${++ordinal}`; while (used.has(suffix));
    used.add(suffix);
    return suffix;
  });
}

export function lowerProject(
  project: ProjectConfig,
  entrypointArgument: string,
  sourceKey = "unresolved",
  internalActionLowering = false,
  projectDirectory = project.workingDirectory ?? ".",
  actionSourceKey = sourceKey,
  cacheFactory = cacheStepsFor(project),
): LoweredProject {
  const diagnostics: string[] = [];
  validateCalls(project, diagnostics);
  const collectedActions = internalActionLowering
    ? []
    : collectCompositeActions(project);
  const inspectSteps = (
    steps: readonly import("../github_actions/mod.ts").AuthoringStep[],
    ancestors: readonly AuthoringCompositeAction[],
  ) => {
    for (const step of steps) {
      if (step.type !== "uses" || !step.calleeAction) continue;
      const target = step.calleeAction;
      if (ancestors.includes(target)) {
        diagnostics.push(`Composite Action cycle at ${target.path}.`);
        continue;
      }
      if (ancestors.length >= 10) {
        diagnostics.push(
          `Composite Action nesting exceeds ten levels at ${target.path}.`,
        );
        continue;
      }
      inspectSteps(target.runs.steps, [...ancestors, target]);
    }
  };
  if (!internalActionLowering) {
    for (const workflow of project.workflows) {
      for (const job of workflow.jobs) inspectSteps(job.steps, []);
    }
    for (const action of collectedActions) {
      inspectSteps(action.runs.steps, [action]);
    }
  }
  const tasks: RegisteredTask[] = [];
  const outputs = new Set<string>();
  const loweredWorkflows: LoweredWorkflow[] = [];

  if (project.kind !== "github-actions.project") {
    diagnostics.push("Project value must be created by project().");
  }
  if (project.workflows.length === 0 && (project.actions ?? []).length === 0) {
    diagnostics.push("Project must contain at least one workflow or Action.");
  }

  for (const workflow of project.workflows) {
    validateWorkflowPath(workflow, outputs, diagnostics);
    const jobs: Job[] = [];
    const prepareStepIds: Record<string, string> = {};

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
          : Array.isArray(job.runsOn)
          ? job.runsOn.join(" ")
          : job.runsOn && "group" in job.runsOn
          ? typeof job.runsOn.labels === "string"
            ? job.runsOn.labels
            : job.runsOn.labels?.join(" ") ?? ""
          : "").toLowerCase().includes("windows")
      ) {
        diagnostics.push(
          `Job ${JSON.stringify(job.id)} in workflow ${
            JSON.stringify(workflow.path)
          } uses task-backed steps on an unsupported Windows runner.`,
        );
      }
      const layoutKey = `${workflow.path}/${job.id}`;

      const suffix = `${sourceKey}-\${{ runner.os }}-\${{ runner.arch }}`;
      const cachePath = `\${{ runner.temp }}/tsugiori-artifacts/${suffix}`;
      const cacheKey = `tsugiori-task-${suffix}`;
      const cacheSteps: readonly AuthoringStep[] = taskNames.length === 0
        ? []
        : cacheFactory?.({
          kind: internalActionLowering ? "composite" : "workflow",
          path: cachePath,
          key: cacheKey,
        }) ?? [{
          type: "uses",
          name: "Cache task artifact",
          id: allocateStepId(CACHE_STEP_ID, usedStepIds),
          continueOnError: true,
          uses: `actions/cache@${ACTIONS_CACHE_COMMIT}`,
          with: { path: cachePath, key: cacheKey },
        }];
      for (const step of cacheSteps) {
        if (step.id !== undefined) usedStepIds.add(step.id);
      }

      const taskSuffixes = taskEntrypointSuffixes(job.steps);
      let taskOrdinal = 0;
      let preparationEmitted = false;
      const prepareStepId = allocateStepId(PREPARE_STEP_ID, usedStepIds);
      if (taskNames.length > 0) prepareStepIds[job.id] = prepareStepId;
      const firstTask = job.steps.findIndex((step) => step.type === "task");
      const authoringSteps = firstTask < 0 ? job.steps : [
        ...job.steps.slice(0, firstTask),
        ...cacheSteps,
        ...job.steps.slice(firstTask),
      ];
      for (const step of authoringSteps) {
        if (internalActionLowering) {
          if (step.type === "run" && !step.shell?.trim()) {
            diagnostics.push(
              `Composite ${workflow.path} run steps require shell.`,
            );
          }
          if (step.timeoutMinutes !== undefined) {
            diagnostics.push(
              `Composite ${workflow.path} does not support step timeout-minutes.`,
            );
          }
        }
        if (step.type === "uses") {
          steps.push({
            type: "uses",
            name: step.name,
            ...(step.id === undefined ? {} : { id: step.id }),
            uses: step.calleeAction
              ? localActionReference(
                projectDirectory,
                posix.dirname(step.calleeAction.path),
              )
              : step.uses,
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

        const taskSuffix = taskSuffixes[taskOrdinal++];
        if (!preparationEmitted) {
          steps.push(preparationStep(
            entrypointArgument,
            projectDirectory,
            prepareStepId,
            sourceKey,
            cachePath,
            taskPrepareAction(project.localTaskPrepareAction) ?? "unresolved",
          ));
          preparationEmitted = true;
        }
        const entrypoint = `${layoutKey}/${taskSuffix}`;
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
          ...(step.workingDirectory === undefined
            ? {}
            : { workingDirectory: step.workingDirectory }),
          run: `"\${{ steps.${prepareStepId}.outputs.runtime-path }}" ${
            quotePosix(entrypoint)
          }`,
        });
      }

      jobs.push({
        id: job.id,
        runsOn: typeof job.runsOn === "object" && job.runsOn !== null &&
            "group" in job.runsOn
          ? {
            type: "group",
            group: job.runsOn.group,
            ...(job.runsOn.labels === undefined ? {} : {
              labels: typeof job.runsOn.labels === "string"
                ? [job.runsOn.labels]
                : job.runsOn.labels,
            }),
          }
          : {
            type: "labels",
            labels: typeof job.runsOn === "string" ? [job.runsOn] : job
              .runsOn as import("./github_actions/ast.ts").NonEmptyReadonlyArray<
                string
              > ?? [""],
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
      defaults: workflow.defaults,
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
        prepareStepIds,
      });
    } else {
      diagnostics.push(...validation.diagnostics.map(formatDiagnostic));
    }
  }

  const actions: LoweredCompositeAction[] = [];
  const actionDirectories = new Set<string>();
  for (const action of collectedActions) {
    if (!action.metadata.name.trim() || !action.metadata.description.trim()) {
      diagnostics.push(`Action ${action.path} requires name and description.`);
    }
    const output = action.path;
    const directory = posix.dirname(output);
    if (actionDirectories.has(directory)) {
      diagnostics.push(
        `Action directory ${directory} is duplicated by distinct definitions.`,
      );
    }
    actionDirectories.add(directory);
    if (outputs.has(output)) {
      diagnostics.push(`Action output ${output} is duplicated.`);
    }
    outputs.add(output);
    for (
      const [name, definition] of Object.entries(action.metadata.inputs ?? {})
    ) {
      if (
        !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ||
        typeof definition.description !== "string"
      ) diagnostics.push(`Invalid Action input ${name}.`);
    }
    for (
      const [name, definition] of Object.entries(action.metadata.outputs ?? {})
    ) {
      if (
        !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) ||
        typeof definition.description !== "string" ||
        typeof action.outputValues[name] !== "string"
      ) diagnostics.push(`Invalid Action output ${name}.`);
    }
    // Reuse the native step lowering and task registry. Action preparation is
    // replaced by an ordinary run step in the Action emitter, never executed here.
    const lowered = lowerProject(
      {
        ...project,
        actions: [],
        workflows: [{
          path: action.path,
          name: action.metadata.name,
          on: { push: {} },
          jobs: [{
            id: "composite",
            needs: [],
            runsOn: "ubuntu-latest",
            steps: action.runs.steps,
          }],
        }],
      },
      entrypointArgument,
      actionSourceKey,
      true,
      projectDirectory,
      actionSourceKey,
      cacheFactory,
    );
    tasks.push(...lowered.tasks);
    const prepareStepId = lowered.workflows[0].prepareStepIds.composite;
    actions.push({
      action,
      steps: lowered.workflows[0].workflow.jobs[0].steps,
      ...(lowered.tasks.length === 0 ? {} : { preparation: { prepareStepId } }),
    });
  }

  if (diagnostics.length > 0) {
    throw new AuthoringValidationError(diagnostics);
  }

  return Object.freeze({
    workflows: Object.freeze(loweredWorkflows),
    actions: Object.freeze(actions),
    tasks: Object.freeze(tasks),
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

function preparationStep(
  entrypointArgument: string,
  projectDirectory: string,
  prepareStepId: string,
  sourceKey: string,
  cachePath: string,
  action: string,
): Step {
  const entrypoint = entrypointArgument.startsWith(".")
    ? entrypointArgument
    : `./${entrypointArgument}`;
  return {
    type: "uses",
    name: "Prepare task artifact",
    id: prepareStepId,
    uses: action,
    with: {
      "project-directory": projectDirectory,
      entrypoint,
      "source-key": sourceKey,
      "cache-directory": cachePath,
    },
  };
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

function localActionReference(directory: string, path: string): string {
  const location = posix.normalize(posix.join(directory, path));
  if (
    posix.isAbsolute(location) || location === ".." ||
    location.startsWith("../")
  ) {
    throw new AuthoringValidationError([
      "Action references must remain inside the Actions checkout.",
    ]);
  }
  return location === "." ? "./" : `./${location}`;
}
