import { stringify } from "@std/yaml";
import type { Job, RunnerSelection, Step } from "./ast.ts";
import type { ValidatedWorkflow } from "./validation.ts";

export function emitWorkflow(workflow: ValidatedWorkflow): string {
  const events = Object.fromEntries(
    [...workflow.events]
      .sort(compareText)
      .map((event) => [event, {}]),
  );
  const jobs = Object.fromEntries(
    [...workflow.jobs]
      .sort((left, right) => compareText(left.id, right.id))
      .map((job) => [job.id, emitJob(job)]),
  );

  return stringify(
    {
      name: workflow.name,
      on: events,
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

function emitJob(job: Job): Record<string, unknown> {
  const emitted: Record<string, unknown> = {
    "runs-on": emitRunnerSelection(job.runsOn),
  };
  if (job.needs.length > 0) {
    emitted.needs = [...job.needs].sort(compareText);
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

function emitStep(step: Step): Record<string, string> {
  const emitted: Record<string, string> = {};
  if (step.name !== undefined) {
    emitted.name = step.name;
  }
  if (step.type === "uses") {
    emitted.uses = step.uses;
  } else {
    emitted.run = step.run;
  }
  return emitted;
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
