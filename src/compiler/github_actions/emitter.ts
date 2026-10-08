import { Document, isMap, isScalar, isSeq } from "../../deps.ts";
import type { Job, RunnerSelection, Step, Workflow } from "./ast.ts";
import type { ValidatedWorkflow } from "./validation.ts";

export function emitWorkflow(workflow: ValidatedWorkflow): string {
  const events = Object.fromEntries(
    Object.entries(workflow.on).map(([event, settings]) => {
      if (event === "schedule") return [event, settings];
      const value = settings as Readonly<Record<string, unknown>>;
      return [
        event,
        Object.fromEntries(
          Object.entries(value).map((
            [key, data],
          ) => [
            key,
            ["inputs", "secrets", "outputs"].includes(key)
              ? emitDefinitions(data as Readonly<Record<string, object>>)
              : data,
          ]),
        ),
      ];
    }),
  );
  const jobs = Object.fromEntries(
    workflow.jobs.map((job) => [job.id, emitJob(job)]),
  );

  const document = new Document(
    {
      name: workflow.name,
      ...(workflow.runName === undefined
        ? {}
        : { "run-name": workflow.runName }),
      ...(workflow.env === undefined ? {} : { env: workflow.env }),
      ...(workflow.defaults === undefined
        ? {}
        : { defaults: emitDefaults(workflow.defaults) }),
      on: events,
      ...(workflow.permissions === undefined
        ? {}
        : { permissions: workflow.permissions }),
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
  for (const [index, job] of workflow.jobs.entries()) {
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

function emitJob(job: Job): Record<string, unknown> {
  const emitted: Record<string, unknown> = {
    ...(job.uses === undefined
      ? { "runs-on": emitRunnerSelection(job.runsOn!) }
      : { uses: job.uses }),
    ...(job.name === undefined ? {} : { name: job.name }),
    ...(job.env === undefined ? {} : { env: job.env }),
    ...(job.defaults === undefined
      ? {}
      : { defaults: emitDefaults(job.defaults) }),
    ...(job.with === undefined ? {} : { with: job.with }),
    ...(job.callSecrets === undefined ? {} : {
      secrets: job.callSecrets,
    }),
  };
  if (job.needs.length > 0) {
    emitted.needs = [...job.needs];
  }
  if (job.if !== undefined) emitted.if = job.if;
  if (job.permissions !== undefined) {
    emitted.permissions = job.permissions;
  }
  if (job.timeoutMinutes !== undefined) {
    emitted["timeout-minutes"] = job.timeoutMinutes;
  }
  if (job.environment !== undefined) emitted.environment = job.environment;
  if (job.outputs !== undefined) emitted.outputs = job.outputs;
  if (job.strategy !== undefined) {
    emitted.strategy = {
      ...(job.strategy.failFast === undefined
        ? {}
        : { "fail-fast": job.strategy.failFast }),
      matrix: job.strategy.matrix,
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
    const labels = [...selection.labels];
    return labels.length === 1 ? labels[0] : labels;
  }

  const emitted: Record<string, unknown> = { group: selection.group };
  if (selection.labels !== undefined) {
    emitted.labels = [...selection.labels];
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
  if (step.env !== undefined) emitted.env = step.env;
  if (step.type === "uses") {
    emitted.uses = step.uses;
    if (step.with !== undefined) {
      emitted.with = step.with;
    }
  } else {
    if (step.workingDirectory !== undefined) {
      emitted["working-directory"] = step.workingDirectory;
    }
    if (step.shell !== undefined) emitted.shell = step.shell;
    emitted.run = step.run;
  }
  return emitted;
}

function emitConcurrency(
  value: {
    group: string;
    cancelInProgress: boolean | string;
    queue?: "single" | "max";
  },
): Record<string, unknown> {
  return {
    group: value.group,
    "cancel-in-progress": value.cancelInProgress,
    ...(value.queue === undefined ? {} : { queue: value.queue }),
  };
}

function emitDefinitions<T extends object>(
  definitions: Readonly<Record<string, T>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(definitions).map((
      [key, value],
    ) => [
      key,
      Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
      ),
    ]),
  );
}

function emitDefaults(defaults: NonNullable<Workflow["defaults"]>): unknown {
  return {
    run: {
      ...(defaults.shell === undefined ? {} : { shell: defaults.shell }),
      ...(defaults.workingDirectory === undefined
        ? {}
        : { "working-directory": defaults.workingDirectory }),
    },
  };
}
