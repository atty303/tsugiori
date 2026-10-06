import { Document, isMap, isScalar, isSeq } from "../../deps.ts";
import type {
  ActionInputs,
  Job,
  RunnerSelection,
  Step,
  WorkflowPermissions,
} from "./ast.ts";
import type { ValidatedWorkflow } from "./validation.ts";

export function emitWorkflow(workflow: ValidatedWorkflow): string {
  const events = Object.fromEntries(
    Object.keys(workflow.on)
      .sort(compareText)
      .map((
        event,
      ) => [
        event,
        event === "push"
          ? {
            ...(workflow.on.push?.branches === undefined
              ? {}
              : { branches: [...workflow.on.push?.branches] }),
            ...(workflow.on.push?.tags === undefined
              ? {}
              : { tags: [...workflow.on.push?.tags] }),
          }
          : event === "pull_request"
          ? (workflow.on.pull_request?.types
            ? { types: workflow.on.pull_request?.types }
            : {})
          : event === "pull_request_target"
          ? (workflow.on.pull_request_target?.types
            ? { types: workflow.on.pull_request_target?.types }
            : {})
          : event === "workflow_dispatch"
          ? (workflow.on.workflow_dispatch?.inputs
            ? { inputs: emitDefinitions(workflow.on.workflow_dispatch?.inputs) }
            : {})
          : event === "workflow_call"
          ? {
            ...(workflow.on.workflow_call?.inputs === undefined
              ? {}
              : { inputs: emitDefinitions(workflow.on.workflow_call.inputs) }),
            ...(workflow.on.workflow_call?.secrets === undefined ? {} : {
              secrets: emitDefinitions(workflow.on.workflow_call.secrets),
            }),
            ...(workflow.on.workflow_call?.outputs
              ? { outputs: emitDefinitions(workflow.on.workflow_call?.outputs) }
              : {}),
          }
          : {},
      ]),
  );
  const orderedJobs = jobsByDependencyLayer(workflow.jobs);
  const jobs = Object.fromEntries(
    orderedJobs
      .map((job) => [job.id, emitJob(job)]),
  );

  const document = new Document(
    {
      name: workflow.name,
      ...(workflow.runName === undefined
        ? {}
        : { "run-name": workflow.runName }),
      ...(workflow.env === undefined ? {} : { env: sortRecord(workflow.env) }),
      on: events,
      ...(workflow.permissions === undefined
        ? {}
        : { permissions: emitPermissions(workflow.permissions) }),
      ...(workflow.concurrency === undefined ? {} : {
        concurrency: emitConcurrency(workflow.concurrency),
      }),
      jobs,
    },
    {
      schema: "core",
      sortMapEntries: false,
      aliasDuplicateObjects: false,
    },
  );
  const jobNodes = document.get("jobs", true);
  if (!isMap(jobNodes)) throw new Error("Workflow jobs must be a YAML map.");
  for (const [index, job] of orderedJobs.entries()) {
    const key = jobNodes.items[index].key;
    if (!isScalar(key)) {
      throw new Error("Workflow job ID must be a YAML scalar.");
    }
    if (index > 0) key.spaceBefore = true;
    if (job.uses !== undefined) continue;
    const steps = document.getIn(["jobs", job.id, "steps"], true);
    if (!isSeq(steps)) {
      throw new Error("Workflow steps must be a YAML sequence.");
    }
    for (const [stepIndex, step] of job.steps.entries()) {
      const node = steps.items[stepIndex];
      if (!isMap(node)) throw new Error("Workflow step must be a YAML map.");
      if (stepIndex > 0) node.spaceBefore = true;
      if (step.type === "uses" && step.originalRef !== undefined) {
        const uses = node.get("uses", true);
        if (!isScalar(uses)) {
          throw new Error("Action reference must be a YAML scalar.");
        }
        uses.comment = ` ${actionRefComment(step.originalRef)}`;
      }
    }
  }
  return document.toString({ lineWidth: 0 });
}

function actionRefComment(ref: string): string {
  // Contract annotations remain on one physical line, including YAML line breaks.
  return [...ref].some((char) =>
      char.charCodeAt(0) < 32 ||
      [127, 133, 8232, 8233].includes(char.charCodeAt(0))
    )
    ? JSON.stringify(ref).replace(
      /[\u0085\u2028\u2029]/g,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
    )
    : ref;
}

function jobsByDependencyLayer(jobs: readonly Job[]): Job[] {
  const ordered: Job[] = [];
  const emitted = new Set<string>();
  let remaining = [...jobs];

  while (remaining.length > 0) {
    const layer = remaining.filter((job) =>
      job.needs.every((dependency) => emitted.has(dependency))
    );
    if (layer.length === 0) {
      throw new Error(
        "Validated workflow contains unresolved job dependencies.",
      );
    }
    ordered.push(...layer);
    for (const job of layer) emitted.add(job.id);
    remaining = remaining.filter((job) => !emitted.has(job.id));
  }

  return ordered;
}

function emitJob(job: Job): Record<string, unknown> {
  const emitted: Record<string, unknown> = {
    ...(job.uses === undefined
      ? { "runs-on": emitRunnerSelection(job.runsOn!) }
      : { uses: job.uses }),
    ...(job.name === undefined ? {} : { name: job.name }),
    ...(job.env === undefined ? {} : { env: sortRecord(job.env) }),
    ...(job.defaults === undefined ? {} : {
      defaults: {
        run: {
          ...(job.defaults.shell === undefined
            ? {}
            : { shell: job.defaults.shell }),
          ...(job.defaults.workingDirectory === undefined
            ? {}
            : { "working-directory": job.defaults.workingDirectory }),
        },
      },
    }),
    ...(job.with === undefined ? {} : { with: sortRecord(job.with) }),
    ...(job.callSecrets === undefined ? {} : {
      secrets: job.callSecrets === "inherit"
        ? "inherit"
        : sortRecord(job.callSecrets),
    }),
  };
  if (job.needs.length > 0) {
    emitted.needs = [...job.needs].sort(compareText);
  }
  if (job.if !== undefined) emitted.if = job.if;
  if (job.permissions !== undefined) {
    emitted.permissions = emitPermissions(job.permissions);
  }
  if (job.timeoutMinutes !== undefined) {
    emitted["timeout-minutes"] = job.timeoutMinutes;
  }
  if (job.environment !== undefined) emitted.environment = job.environment;
  if (job.outputs !== undefined) emitted.outputs = sortRecord(job.outputs);
  if (job.strategy !== undefined) {
    emitted.strategy = {
      ...(job.strategy.failFast === undefined
        ? {}
        : { "fail-fast": job.strategy.failFast }),
      matrix: typeof job.strategy.matrix === "string"
        ? job.strategy.matrix
        : sortRecord(job.strategy.matrix),
    };
  }
  if (job.concurrency !== undefined) {
    emitted.concurrency = emitConcurrency(job.concurrency);
  }
  if (job.uses === undefined) emitted.steps = job.steps.map(emitStep);
  return emitted;
}

function emitRunnerSelection(selection: RunnerSelection): unknown {
  if (selection.type === "labels") {
    const labels = sortRunnerLabels(selection.labels);
    return labels.length === 1 ? labels[0] : labels;
  }

  const emitted: Record<string, unknown> = { group: selection.group };
  if (selection.labels !== undefined) {
    emitted.labels = sortRunnerLabels(selection.labels);
  }
  return emitted;
}

export function emitStep(step: Step): Record<string, unknown> {
  const emitted: Record<string, unknown> = {};
  if (step.name !== undefined) {
    emitted.name = step.name;
  }
  if (step.id !== undefined) {
    emitted.id = step.id;
  }
  if (step.if !== undefined) {
    emitted.if = step.if;
  }
  if (step.continueOnError !== undefined) {
    emitted["continue-on-error"] = step.continueOnError;
  }
  if (step.timeoutMinutes !== undefined) {
    emitted["timeout-minutes"] = step.timeoutMinutes;
  }
  if (step.env !== undefined) emitted.env = sortRecord(step.env);
  if (step.type === "uses") {
    emitted.uses = step.uses;
    if (step.with !== undefined) {
      emitted.with = emitActionInputs(step.with);
    }
  } else {
    emitted.run = step.run;
    if (step.shell !== undefined) emitted.shell = step.shell;
    if (step.workingDirectory !== undefined) {
      emitted["working-directory"] = step.workingDirectory;
    }
  }
  return emitted;
}

function emitConcurrency(
  value: { group: string; cancelInProgress: boolean; queue?: "max" },
): Record<string, unknown> {
  return {
    group: value.group,
    "cancel-in-progress": value.cancelInProgress,
    ...(value.queue === undefined ? {} : { queue: value.queue }),
  };
}

function sortRecord<T>(record: Readonly<Record<string, T>>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareText(left, right)),
  );
}

function emitPermissions(
  permissions: WorkflowPermissions,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(permissions).sort(([left], [right]) =>
      compareText(left, right)
    ),
  );
}

function emitActionInputs(inputs: ActionInputs): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(inputs).sort(([left], [right]) => compareText(left, right)),
  );
}

function sortRunnerLabels(labels: readonly string[]): string[] {
  return [...labels].sort((left, right) => {
    const leftKey = runnerLabelKey(left);
    const rightKey = runnerLabelKey(right);
    if (leftKey === "self-hosted") {
      return rightKey === "self-hosted" ? compareText(left, right) : -1;
    }
    if (rightKey === "self-hosted") {
      return 1;
    }
    return compareText(leftKey, rightKey) || compareText(left, right);
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function runnerLabelKey(label: string): string {
  return label.toLowerCase();
}

function emitDefinitions<T extends object>(
  definitions: Readonly<Record<string, T>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(definitions).sort(([a], [b]) => compareText(a, b)).map((
      [key, value],
    ) => [
      key,
      Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
      ),
    ]),
  );
}
