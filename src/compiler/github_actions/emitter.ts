import { parse, stringify } from "../../deps.ts";
import type {
  ActionInputs,
  Job,
  RunnerSelection,
  Step,
  WorkflowPermissions,
} from "./ast.ts";
import type { ValidatedWorkflow } from "./validation.ts";

const RUN_PLACEHOLDER = "tsugiori-run-placeholder";

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

  const yaml = stringify(
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
      compatMode: false,
      lineWidth: -1,
      quoteStyle: '"',
      schema: "core",
      sortKeys: false,
      useAnchors: false,
    },
  );
  return formatWorkflowYaml(yaml, orderedJobs);
}

function formatWorkflowYaml(yaml: string, jobs: readonly Job[]): string {
  const runs = jobs.flatMap((job) =>
    job.steps.flatMap((step, index) =>
      step.type === "run" ? [{ value: step.run, job: job.id, step: index }] : []
    )
  );
  const lines: string[] = [];
  let inJobs = false;
  let seenJob = false;
  let seenStep = false;
  let inSteps = false;
  let runIndex = 0;
  const actions = jobs.flatMap((job) =>
    job.steps.filter((step) => step.type === "uses")
  );
  let actionIndex = 0;

  for (const line of yaml.split("\n")) {
    if (line === "jobs:") {
      inJobs = true;
    } else if (inJobs && /^ {2}\S.*:$/.test(line)) {
      if (seenJob && lines.at(-1) !== "") lines.push("");
      seenJob = true;
      seenStep = false;
      inSteps = false;
    } else if (line === "    steps:") {
      inSteps = true;
    } else if (inSteps && /^ {6}-(?: |$)/.test(line)) {
      if (seenStep && lines.at(-1) !== "") lines.push("");
      seenStep = true;
    }

    if (inSteps && /^(?: {6}- | {8})run: /.test(line)) {
      const run = runs[runIndex++];
      if (run === undefined) {
        throw new Error("YAML output contains an unexpected run command.");
      }
      if (!line.endsWith(`run: ${RUN_PLACEHOLDER}`)) {
        throw new Error("YAML output contains an unexpected run value.");
      }
      const block = literalRunBlock(run.value);
      try {
        const parsed = parse([
          `run: ${block.header}`,
          ...block.lines.map((value) => value === "" ? "" : `  ${value}`),
          "",
        ].join("\n")) as { run: unknown };
        if (parsed.run !== run.value) throw new Error("Run value changed.");
      } catch {
        throw new Error(
          `Run command in job ${JSON.stringify(run.job)} step ${
            run.step + 1
          } cannot be emitted as a YAML literal block.`,
        );
      }
      lines.push(`${line.slice(0, line.indexOf("run: "))}run: ${block.header}`);
      lines.push(
        ...block.lines.map((value) => value === "" ? "" : `          ${value}`),
      );
      continue;
    }
    if (inSteps && /^(?: {6}- | {8})uses: /.test(line)) {
      const ref = actions[actionIndex++]?.originalRef;
      // JSON escaping keeps arbitrary contract annotations on one physical line.
      const comment = ref === undefined
        ? ""
        : ` # ${
          [...ref].some((char) =>
              char.charCodeAt(0) < 32 ||
              [127, 133, 8232, 8233].includes(char.charCodeAt(0))
            )
            ? JSON.stringify(ref).replace(
              /[\u0085\u2028\u2029]/g,
              (char) =>
                `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
            )
            : ref
        }`;
      lines.push(line + comment);
    } else {
      lines.push(line);
    }
  }

  if (runIndex !== runs.length) {
    throw new Error("YAML output is missing a run command.");
  }
  return lines.join("\n");
}

function literalRunBlock(value: string): { header: string; lines: string[] } {
  const chomp = value.endsWith("\n\n") ? "+" : value.endsWith("\n") ? "" : "-";
  const lines = value.split("\n");
  if (value.endsWith("\n")) lines.pop();
  const firstContent = lines.find((line) => line.length > 0) ?? "";
  const indent = /^[ \t]/.test(firstContent) ? "2" : "";
  return { header: `|${indent}${chomp}`, lines };
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
    emitted.run = RUN_PLACEHOLDER;
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
