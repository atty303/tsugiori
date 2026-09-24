import type { Job, RunnerSelection, Workflow } from "./ast.ts";

const validatedWorkflowBrand: unique symbol = Symbol("ValidatedWorkflow");

export type ValidatedWorkflow = Workflow & {
  readonly [validatedWorkflowBrand]: true;
};

export type DiagnosticCode =
  | "workflow.name.empty"
  | "workflow.events.empty"
  | "workflow.events.duplicate"
  | "workflow.push-branches.invalid"
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
  | "job.steps.empty"
  | "job.if.empty"
  | "job.timeout.invalid"
  | "job.environment.empty"
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

  if (workflow.events.length === 0) {
    diagnostics.push(diagnostic(
      "workflow.events.empty",
      ["events"],
      "Workflow must declare at least one event.",
    ));
  }
  validateDuplicates(
    workflow.events,
    ["events"],
    "workflow.events.duplicate",
    "Workflow event",
    diagnostics,
  );

  if (
    workflow.pushBranches !== undefined &&
    (!workflow.events.includes("push") ||
      !Array.isArray(workflow.pushBranches) ||
      workflow.pushBranches.length === 0 ||
      workflow.pushBranches.some((branch) =>
        typeof branch !== "string" || isBlank(branch)
      ) ||
      new Set(workflow.pushBranches).size !== workflow.pushBranches.length)
  ) {
    diagnostics.push(
      diagnostic(
        "workflow.push-branches.invalid",
        ["pushBranches"],
        "Push branches require a push event and nonempty unique branch names.",
      ),
    );
  }
  validateConcurrency(
    workflow.concurrency,
    ["concurrency"],
    "workflow.concurrency.invalid",
    diagnostics,
  );

  validatePermissions(workflow.permissions, diagnostics);

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

    validateRunnerSelection(job.runsOn, [...jobPath, "runsOn"], diagnostics);
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
      job.timeoutMinutes !== undefined &&
      (!Number.isInteger(job.timeoutMinutes) || job.timeoutMinutes < 1 ||
        job.timeoutMinutes > 360)
    ) {
      diagnostics.push(
        diagnostic(
          "job.timeout.invalid",
          [...jobPath, "timeoutMinutes"],
          "Job timeout must be an integer from 1 to 360 minutes.",
        ),
      );
    }
    if (
      job.environment !== undefined &&
      (typeof job.environment !== "string" || isBlank(job.environment))
    ) {
      diagnostics.push(
        diagnostic(
          "job.environment.empty",
          [...jobPath, "environment"],
          "Job environment must not be empty.",
        ),
      );
    }
    validateExpressionMap(
      job.outputs,
      [...jobPath, "outputs"],
      "job.outputs.invalid",
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

    if (job.steps.length === 0) {
      diagnostics.push(diagnostic(
        "job.steps.empty",
        [...jobPath, "steps"],
        `Job ${JSON.stringify(job.id)} must declare at least one step.`,
      ));
    }

    const stepIds = new Map<string, number>();
    job.steps.forEach((step, stepIndex) => {
      const stepPath = [...jobPath, "steps", stepIndex] as const;
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
        typeof step.continueOnError !== "boolean"
      ) {
        diagnostics.push(diagnostic(
          "step.continue-on-error.invalid",
          [...stepPath, "continueOnError"],
          "Step continue-on-error must be a boolean when provided.",
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
          if (!isActionInput(value)) {
            diagnostics.push(diagnostic(
              "step.with.value.invalid",
              [...stepPath, "with", key],
              "Action input must be a string, boolean, or finite number.",
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
  diagnostics: Diagnostic[],
): void {
  if (permissions === undefined) return;
  if (!isPlainRecord(permissions)) {
    diagnostics.push(diagnostic(
      "workflow.permissions.invalid",
      ["permissions"],
      "Workflow permissions must be an object.",
    ));
    return;
  }
  Object.entries(permissions).forEach(([key, value]) => {
    if (key !== "contents") {
      diagnostics.push(diagnostic(
        "workflow.permissions.key.unsupported",
        ["permissions", key],
        `Workflow permission ${JSON.stringify(key)} is not supported.`,
      ));
    }
    if (value !== "none" && value !== "read" && value !== "write") {
      diagnostics.push(diagnostic(
        "workflow.permissions.value.invalid",
        ["permissions", key],
        "Workflow permission must be none, read, or write.",
      ));
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
    isBlank(value.group) || typeof value.cancelInProgress !== "boolean"
  ) {
    diagnostics.push(
      diagnostic(
        code,
        path,
        "Concurrency requires a nonempty group and boolean cancelInProgress.",
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
      isBlank(key) || typeof entry !== "string" || isBlank(entry)
    )
  ) {
    diagnostics.push(
      diagnostic(
        code,
        path,
        "Map must have nonempty keys and nonempty string values.",
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
    (value.failFast !== undefined && typeof value.failFast !== "boolean") ||
    !isPlainRecord(value.matrix) ||
    Object.entries(value.matrix).some(([key, entry]) =>
      isBlank(key) || !(typeof entry === "string" && !isBlank(entry) ||
        Array.isArray(entry) && entry.length > 0 &&
          entry.every((item) => typeof item === "string" && !isBlank(item)))
    )
  ) {
    diagnostics.push(
      diagnostic(
        "job.strategy.invalid",
        path,
        "Strategy matrix requires nonempty axes with expression or string-list values.",
      ),
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
