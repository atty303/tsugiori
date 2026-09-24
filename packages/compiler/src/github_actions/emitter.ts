import { stringify } from "@std/yaml";
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
    [...workflow.events]
      .sort(compareText)
      .map((
        event,
      ) => [
        event,
        event === "push" && workflow.pushBranches !== undefined
          ? { branches: [...workflow.pushBranches].sort(compareText) }
          : {},
      ]),
  );
  const jobs = Object.fromEntries(
    jobsByDependencyLayer(workflow.jobs)
      .map((job) => [job.id, emitJob(job)]),
  );

  return stringify(
    {
      name: workflow.name,
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
      compatMode: false,
      lineWidth: -1,
      schema: "core",
      sortKeys: false,
      useAnchors: false,
    },
  );
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
    "runs-on": emitRunnerSelection(job.runsOn),
  };
  if (job.needs.length > 0) {
    emitted.needs = [...job.needs].sort(compareText);
  }
  if (job.if !== undefined) emitted.if = job.if;
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
      matrix: sortRecord(job.strategy.matrix),
    };
  }
  if (job.concurrency !== undefined) {
    emitted.concurrency = emitConcurrency(job.concurrency);
  }
  emitted.steps = job.steps.map(emitStep);
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

function emitStep(step: Step): Record<string, unknown> {
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
  if (step.env !== undefined) emitted.env = sortRecord(step.env);
  if (step.type === "uses") {
    emitted.uses = step.uses;
    if (step.with !== undefined) {
      emitted.with = emitActionInputs(step.with);
    }
  } else {
    emitted.run = step.run;
    if (step.workingDirectory !== undefined) {
      emitted["working-directory"] = step.workingDirectory;
    }
  }
  return emitted;
}

function emitConcurrency(
  value: { group: string; cancelInProgress: boolean },
): Record<string, unknown> {
  return { group: value.group, "cancel-in-progress": value.cancelInProgress };
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
