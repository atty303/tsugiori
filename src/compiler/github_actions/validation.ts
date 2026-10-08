import { containerProblems } from "../../github_actions/containers.ts";
import { MatrixError, matrixRows } from "../../github_actions/matrix.ts";
import { permissionLevels } from "../../github_actions/permissions.ts";
import { validateTriggers } from "./triggers.ts";
import type { Job, RunnerSelection, Workflow } from "./ast.ts";

const validatedWorkflowBrand: unique symbol = Symbol("ValidatedWorkflow");

export type ValidatedWorkflow = Workflow & {
  readonly [validatedWorkflowBrand]: true;
};

export type DiagnosticCode =
  | "workflow.native.invalid"
  | "job.call.invalid"
  | "job.container.invalid"
  | "job.services.invalid"
  | "step.timeout.invalid"
  | "step.shell.invalid"
  | "workflow.name.empty"
  | "workflow.on.invalid"
  | "workflow.concurrency.invalid"
  | "workflow.permissions.invalid"
  | "workflow.permissions.key.unsupported"
  | "workflow.permissions.value.invalid"
  | "workflow.jobs.empty"
  | "job.id.invalid"
  | "job.id.duplicate"
  | "job.needs.duplicate"
  | "job.needs.unknown"
  | "job.needs.self"
  | "job.needs.cycle"
  | "job.runs-on.group.empty"
  | "job.runs-on.labels.empty"
  | "job.runs-on.labels.duplicate"
  | "job.runs-on.labels.self-hosted.position"
  | "job.steps.empty"
  | "job.if.empty"
  | "job.permissions.invalid"
  | "job.permissions.key.unsupported"
  | "job.permissions.value.invalid"
  | "job.timeout.invalid"
  | "job.continue-on-error.invalid"
  | "job.environment.empty"
  | "job.environment.invalid"
  | "workflow.defaults.invalid"
  | "job.defaults.invalid"
  | "job.outputs.invalid"
  | "job.strategy.invalid"
  | "job.concurrency.invalid"
  | "step.name.empty"
  | "step.id.invalid"
  | "step.id.duplicate"
  | "step.if.empty"
  | "step.continue-on-error.invalid"
  | "step.uses.empty"
  | "step.with.invalid"
  | "step.with.key.empty"
  | "step.with.value.invalid"
  | "step.run.empty"
  | "step.env.invalid"
  | "step.working-directory.empty";

export type DiagnosticPath = readonly (string | number)[];

export type Diagnostic = Readonly<{
  code: DiagnosticCode;
  path: DiagnosticPath;
  message: string;
}>;

export type ValidationResult =
  | Readonly<{ ok: true; value: ValidatedWorkflow }>
  | Readonly<{ ok: false; diagnostics: readonly Diagnostic[] }>;

const JOB_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const STEP_ID_PATTERN = JOB_ID_PATTERN;

export function validateWorkflow(workflow: Workflow): ValidationResult {
  const diagnostics: Diagnostic[] = [];

  if (isBlank(workflow.name)) {
    diagnostics.push(diagnostic(
      "workflow.name.empty",
      ["name"],
      "Workflow name must not be empty.",
    ));
  }

  const triggerIssues = validateTriggers(workflow.on);
  for (const issue of triggerIssues) {
    diagnostics.push(
      diagnostic("workflow.on.invalid", issue.path, issue.message),
    );
  }
  if (!isPlainRecord(workflow.on)) return { ok: false, diagnostics };
  validateNativeFields(workflow, diagnostics);
  validateConcurrency(
    workflow.concurrency,
    ["concurrency"],
    "workflow.concurrency.invalid",
    diagnostics,
  );

  validatePermissions(
    workflow.permissions,
    ["permissions"],
    "workflow",
    diagnostics,
  );

  if (workflow.jobs.length === 0) {
    diagnostics.push(diagnostic(
      "workflow.jobs.empty",
      ["jobs"],
      "Workflow must declare at least one job.",
    ));
  }

  const jobsById = new Map<string, { job: Job; index: number }>();
  workflow.jobs.forEach((job, jobIndex) => {
    const jobPath = ["jobs", jobIndex] as const;

    if (!JOB_ID_PATTERN.test(job.id)) {
      diagnostics.push(diagnostic(
        "job.id.invalid",
        [...jobPath, "id"],
        `Job ID ${
          JSON.stringify(job.id)
        } must start with a letter or underscore and contain only letters, digits, hyphens, or underscores.`,
      ));
    }

    const existing = jobsById.get(job.id);
    if (existing === undefined) {
      jobsById.set(job.id, { job, index: jobIndex });
    } else {
      diagnostics.push(diagnostic(
        "job.id.duplicate",
        [...jobPath, "id"],
        `Job ID ${
          JSON.stringify(job.id)
        } duplicates jobs[${existing.index}].id.`,
      ));
    }

    if (job.uses === undefined) {
      validateRunnerSelection(job.runsOn ?? { type: "labels", labels: [""] }, [
        ...jobPath,
        "runsOn",
      ], diagnostics);
    } else if (!validCallJob(job)) {
      diagnostics.push(
        diagnostic(
          "job.call.invalid",
          jobPath,
          "Reusable caller jobs require a workflow path and support only caller keywords.",
        ),
      );
    }
    if (
      job.if !== undefined &&
      (typeof job.if !== "string" || isBlank(job.if))
    ) {
      diagnostics.push(
        diagnostic(
          "job.if.empty",
          [...jobPath, "if"],
          "Job condition must not be empty.",
        ),
      );
    }
    if (
      job.continueOnError !== undefined && !validBoolean(job.continueOnError)
    ) {
      diagnostics.push(
        diagnostic("job.continue-on-error.invalid", [
          ...jobPath,
          "continueOnError",
        ], "Job continue-on-error must be a boolean or expression."),
      );
    }
    if (
      job.timeoutMinutes !== undefined &&
      !validTimeout(job.timeoutMinutes, false)
    ) {
      diagnostics.push(
        diagnostic(
          "job.timeout.invalid",
          [...jobPath, "timeoutMinutes"],
          "Job timeout must be a positive integer or an expression.",
        ),
      );
    }
    if (job.environment !== undefined) {
      const environment = job.environment;
      if (
        typeof environment === "string"
          ? isBlank(environment)
          : !isPlainRecord(environment) ||
            typeof environment.name !== "string" || isBlank(environment.name) ||
            (environment.url !== undefined &&
              typeof environment.url !== "string") ||
            (environment.deployment !== undefined &&
              typeof environment.deployment !== "boolean" &&
              !(typeof environment.deployment === "string" &&
                /^\s*\$\{\{[\s\S]+\}\}\s*$/.test(environment.deployment))) ||
            Object.keys(environment).some((k) =>
              !["name", "url", "deployment"].includes(k)
            )
      ) {
        diagnostics.push(
          diagnostic(
            typeof environment === "string"
              ? "job.environment.empty"
              : "job.environment.invalid",
            [...jobPath, "environment"],
            "Environment requires a name and optional string URL and boolean or expression deployment.",
          ),
        );
      }
    }

    if (job.container !== undefined) {
      for (const field of containerProblems(job.container)) {
        diagnostics.push(
          diagnostic(
            "job.container.invalid",
            [...jobPath, "container", field],
            "Invalid job container field.",
          ),
        );
      }
    }
    if (job.services !== undefined) {
      if (!isPlainRecord(job.services)) {
        diagnostics.push(
          diagnostic(
            "job.services.invalid",
            [...jobPath, "services"],
            "Services require a named map.",
          ),
        );
      } else {for (const [id, service] of Object.entries(job.services)) {
          if (!JOB_ID_PATTERN.test(id)) {
            diagnostics.push(
              diagnostic(
                "job.services.invalid",
                [...jobPath, "services", id],
                "Service ID must be a valid identifier.",
              ),
            );
          }
          for (const field of containerProblems(service, true)) {
            diagnostics.push(
              diagnostic("job.services.invalid", [
                ...jobPath,
                "services",
                id,
                field,
              ], "Invalid service field."),
            );
          }
        }}
    }

    validateExpressionMap(
      job.outputs,
      [...jobPath, "outputs"],
      "job.outputs.invalid",
      diagnostics,
    );
    validatePermissions(
      job.permissions,
      [...jobPath, "permissions"],
      "job",
      diagnostics,
    );
    validateStrategy(job.strategy, [...jobPath, "strategy"], diagnostics);
    validateConcurrency(
      job.concurrency,
      [...jobPath, "concurrency"],
      "job.concurrency.invalid",
      diagnostics,
    );

    validateDuplicates(
      job.needs,
      [...jobPath, "needs"],
      "job.needs.duplicate",
      "Job dependency",
      diagnostics,
    );

    if (job.uses === undefined && job.steps.length === 0) {
      diagnostics.push(diagnostic(
        "job.steps.empty",
        [...jobPath, "steps"],
        `Job ${JSON.stringify(job.id)} must declare at least one step.`,
      ));
    }

    const stepIds = new Map<string, number>();
    job.steps.forEach((step, stepIndex) => {
      const stepPath = [...jobPath, "steps", stepIndex] as const;
      if (
        step.timeoutMinutes !== undefined && !validTimeout(step.timeoutMinutes)
      ) {
        diagnostics.push(
          diagnostic(
            "step.timeout.invalid",
            stepPath,
            "Step timeout must be a positive integer up to 360 or an expression.",
          ),
        );
      }
      if (
        step.type === "run" && step.shell !== undefined && isBlank(step.shell)
      ) {
        diagnostics.push(
          diagnostic(
            "step.shell.invalid",
            stepPath,
            "Shell must not be blank.",
          ),
        );
      }
      if (step.name !== undefined && isBlank(step.name)) {
        diagnostics.push(diagnostic(
          "step.name.empty",
          [...stepPath, "name"],
          "Step name must not be empty when provided.",
        ));
      }
      if (step.id !== undefined) {
        if (!STEP_ID_PATTERN.test(step.id)) {
          diagnostics.push(diagnostic(
            "step.id.invalid",
            [...stepPath, "id"],
            `Step ID ${JSON.stringify(step.id)} is invalid.`,
          ));
        }
        const existing = stepIds.get(step.id);
        if (existing === undefined) {
          stepIds.set(step.id, stepIndex);
        } else {
          diagnostics.push(diagnostic(
            "step.id.duplicate",
            [...stepPath, "id"],
            `Step ID ${
              JSON.stringify(step.id)
            } duplicates steps[${existing}].id.`,
          ));
        }
      }
      if (step.if !== undefined && isBlank(step.if)) {
        diagnostics.push(diagnostic(
          "step.if.empty",
          [...stepPath, "if"],
          "Step condition must not be empty when provided.",
        ));
      }
      if (
        step.continueOnError !== undefined &&
        !validBoolean(step.continueOnError)
      ) {
        diagnostics.push(diagnostic(
          "step.continue-on-error.invalid",
          [...stepPath, "continueOnError"],
          "Step continue-on-error must be a boolean or expression.",
        ));
      }
      if (step.type === "uses" && isBlank(step.uses)) {
        diagnostics.push(diagnostic(
          "step.uses.empty",
          [...stepPath, "uses"],
          "Action reference must not be empty.",
        ));
      }
      if (step.type === "uses" && step.with !== undefined) {
        if (!isPlainRecord(step.with)) {
          diagnostics.push(diagnostic(
            "step.with.invalid",
            [...stepPath, "with"],
            "Action inputs must be an object.",
          ));
          return;
        }
        Object.entries(step.with).forEach(([key, value]) => {
          if (isBlank(key)) {
            diagnostics.push(diagnostic(
              "step.with.key.empty",
              [...stepPath, "with", key],
              "Action input name must not be empty.",
            ));
          }
          if (typeof value !== "string") {
            diagnostics.push(diagnostic(
              "step.with.value.invalid",
              [...stepPath, "with", key],
              "Action input must be a string.",
            ));
          }
        });
      }
      if (step.type === "run" && isBlank(step.run)) {
        diagnostics.push(diagnostic(
          "step.run.empty",
          [...stepPath, "run"],
          "Run command must not be empty.",
        ));
      }
      validateExpressionMap(
        step.env,
        [...stepPath, "env"],
        "step.env.invalid",
        diagnostics,
      );
      if (
        step.type === "run" && step.workingDirectory !== undefined &&
        (typeof step.workingDirectory !== "string" ||
          isBlank(step.workingDirectory))
      ) {
        diagnostics.push(
          diagnostic("step.working-directory.empty", [
            ...stepPath,
            "workingDirectory",
          ], "Working directory must not be empty."),
        );
      }
    });
  });

  validateJobReferences(workflow, jobsById, diagnostics);
  validateDependencyCycles(jobsById, diagnostics);

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return { ok: true, value: workflow as ValidatedWorkflow };
}

function validatePermissions(
  permissions: Workflow["permissions"],
  path: DiagnosticPath,
  scope: "workflow" | "job",
  diagnostics: Diagnostic[],
): void {
  if (
    permissions === undefined || permissions === "read-all" ||
    permissions === "write-all"
  ) return;
  if (!isPlainRecord(permissions)) {
    diagnostics.push(diagnostic(
      `${scope}.permissions.invalid`,
      path,
      `${
        scope === "workflow" ? "Workflow" : "Job"
      } permissions must be an object.`,
    ));
    return;
  }
  Object.entries(permissions).forEach(([key, value]) => {
    if (!Object.hasOwn(permissionLevels, key)) {
      diagnostics.push(diagnostic(
        `${scope}.permissions.key.unsupported`,
        [...path, key],
        `Workflow permission ${JSON.stringify(key)} is not supported.`,
      ));
    }
    if (
      Object.hasOwn(permissionLevels, key) &&
      !(permissionLevels[
        key as keyof typeof permissionLevels
      ] as readonly unknown[]).includes(value)
    ) {
      diagnostics.push(
        diagnostic(
          `${scope}.permissions.value.invalid`,
          [...path, key],
          key === "id-token"
            ? "OIDC permission must be none or write."
            : key === "vulnerability-alerts"
            ? "Vulnerability alerts permission must be none or read."
            : "Workflow permission must be none, read, or write.",
        ),
      );
    }
  });
}

function validateConcurrency(
  value: unknown,
  path: DiagnosticPath,
  code: DiagnosticCode,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) || typeof value.group !== "string" ||
    isBlank(value.group) ||
    (typeof value.cancelInProgress !== "boolean" &&
      !isExpression(value.cancelInProgress)) ||
    (value.queue !== undefined &&
      (!["single", "max"].includes(value.queue as string) ||
        value.queue === "max" && value.cancelInProgress === true))
  ) {
    diagnostics.push(
      diagnostic(
        code,
        path,
        "Concurrency requires a nonempty group and boolean or expression cancelInProgress; queue max cannot use literal true. Expression-valued cancellation remains a GitHub runtime check.",
      ),
    );
  }
}

function validateExpressionMap(
  value: unknown,
  path: DiagnosticPath,
  code: DiagnosticCode,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) ||
    Object.entries(value).some(([key, entry]) =>
      isBlank(key) || typeof entry !== "string"
    )
  ) {
    diagnostics.push(
      diagnostic(
        code,
        path,
        "Map must have nonempty keys and string values.",
      ),
    );
  }
}

function validateStrategy(
  value: unknown,
  path: DiagnosticPath,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) ||
    value.failFast !== undefined && !validBoolean(value.failFast) ||
    value.maxParallel !== undefined && !validTimeout(value.maxParallel, false)
  ) {
    diagnostics.push(
      diagnostic(
        "job.strategy.invalid",
        path,
        "Strategy controls require a boolean fail-fast and positive integer max-parallel, or expressions.",
      ),
    );
    return;
  }
  if (isExpression(value.matrix)) return;
  try {
    matrixRows(value.matrix, true);
  } catch (error) {
    if (!(error instanceof MatrixError)) throw error;
    diagnostics.push(
      diagnostic("job.strategy.invalid", [
        ...path,
        "matrix",
        ...(error.field ? [error.field] : []),
      ], error.message),
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function isActionInput(value: unknown): boolean {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

function validateRunnerSelection(
  selection: RunnerSelection,
  path: DiagnosticPath,
  diagnostics: Diagnostic[],
): void {
  if (selection.type === "group" && isBlank(selection.group)) {
    diagnostics.push(diagnostic(
      "job.runs-on.group.empty",
      [...path, "group"],
      "Runner group must not be empty.",
    ));
  }

  if (selection.labels === undefined) {
    return;
  }

  if (selection.labels.length === 0) {
    diagnostics.push(diagnostic(
      "job.runs-on.labels.empty",
      [...path, "labels"],
      "Runner labels must not be empty when provided.",
    ));
  }

  selection.labels.forEach((label, labelIndex) => {
    if (isBlank(label)) {
      diagnostics.push(diagnostic(
        "job.runs-on.labels.empty",
        [...path, "labels", labelIndex],
        "Runner label must not be empty.",
      ));
    }
  });

  const selfHostedIndex = selection.labels.findIndex((label) =>
    runnerLabelKey(label) === "self-hosted"
  );
  if (selfHostedIndex > 0) {
    diagnostics.push(diagnostic(
      "job.runs-on.labels.self-hosted.position",
      [...path, "labels", selfHostedIndex],
      "The self-hosted runner label must be listed first.",
    ));
  }

  validateDuplicates(
    selection.labels,
    [...path, "labels"],
    "job.runs-on.labels.duplicate",
    "Runner label",
    diagnostics,
    runnerLabelKey,
  );
}

function validateJobReferences(
  workflow: Workflow,
  jobsById: ReadonlyMap<string, { job: Job; index: number }>,
  diagnostics: Diagnostic[],
): void {
  workflow.jobs.forEach((job, jobIndex) => {
    job.needs.forEach((dependency, dependencyIndex) => {
      const path = ["jobs", jobIndex, "needs", dependencyIndex] as const;
      if (dependency === job.id) {
        diagnostics.push(diagnostic(
          "job.needs.self",
          path,
          `Job ${JSON.stringify(job.id)} cannot depend on itself.`,
        ));
      } else if (!jobsById.has(dependency)) {
        diagnostics.push(diagnostic(
          "job.needs.unknown",
          path,
          `Job dependency ${JSON.stringify(dependency)} does not exist.`,
        ));
      }
    });
  });
}

function validateDependencyCycles(
  jobsById: ReadonlyMap<string, { job: Job; index: number }>,
  diagnostics: Diagnostic[],
): void {
  let nextIndex = 0;
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (jobId: string): void => {
    indexes.set(jobId, nextIndex);
    lowLinks.set(jobId, nextIndex);
    nextIndex += 1;
    stack.push(jobId);
    onStack.add(jobId);

    const entry = jobsById.get(jobId);
    if (entry === undefined) {
      return;
    }

    for (const dependency of [...entry.job.needs].sort(compareText)) {
      if (dependency === jobId || !jobsById.has(dependency)) {
        continue;
      }
      if (!indexes.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          jobId,
          Math.min(required(lowLinks, jobId), required(lowLinks, dependency)),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          jobId,
          Math.min(required(lowLinks, jobId), required(indexes, dependency)),
        );
      }
    }

    if (required(lowLinks, jobId) !== required(indexes, jobId)) {
      return;
    }

    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
      if (member === jobId) {
        break;
      }
    }
    components.push(component);
  };

  for (const jobId of [...jobsById.keys()].sort(compareText)) {
    if (!indexes.has(jobId)) {
      visit(jobId);
    }
  }

  for (const component of components) {
    if (component.length < 2) {
      continue;
    }
    const sortedIds = component.sort(compareText);
    const first = jobsById.get(sortedIds[0]);
    if (first === undefined) {
      continue;
    }
    diagnostics.push(diagnostic(
      "job.needs.cycle",
      ["jobs", first.index, "needs"],
      `Job dependency cycle includes jobs: ${sortedIds.join(", ")}.`,
    ));
  }
}

function validateDuplicates<T extends string>(
  values: readonly T[],
  path: DiagnosticPath,
  code: DiagnosticCode,
  label: string,
  diagnostics: Diagnostic[],
  keyOf: (value: T) => string = (value) => value,
): void {
  const firstIndexes = new Map<string, number>();
  values.forEach((value, index) => {
    const key = keyOf(value);
    const firstIndex = firstIndexes.get(key);
    if (firstIndex === undefined) {
      firstIndexes.set(key, index);
      return;
    }
    diagnostics.push(diagnostic(
      code,
      [...path, index],
      `${label} ${JSON.stringify(value)} duplicates index ${firstIndex}.`,
    ));
  });
}

function required(
  values: ReadonlyMap<string, number>,
  key: string,
): number {
  const value = values.get(key);
  if (value === undefined) {
    throw new Error(`Missing graph state for ${JSON.stringify(key)}.`);
  }
  return value;
}

function diagnostic(
  code: DiagnosticCode,
  path: DiagnosticPath,
  message: string,
): Diagnostic {
  return { code, path, message };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function runnerLabelKey(label: string): string {
  return label.toLowerCase();
}

function validBoolean(value: unknown): boolean {
  return typeof value === "boolean" || isExpression(value);
}
function validTimeout(value: unknown, step = true): boolean {
  return isExpression(value) ||
    typeof value === "number" && Number.isInteger(value) && value >= 1 &&
      (!step || value <= 360);
}

function validCallJob(job: Job): boolean {
  return job.runsOn === undefined && job.steps.length === 0 &&
    job.env === undefined && job.defaults === undefined &&
    job.container === undefined && job.services === undefined &&
    job.environment === undefined && job.timeoutMinutes === undefined &&
    job.continueOnError === undefined &&
    job.outputs === undefined && typeof job.uses === "string" &&
    (/^\.\/\.github\/workflows\/[^/]+\.ya?ml$/.test(job.uses) ||
      /^[^/]+\/[^/]+\/\.github\/workflows\/[^/]+\.ya?ml@[^\s]+$/.test(
        job.uses,
      )) &&
    !job.uses.includes("${{") &&
    (job.callSecrets === undefined || job.callSecrets === "inherit" ||
      isPlainRecord(job.callSecrets) &&
        Object.values(job.callSecrets).every((v) => typeof v === "string")) &&
    (job.with === undefined ||
      isPlainRecord(job.with) && Object.values(job.with).every(isActionInput));
}
function validateNativeFields(
  workflow: Workflow,
  diagnostics: Diagnostic[],
): void {
  const invalid = (field: string, message: string) =>
    diagnostics.push(
      diagnostic("workflow.native.invalid", field.split("."), message),
    );
  if (
    workflow.on.workflow_call !== undefined
  ) {
    for (
      const [name, d] of Object.entries(
        workflow.on.workflow_call?.outputs ?? {},
      )
    ) {
      if (!JOB_ID_PATTERN.test(name) || !d || typeof d.value !== "string") {
        invalid("on.workflow_call.outputs", "Reusable output is invalid.");
        continue;
      }
      for (const m of d.value.matchAll(/jobs\.([\w-]+)\.outputs\.([\w-]+)/g)) {
        const job = workflow.jobs.find((j) => j.id === m[1]);
        if (
          !job ||
          !(job.callOutputNames?.includes(m[2]) ||
            Object.hasOwn(job.outputs ?? {}, m[2]))
        ) {
          invalid(
            "on.workflow_call.outputs",
            `Unknown job output ${m[1]}.${m[2]}.`,
          );
        }
      }
    }
  }
  validateDefaults(workflow.defaults, ["defaults"], true, diagnostics);
  validateExpressionMap(workflow.env, ["env"], "step.env.invalid", diagnostics);
  for (const job of workflow.jobs) {
    validateExpressionMap(
      job.env,
      ["jobs", job.id, "env"],
      "step.env.invalid",
      diagnostics,
    );
    validateDefaults(
      job.defaults,
      ["jobs", job.id, "defaults"],
      false,
      diagnostics,
    );
  }
}

function isExpression(value: unknown): value is string {
  return typeof value === "string" && /^\$\{\{.+\}\}$/s.test(value);
}
function validateDefaults(
  value: unknown,
  path: DiagnosticPath,
  workflow: boolean,
  diagnostics: Diagnostic[],
): void {
  if (value === undefined) return;
  if (
    !isPlainRecord(value) ||
    Object.entries(value).some(([key, entry]) =>
      !["shell", "workingDirectory"].includes(key) ||
      (entry !== undefined && (typeof entry !== "string" || isBlank(entry) ||
        (workflow && entry.includes("${{"))))
    )
  ) {
    diagnostics.push(
      diagnostic(
        workflow ? "workflow.defaults.invalid" : "job.defaults.invalid",
        path,
        "Run defaults require nonempty shell/directory strings; workflow defaults cannot use expressions.",
      ),
    );
  }
}
