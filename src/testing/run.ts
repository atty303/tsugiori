import {
  expandPermissions,
  resolvePermissions,
  type TokenPolicy,
} from "./permissions.ts";
import {
  validateJobRuntime,
  validateRunnerRuntime,
  validateStepGitHub,
} from "./contexts.ts";
import { flattenSteps } from "../github_actions/steps.ts";
import { defaultCacheMode } from "../github_actions/cache_mode.ts";
import type { CacheMode } from "../github_actions/mod.ts";
import { containerContext, validateContainerRuntime } from "./containers.ts";
import { MatrixError, matrixRows } from "../github_actions/matrix.ts";
import { triggered as matchesTrigger } from "./triggers.ts";
import type { AuthoringJob, ProjectConfig } from "../github_actions/mod.ts";
import { lowerProject } from "../compiler/authoring.ts";
import type { Job, Step } from "../compiler/github_actions/ast.ts";
import { parseWireValue, serializeValue } from "../task/mod.ts";
import {
  evaluateExpression,
  hasStatusFunction,
  MissingContextError,
  MissingHashFilesError,
  truthy,
} from "./expression.ts";
import {
  type Fixture,
  type InstanceRules,
  type JobInstanceResult,
  type JobResult,
  type JobRules,
  type JobSettings,
  type Program,
  type ResolvedConcurrency,
  type ResolvedStrategy,
  type Result,
  ScenarioError,
  type ScenarioObservationState,
  type ScenarioResult,
  type StepOutcome,
  type StepResult,
  type StepRules,
  type TokenPermissions,
} from "./mod.ts";

const stepHashes = Symbol("stepHashFiles");
type Context = Record<string, unknown> & {
  [stepHashes]?: ReadonlyMap<string, string>;
};

function serverContext(context: Context): Context {
  return {
    ...context,
    github: { ...(context.github as object), job: null, token: null },
  };
}
type CachePolicy = Readonly<{
  explicit?: CacheMode;
  settings?: Pick<JobSettings, "cacheMode" | "cacheModeSource">;
}>;
function cachePolicy(
  job: Job,
  workflowMode: CacheMode | undefined,
  callerMode: CacheMode | undefined,
  context: Context,
  interpret: boolean,
): CachePolicy {
  const explicit = job.cacheMode ?? workflowMode ?? callerMode;
  if (!interpret) return { explicit };
  const event = (context.github as Record<string, unknown> | undefined)
    ?.event_name;
  if (
    explicit === undefined &&
    (typeof event !== "string" || event === "workflow_call")
  ) {
    throw new ScenarioError(
      "fixture_missing",
      `${job.id}.cache-mode`,
      "Trigger-dependent cache defaults require the original github.event_name fixture.",
    );
  }
  return {
    explicit,
    settings: {
      cacheMode: explicit ?? defaultCacheMode(event as string),
      cacheModeSource: job.cacheMode !== undefined
        ? "job"
        : workflowMode !== undefined
        ? "workflow"
        : callerMode !== undefined
        ? "caller"
        : "trigger",
    },
  };
}
type Status = Readonly<{
  success: boolean;
  failure: boolean;
  cancelled: boolean;
}>;

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    !left || !right || typeof left !== "object" || typeof right !== "object"
  ) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((v, i) => same(v, right[i]));
  }
  const a = Object.keys(left);
  const b = Object.keys(right);
  return a.length === b.length &&
    a.every((key) =>
      Object.hasOwn(right, key) && same(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      )
    );
}

function expectValue(
  actual: unknown,
  expected: unknown,
  location: string,
): void {
  if (!same(actual, expected)) {
    throw new ScenarioError(
      "expectation_failed",
      location,
      "Expected value differs from the interpreted workflow value.",
    );
  }
}

function expectSubset(
  actual: Readonly<Record<string, unknown>>,
  expected: Readonly<Record<string, unknown>>,
  location: string,
): void {
  for (const [name, value] of Object.entries(expected)) {
    expectValue(actual[name], value, `${location}.${name}`);
  }
}

function evaluateAt(
  value: string,
  context: Context,
  status: Status,
  location: string,
  field: string,
): unknown {
  try {
    return evaluateExpression(value, context, status, context[stepHashes]);
  } catch (error) {
    if (error instanceof ScenarioError) {
      throw new ScenarioError(
        error.kind,
        `${location}.${field}`,
        error.message,
        { cause: error },
      );
    }
    if (error instanceof MissingHashFilesError) {
      throw new ScenarioError(
        "fixture_missing",
        `${location}.${field}`,
        error.message,
        { cause: error },
      );
    }
    if (error instanceof MissingContextError) {
      throw new ScenarioError(
        "fixture_missing",
        `${location}.${field}`,
        error.message,
        { cause: error },
      );
    }
    throw new ScenarioError(
      "expression_error",
      `${location}.${field}`,
      "Expression evaluation failed.",
      { cause: error },
    );
  }
}

function condition(
  value: string | undefined,
  context: Context,
  status: Status,
  location: string,
): boolean {
  if (!status.success && (!value || !hasStatusFunction(value))) return false;
  if (!value) return true;
  return truthy(evaluateAt(value, context, status, location, "if"));
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function evaluateMap(
  values:
    | Readonly<Record<string, unknown>>
    | undefined,
  context: Context,
  status: Status,
  location: string,
  prefix: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    result[key] = typeof value === "string"
      ? evaluateAt(
        value,
        context,
        status,
        location,
        `${prefix}.${key}`,
      )
      : value;
  }
  return result;
}

function expandMatrix(
  job: Job,
  context: Context,
  status: Status,
  location: string,
): readonly Record<string, unknown>[] {
  const definition = job.strategy?.matrix;
  if (definition === undefined) return [{}];
  const value = typeof definition === "string"
    ? evaluateAt(
      definition,
      context,
      status,
      location,
      "strategy.matrix",
    )
    : evaluateMap(
      definition,
      context,
      status,
      location,
      "strategy.matrix",
    );
  try {
    return matrixRows(value)!;
  } catch (error) {
    if (!(error instanceof MatrixError)) throw error;
    throw new ScenarioError(
      "fixture_invalid",
      `${location}.strategy.matrix${error.field ? `.${error.field}` : ""}`,
      error.message,
      { cause: error },
    );
  }
}

function aggregate(instances: readonly JobInstanceResult[]): Result {
  if (instances.length === 0) return "skipped";
  if (instances.some((item) => item.result === "failure")) return "failure";
  if (instances.some((item) => item.result === "cancelled")) return "cancelled";
  if (instances.every((item) => item.result === "skipped")) return "skipped";
  return "success";
}

function validateRules(
  rules: InstanceRules,
  authorJob: AuthoringJob,
  location: string,
): void {
  if (rules.jobRuntime !== undefined) {
    validateJobRuntime(rules.jobRuntime, `${location}.jobRuntime`);
  }
  if (rules.runner !== undefined) {
    validateRunnerRuntime(rules.runner, `${location}.runner`);
  }
  for (const [id, rule] of rules.steps) {
    if (rule.github !== undefined) {
      validateStepGitHub(rule.github, `${location}.${id}.github`);
    }
  }
  const ids = new Set(flattenSteps(authorJob.steps).map((step) => step.id));
  for (const id of rules.steps.keys()) {
    if (!ids.has(id)) {
      throw new ScenarioError(
        "fixture_invalid",
        `${location}.${id}`,
        "Unknown authored step ID.",
      );
    }
  }
}

function mergeStep(
  base: StepRules | undefined,
  specific: StepRules,
): StepRules {
  if (!base || specific.inherit === false) return specific;
  const merged: StepRules = {
    ...base,
    ...specific,
    hashFiles: new Map([...base.hashFiles ?? [], ...specific.hashFiles ?? []]),
  };
  for (
    const key of [
      "github",
      "expectedRunSettings",
      "expectedInputs",
      "expectedOutputs",
    ] as const
  ) {
    if (base[key] !== undefined || specific[key] !== undefined) {
      merged[key] = { ...base[key], ...specific[key] };
    }
  }
  return merged;
}
function mergedRules(base: JobRules, instance: InstanceRules): InstanceRules {
  return {
    jobRuntime:
      base.jobRuntime === undefined && instance.jobRuntime === undefined
        ? undefined
        : { ...base.jobRuntime, ...instance.jobRuntime },
    runner: base.runner === undefined && instance.runner === undefined
      ? undefined
      : { ...base.runner, ...instance.runner },
    steps: new Map([
      ...base.steps,
      ...Array.from(
        instance.steps,
        ([id, rule]) => [id, mergeStep(base.steps.get(id), rule)] as const,
      ),
    ]),
    internals: new Map([...base.internals, ...instance.internals]),
    expectedResult: instance.expectedResult,
    containerInitialization: instance.containerInitialization ??
      base.containerInitialization,
    containerRuntime: instance.containerRuntime ?? base.containerRuntime,
    environmentProtection: instance.environmentProtection ??
      base.environmentProtection,
    expectedSettings: instance.expectedSettings ?? base.expectedSettings,
    expectedStepOrder: instance.expectedStepOrder ?? base.expectedStepOrder,
    call: instance.call ?? base.call,
    callFixture: instance.callFixture ?? base.callFixture,
    expectedCallInputs: instance.expectedCallInputs ?? base.expectedCallInputs,
    expectedCallSecrets: instance.expectedCallSecrets ??
      base.expectedCallSecrets,
  };
}

function internalKind(
  step: Step,
): "cache" | "prepare" | undefined {
  if (step.name === "Cache task artifact") return "cache";
  if (step.name === "Prepare task artifact") return "prepare";
  return undefined;
}

function stepStatus(
  steps: Readonly<Record<string, StepResult>>,
  initializationFailed = false,
): Status {
  const conclusions = Object.values(steps).map((step) => step.conclusion);
  return {
    success: !initializationFailed && !conclusions.includes("failure") &&
      !conclusions.includes("cancelled"),
    failure: initializationFailed || conclusions.includes("failure"),
    cancelled: conclusions.includes("cancelled"),
  };
}

function booleanSetting(
  value: boolean | string | undefined,
  context: Context,
  status: Status,
  location: string,
  field: string,
  fallback = false,
): boolean {
  if (value === undefined) return fallback;
  const resolved = typeof value === "boolean"
    ? value
    : evaluateAt(value, context, status, location, field);
  if (typeof resolved !== "boolean") {
    throw new ScenarioError(
      "expression_error",
      `${location}.${field}`,
      "Setting must resolve to boolean.",
    );
  }
  return resolved;
}
function integerSetting(
  value: number | string,
  context: Context,
  status: Status,
  location: string,
  field: string,
  maximum = Infinity,
): number {
  const resolved = typeof value === "number"
    ? value
    : evaluateAt(value, context, status, location, field);
  if (
    typeof resolved !== "number" || !Number.isInteger(resolved) ||
    resolved < 1 || resolved > maximum
  ) {
    throw new ScenarioError(
      "expression_error",
      `${location}.${field}`,
      "Setting must resolve to a positive integer within its limit.",
    );
  }
  return resolved;
}
function resolvedConcurrency(
  value: Job["concurrency"],
  context: Context,
  status: Status,
  location: string,
): ResolvedConcurrency | undefined {
  if (!value) return undefined;
  const cancelInProgress = typeof value.cancelInProgress === "boolean"
    ? value.cancelInProgress
    : evaluateAt(
      value.cancelInProgress,
      context,
      status,
      location,
      "concurrency.cancel-in-progress",
    );
  if (
    typeof cancelInProgress !== "boolean" ||
    (value.queue === "max" && cancelInProgress)
  ) {
    throw new ScenarioError(
      "expression_error",
      `${location}.concurrency.cancel-in-progress`,
      "Cancellation must resolve to boolean; queue max requires false.",
    );
  }
  return {
    group: stringValue(
      evaluateAt(
        value.group,
        context,
        status,
        location,
        "concurrency.group",
      ),
    ),
    cancelInProgress,
    ...(value.queue === undefined ? {} : { queue: value.queue }),
  };
}
function resolvedContainerSettings(
  value: unknown,
  context: Context,
  status: Status,
  location: string,
  field: string,
): unknown {
  if (typeof value === "string") {
    return stringValue(
      evaluateAt(value, context, status, location, field),
    );
  }
  if (Array.isArray(value)) {
    return value.map((v, i) =>
      resolvedContainerSettings(
        v,
        context,
        status,
        location,
        `${field}.${i}`,
      )
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map((
        [k, v],
      ) => [
        k,
        resolvedContainerSettings(
          v,
          context,
          status,
          location,
          `${field}.${k}`,
        ),
      ]),
    );
  }
  return value;
}

function resolvedSettings(
  job: Job,
  context: Context,
  status: Status,
  location: string,
): JobSettings {
  const server = serverContext(context);
  const scalar = (value: string, field: string) =>
    stringValue(evaluateAt(value, server, status, location, field));
  const labels = (values: readonly string[], field: string) =>
    values.map((v, i) =>
      scalar(v, `${field}.${i}`)
    ) as unknown as import("../github_actions/mod.ts").NonEmptyReadonlyArray<
      string
    >;
  const selection = job.runsOn;
  const environment = job.environment;
  const deployment =
    typeof environment === "object" && environment.deployment !== undefined
      ? typeof environment.deployment === "boolean"
        ? environment.deployment
        : evaluateAt(
          environment.deployment,
          server,
          status,
          location,
          "environment.deployment",
        )
      : undefined;
  if (deployment !== undefined && typeof deployment !== "boolean") {
    throw new ScenarioError(
      "expression_error",
      `${location}.environment.deployment`,
      "Deployment must resolve to boolean.",
    );
  }
  const concurrency = resolvedConcurrency(
    job.concurrency,
    server,
    status,
    location,
  );
  return {
    ...(job.container === undefined ? {} : {
      container: resolvedContainerSettings(
        job.container,
        context,
        status,
        location,
        "container",
      ) as JobSettings["container"],
    }),
    ...(job.services === undefined ? {} : {
      services: resolvedContainerSettings(
        job.services,
        context,
        status,
        location,
        "services",
      ) as JobSettings["services"],
    }),
    ...(selection === undefined ? {} : {
      runsOn: selection.type === "group"
        ? {
          group: scalar(selection.group, "runs-on.group"),
          ...(selection.labels === undefined
            ? {}
            : { labels: labels(selection.labels, "runs-on.labels") }),
        }
        : selection.labels.length === 1
        ? scalar(selection.labels[0], "runs-on")
        : labels(selection.labels, "runs-on"),
    }),
    ...(environment === undefined ? {} : {
      environment: {
        name: scalar(
          typeof environment === "string" ? environment : environment.name,
          "environment.name",
        ),
        ...(typeof environment === "string" ||
            deployment === undefined
          ? {}
          : { deployment: deployment as boolean }),
      },
    }),
    ...(job.strategy === undefined ? {} : {
      strategy: {
        ...(job.strategy.failFast === undefined ? {} : {
          failFast: (context.strategy as Record<string, unknown>)[
            "fail-fast"
          ] as boolean,
        }),
        ...(job.strategy.maxParallel === undefined ? {} : {
          maxParallel: (context.strategy as Record<string, unknown>)[
            "max-parallel"
          ] as number,
        }),
      },
    }),
    ...(job.continueOnError === undefined ? {} : {
      continueOnError: booleanSetting(
        job.continueOnError,
        server,
        status,
        location,
        "continue-on-error",
      ),
    }),
    ...(job.timeoutMinutes === undefined ? {} : {
      timeoutMinutes: integerSetting(
        job.timeoutMinutes,
        server,
        status,
        location,
        "timeout-minutes",
      ),
    }),
    ...(concurrency === undefined ? {} : { concurrency }),
  };
}
async function runInstance(
  job: Job,
  authorJob: AuthoringJob,
  matrix: Record<string, unknown>,
  base: Context,
  rules: InstanceRules,
  workflowPath: string,
  defaultResult?: Result,
  workflowDefaults: import("../github_actions/mod.ts").RunDefaults | undefined =
    undefined,
  observation: ScenarioObservationState = { nextId: 0 },
  executionContexts: Map<JobInstanceResult, Context> = new Map(),
  cacheSettings: CachePolicy["settings"] = undefined,
  workflowEnv: Readonly<Record<string, unknown>> | undefined = undefined,
  githubFixture: Readonly<Record<string, unknown>> = {},
  tokenPermissions?: TokenPermissions,
): Promise<JobInstanceResult> {
  const location = `${workflowPath}.${job.id}[${JSON.stringify(matrix)}]`;
  validateRules(rules, authorJob, location);
  const strategy = base.strategy as ResolvedStrategy;
  const steps: Record<string, StepResult> = {};
  const context: Context = {
    ...base,
    github: {
      ...githubFixture,
      job: job.id,
      ...(githubFixture.token !== undefined
        ? { token: githubFixture.token }
        : (base.secrets as Context | undefined)?.GITHUB_TOKEN !== undefined
        ? { token: (base.secrets as Context).GITHUB_TOKEN }
        : {}),
    },
    matrix,
    steps: {},
    runner: { ...rules.runner },
  };
  context.env = {
    ...evaluateMap(
      workflowEnv,
      context,
      { success: true, failure: false, cancelled: false },
      workflowPath,
      "env",
    ),
    ...evaluateMap(
      job.env,
      context,
      { success: true, failure: false, cancelled: false },
      location,
      "env",
    ),
  };

  const initialStatus: Status = {
    success: true,
    failure: false,
    cancelled: false,
  };
  const tolerateFailure = booleanSetting(
    job.continueOnError,
    serverContext(context),
    initialStatus,
    location,
    "continue-on-error",
  );
  validateContainerRuntime(job, rules.containerRuntime, location);
  const runtimeContext = containerContext(
    job,
    rules.containerRuntime,
    (v, field) =>
      stringValue(
        evaluateAt(v, context, initialStatus, location, field),
      ),
  );
  const updateJobStatus = (status: string) => {
    const jobContext = { ...rules.jobRuntime, status };
    Object.defineProperties(
      jobContext,
      Object.getOwnPropertyDescriptors(runtimeContext),
    );
    context.job = jobContext;
  };
  updateJobStatus("success");
  if (
    rules.containerInitialization !== undefined &&
    (!["success", "failure"].includes(rules.containerInitialization) ||
      job.container === undefined && !Object.keys(job.services ?? {}).length)
  ) {
    throw new ScenarioError(
      "fixture_invalid",
      `${location}.containerInitialization`,
      "Initialization fixture requires container/services declarations and success/failure.",
    );
  }
  let settings = rules.expectedSettings === undefined
    ? undefined
    : resolvedSettings(
      job,
      context,
      initialStatus,
      location,
    );
  if (settings !== undefined) settings = { ...settings, ...cacheSettings };
  if (
    rules.environmentProtection !== undefined &&
    (!job.environment ||
      !["passed", "rejected"].includes(rules.environmentProtection))
  ) {
    throw new ScenarioError(
      "fixture_invalid",
      `${location}.environment`,
      "Protection fixtures require an environment and a passed/rejected decision.",
    );
  }
  if (rules.environmentProtection === "rejected") {
    for (const [id, rule] of rules.steps) {
      const authored = flattenSteps(authorJob.steps).find((step) =>
        step.id === id
      );
      checkStep(
        {
          id,
          outcome: "skipped",
          conclusion: "skipped",
          inputs: {},
          outputs: {},
          env: {},
        },
        rule,
        `${location}.${id}`,
        undefined,
        authored,
      );
    }
    if (rules.expectedStepOrder !== undefined) {
      expectValue([], rules.expectedStepOrder, `${location}.stepOrder`);
    }
    if (rules.expectedResult !== undefined) {
      expectValue(
        tolerateFailure ? "success" : "failure",
        rules.expectedResult,
        `${location}.result`,
      );
    }
    if (rules.expectedSettings) {
      expectSubset(settings!, rules.expectedSettings, `${location}.settings`);
    }
    return {
      matrix,
      strategy,
      tokenPermissions,
      result: tolerateFailure ? "success" : "failure",
      ...(job.continueOnError === undefined
        ? {}
        : { outcome: "failure" as const }),
      steps: {},
      ...(settings === undefined ? {} : { settings }),
      environmentProtection: "rejected",
      outputs: {},
    };
  }
  const initializationFailed = rules.containerInitialization === "failure";
  if (job.container !== undefined || Object.keys(job.services ?? {}).length) {
    const operationId = ++observation.nextId;
    const emit = (status: "start" | "success" | "failure") => {
      try {
        observation.observer?.({
          operationId,
          parentId: observation.parentId,
          stage: "container-initialization",
          status,
          ...(status === "failure"
            ? { errorType: "initialization_failed" }
            : {}),
        });
      } catch { /* Host-owned recording is non-interfering. */ }
    };
    emit("start");
    emit(initializationFailed ? "failure" : "success");
  }
  const defaults = { ...workflowDefaults, ...job.defaults };
  const source = new Map(
    flattenSteps(authorJob.steps).filter((step) => step.id !== undefined).map((
      step,
    ) => [step.id!, step]),
  );
  const pending = new Map<
    string,
    {
      result: StepResult;
      changes: Readonly<Record<string, string>>;
      operationId: number;
    }
  >();
  const startedOrder: string[] = [];
  let anonymousOrdinal = 0;
  const observeAsync = (
    stage: "background-start" | "background-join" | "background-cancel",
    links: readonly number[] = [],
  ) => {
    const operationId = ++observation.nextId;
    const emit = (
      status: "start" | "success" | "failure" | "cancelled",
      errorType?: string,
    ) => {
      try {
        observation.observer?.({
          operationId,
          parentId: observation.parentId,
          stage,
          status,
          ...(links.length ? { links } : {}),
          ...(errorType ? { errorType } : {}),
        });
      } catch { /* Host-owned recording is non-interfering. */ }
    };
    emit("start");
    return { operationId, emit };
  };
  const join = (ids: readonly string[]) => {
    const operation = observeAsync(
      "background-join",
      ids.flatMap((id) => {
        const value = pending.get(id);
        return value ? [value.operationId] : [];
      }),
    );
    const changes: Record<string, string> = Object.create(null);
    for (const id of ids) {
      const value = pending.get(id);
      if (!value) continue;
      for (const [key, entry] of Object.entries(value.changes)) {
        if (Object.hasOwn(changes, key) && changes[key] !== entry) {
          operation.emit("failure", "fixture_invalid");
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.environmentChanges`,
            "Conflicting asynchronous environment writes require an explicit order.",
          );
        }
        changes[key] = entry;
      }
    }
    let failed = false;
    let cancelled = false;
    for (const id of ids) {
      const value = pending.get(id);
      if (!value) continue;
      steps[id] = value.result;
      if (!id.startsWith("#")) {
        (context.steps as Record<string, unknown>)[id] = value.result;
      }
      failed ||= value.result.conclusion === "failure";
      cancelled ||= value.result.conclusion === "cancelled";
      pending.delete(id);
    }
    context.env = { ...(context.env as Record<string, unknown>), ...changes };
    operation.emit(failed ? "failure" : cancelled ? "cancelled" : "success");
  };
  const execute = async (
    sequence: readonly Step[],
    inParallel = false,
  ): Promise<void> => {
    for (const step of sequence) {
      if (step.type === "parallel") {
        const before = new Set(pending.keys());
        await execute(step.steps, true);
        join([...pending.keys()].filter((id) => !before.has(id)));
        continue;
      }
      if (step.type === "wait" || step.type === "wait-all") {
        join(step.type === "wait-all" ? [...pending.keys()] : step.targets);
        continue;
      }
      if (step.type === "cancel") {
        const id = step.targets[0];
        const value = pending.get(id);
        const operation = observeAsync(
          "background-cancel",
          value ? [value.operationId] : [],
        );
        if (value) {
          pending.set(id, {
            ...value,
            result: { ...value.result, cancellationRequested: true },
          });
        } else if (steps[id]) {
          steps[id] = { ...steps[id], cancellationRequested: true };
        }
        operation.emit("success");
        continue;
      }
      const id = step.id ?? `#${++anonymousOrdinal}`;
      startedOrder.push(id);
      const stepLocation = `${location}.${id}`;
      const authorStep = step.id === undefined
        ? undefined
        : source.get(step.id);
      const isInternal = !authorStep && step.id !== undefined;
      const rule = rules.steps.get(id);
      const status = stepStatus(steps, initializationFailed);
      updateJobStatus(
        status.failure ? "failure" : status.cancelled ? "cancelled" : "success",
      );
      const stepContext: Context = {
        ...context,
        [stepHashes]: rule?.hashFiles ?? new Map(),
        github: {
          ...(context.github as Record<string, unknown>),
          ...rule?.github,
        },
      };

      if (!condition(step.if, stepContext, status, stepLocation)) {
        const skipped: StepResult = {
          id,
          outcome: "skipped",
          conclusion: "skipped",
          outputs: {},
          inputs: {},
          env: {},
        };
        steps[id] = skipped;
        if (step.id) (context.steps as Record<string, unknown>)[id] = skipped;
        checkStep(skipped, rule, stepLocation, defaultResult, authorStep);
        continue;
      }

      if (!isInternal && !authorStep?.id) {
        throw new ScenarioError(
          "fixture_missing",
          stepLocation,
          "Reached authored step needs an explicit ID and fixture.",
        );
      }
      let changes: Readonly<Record<string, string>> = {};
      let run: import("../github_actions/mod.ts").RunDefaults | undefined;
      let outcome: StepOutcome;
      let outputs: Record<string, string> = {};
      let inputs: Record<string, unknown> = {};
      let env: Record<string, string> = {};
      if (isInternal) {
        outcome = rules.internals.get(internalKind(step) ?? "prepare") ??
          "success";
      } else {
        if (rule?.fixture === undefined) {
          throw new ScenarioError(
            "fixture_missing",
            stepLocation,
            "Reached authored step has no fixture.",
          );
        }
        const rawEnv = {
          ...(context.env as Record<string, unknown>),
          ...evaluateMap(
            step.env,
            stepContext,
            status,
            stepLocation,
            "env",
          ),
        };
        env = Object.fromEntries(
          Object.entries(rawEnv).map((
            [key, value],
          ) => [key, stringValue(value)]),
        );
        run = step.type === "run" && rule?.expectedRunSettings !== undefined
          ? Object.fromEntries(
            Object.entries({
              shell: step.shell ?? defaults.shell,
              workingDirectory: step.workingDirectory ??
                defaults.workingDirectory,
            }).filter(([, value]) => value !== undefined).map((
              [key, value],
            ) => [
              key,
              stringValue(
                evaluateAt(
                  value!,
                  step[key as "shell" | "workingDirectory"] !== undefined
                    ? { ...stepContext, env }
                    : stepContext,
                  status,
                  stepLocation,
                  step[key as "shell" | "workingDirectory"] !== undefined
                    ? (key === "workingDirectory" ? "working-directory" : key)
                    : `defaults.run.${
                      key === "workingDirectory" ? "working-directory" : key
                    }`,
                ),
              ),
            ]),
          )
          : undefined;
        if (authorStep?.type === "task") {
          for (const [name, input] of Object.entries(authorStep.inputs)) {
            try {
              inputs[name] = parseWireValue(
                input.contract,
                env[input.from] ?? "",
              );
            } catch (error) {
              throw new ScenarioError(
                "fixture_invalid",
                `${stepLocation}.inputs.${name}`,
                "Task input violates its contract.",
                { cause: error },
              );
            }
          }
        } else if (step.type === "uses") {
          inputs = evaluateMap(
            step.with,
            stepContext,
            status,
            stepLocation,
            "with",
          );
        }
        let provided: Fixture<Record<string, unknown>>;
        try {
          provided = typeof rule.fixture === "function"
            ? await rule.fixture({
              inputs: inputs as never,
              env,
              matrix: matrix as never,
              strategy,
              tokenPermissions,
              ...(run === undefined ? {} : { run }),
            })
            : rule.fixture;
        } catch (error) {
          throw new ScenarioError(
            "fixture_invalid",
            stepLocation,
            "Fixture callback failed.",
            { cause: error },
          );
        }
        if (!provided || typeof provided !== "object") {
          throw new ScenarioError(
            "fixture_invalid",
            stepLocation,
            "Fixture must return a result object.",
          );
        }
        outcome = provided.outcome ?? "success";
        if (
          !(["success", "failure", "cancelled"] as string[]).includes(outcome)
        ) {
          throw new ScenarioError(
            "fixture_invalid",
            stepLocation,
            "Fixture outcome is invalid.",
          );
        }
        outputs = fixtureOutputs(provided, authorStep, stepLocation, outcome);
        if (provided.environmentChanges !== undefined) {
          if (
            !provided.environmentChanges ||
            typeof provided.environmentChanges !== "object" ||
            Array.isArray(provided.environmentChanges) ||
            Object.entries(provided.environmentChanges).some(([key, value]) =>
              !key || typeof value !== "string"
            )
          ) {
            throw new ScenarioError(
              "fixture_invalid",
              `${stepLocation}.environmentChanges`,
              "Environment changes must be a string map.",
            );
          }
          changes = provided.environmentChanges;
        }
      }
      const conclusion = outcome === "failure" &&
          booleanSetting(
            step.continueOnError,
            { ...stepContext, env },
            status,
            stepLocation,
            "continue-on-error",
          )
        ? "success"
        : outcome;
      const result: StepResult = {
        id,
        outcome,
        conclusion,
        outputs,
        inputs,
        env,
        ...(run === undefined ? {} : { run }),
      };
      if (step.background || inParallel) {
        const operation = observeAsync("background-start");
        pending.set(id, {
          result,
          changes,
          operationId: operation.operationId,
        });
        operation.emit("success");
      } else {
        steps[id] = result;
        if (step.id) (context.steps as Record<string, unknown>)[id] = result;
        context.env = {
          ...(context.env as Record<string, unknown>),
          ...changes,
        };
      }
      checkStep(result, rule, stepLocation, defaultResult, authorStep);
    }
  };
  await execute(job.steps);
  if (pending.size) join([...pending.keys()]);
  if (rules.expectedStepOrder !== undefined) {
    const authoredOrder = startedOrder.filter((id) =>
      flattenSteps(authorJob.steps).some((step) => step.id === id)
    );
    expectValue(
      authoredOrder,
      rules.expectedStepOrder,
      `${location}.stepOrder`,
    );
  }
  const status = stepStatus(steps, initializationFailed);
  const outcome: Result = status.failure
    ? "failure"
    : status.cancelled
    ? "cancelled"
    : "success";
  const result = outcome === "failure" && tolerateFailure ? "success" : outcome;
  if (rules.expectedResult !== undefined) {
    expectValue(result, rules.expectedResult, `${location}.result`);
  }
  updateJobStatus(outcome);
  if (
    settings !== undefined && job.snapshot !== undefined &&
    outcome === "success"
  ) {
    const snapshot = typeof job.snapshot === "string"
      ? { imageName: job.snapshot }
      : job.snapshot;
    const allowed = snapshot.if === undefined
      ? true
      : typeof snapshot.if === "boolean"
      ? snapshot.if
      : truthy(
        evaluateAt(
          snapshot.if,
          context,
          status,
          location,
          "snapshot.if",
        ),
      );
    if (allowed) {
      settings = {
        ...settings,
        snapshot: {
          imageName: snapshot.imageName,
          ...(snapshot.version === undefined
            ? {}
            : { version: snapshot.version }),
        },
      };
    }
  }
  if (
    settings !== undefined && typeof job.environment === "object" &&
    job.environment.url !== undefined
  ) {
    settings = {
      ...settings,
      environment: {
        ...settings.environment!,
        url: stringValue(
          evaluateAt(
            job.environment.url,
            context,
            status,
            location,
            "environment.url",
          ),
        ),
      },
    };
  }
  if (rules.expectedSettings) {
    expectSubset(settings!, rules.expectedSettings, `${location}.settings`);
  }
  const instance: JobInstanceResult = {
    matrix,
    strategy,
    tokenPermissions,
    result,
    ...(rules.containerInitialization === undefined
      ? {}
      : { containerInitialization: rules.containerInitialization }),
    ...(job.continueOnError === undefined ? {} : { outcome }),
    steps,
    ...(settings === undefined ? {} : { settings }),
    ...(rules.environmentProtection === undefined
      ? {}
      : { environmentProtection: rules.environmentProtection }),
  };
  executionContexts.set(instance, context);
  return instance;
}

function fixtureOutputs(
  fixture: Fixture<Record<string, unknown>>,
  authorStep: AuthoringJob["steps"][number] | undefined,
  location: string,
  outcome: StepOutcome,
): Record<string, string> {
  const supplied = fixture.outputs ?? {};
  const result: Record<string, string> = {};
  if (authorStep?.type === "task") {
    for (const name of Object.keys(supplied)) {
      if (!Object.hasOwn(authorStep.outputs, name)) {
        throw new ScenarioError(
          "fixture_invalid",
          `${location}.outputs.${name}`,
          "Task output is undeclared.",
        );
      }
    }
    for (const [name, definition] of Object.entries(authorStep.outputs)) {
      const value = supplied[name];
      if (value === undefined) {
        if (definition.required && outcome === "success") {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.outputs.${name}`,
            "Required task output is missing.",
          );
        }
        result[name] = "";
      } else {
        try {
          result[name] = serializeValue(definition.contract, value);
        } catch (error) {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.outputs.${name}`,
            "Task output violates its contract.",
            { cause: error },
          );
        }
      }
    }
  } else {
    for (const [name, value] of Object.entries(supplied)) {
      if (typeof value !== "string") {
        throw new ScenarioError(
          "fixture_invalid",
          `${location}.outputs.${name}`,
          "Action or run output must be a string.",
        );
      }
      result[name] = value;
    }
  }
  return result;
}

function checkStep(
  result: StepResult,
  rules: StepRules | undefined,
  location: string,
  defaultResult?: Result,
  authorStep?: AuthoringJob["steps"][number],
): void {
  if (rules?.expectedRunSettings !== undefined) {
    if (!result.run) {
      throw new ScenarioError(
        "expectation_failed",
        `${location}.run`,
        "Run settings require a reached run step.",
      );
    }
    expectSubset(result.run, rules.expectedRunSettings, `${location}.run`);
  }
  if (rules?.expectedRun !== undefined) {
    expectValue(
      result.outcome !== "skipped",
      rules.expectedRun,
      `${location}.reached`,
    );
  }
  if (rules?.expectedOutcome !== undefined) {
    expectValue(result.outcome, rules.expectedOutcome, `${location}.outcome`);
  }
  if (rules?.expectedConclusion !== undefined) {
    expectValue(
      result.conclusion,
      rules.expectedConclusion,
      `${location}.conclusion`,
    );
  }
  if (rules?.expectedInputs !== undefined) {
    if (result.outcome === "skipped") {
      throw new ScenarioError(
        "expectation_failed",
        `${location}.inputs`,
        "Step was skipped before receiving inputs.",
      );
    }
    expectSubset(result.inputs, rules.expectedInputs, `${location}.inputs`);
  }
  if (rules?.expectedOutputs !== undefined) {
    const native = authorStep?.type === "task"
      ? Object.fromEntries(
        Object.entries(result.outputs).map(([name, wire]) => [
          name,
          parseWireValue(authorStep.outputs[name].contract, wire),
        ]),
      )
      : result.outputs;
    expectSubset(native, rules.expectedOutputs, `${location}.outputs`);
  }
  if (
    defaultResult !== undefined && result.outcome !== "skipped" &&
    rules?.expectedOutcome === undefined
  ) {
    expectValue(result.conclusion, defaultResult, `${location}.defaultResult`);
  }
}

function triggered(config: ProjectConfig, program: Program): boolean {
  const workflow =
    config.workflows.find((p) => p.path === program.workflowPath) ??
      config.workflows[0];
  return matchesTrigger(workflow.on, program, workflow.path);
}

async function interpretScenario(
  config: ProjectConfig,
  program: Program,
  called: boolean,
  observation: ScenarioObservationState,
  callerCacheMode?: CacheMode,
  callerTokenPolicy?: TokenPolicy,
): Promise<ScenarioResult> {
  const author =
    config.workflows.find((p) => p.path === program.workflowPath) ??
      config.workflows[0];
  if (!called && !triggered(config, program)) {
    if (program.expectedResult !== undefined) {
      expectValue("skipped", program.expectedResult, `${author.path}.result`);
    }
    return { result: "skipped", jobs: {} };
  }
  if (callerTokenPolicy && program.tokenPermissions !== undefined) {
    throw new ScenarioError(
      "fixture_invalid",
      `${author.path}.permissions`,
      "Nested local scenarios cannot supply initial tokenPermissions; authority comes from the caller.",
    );
  }
  const assumptions = program.tokenPermissions;
  if (assumptions && typeof assumptions.restrictWrites !== "boolean") {
    throw new ScenarioError(
      "fixture_invalid",
      `${author.path}.permissions`,
      "Explicit restrictWrites boolean is required.",
    );
  }
  const permissionDefaults = callerTokenPolicy?.permissions ??
    (assumptions
      ? expandPermissions(
        assumptions.defaults,
        `${author.path}.permissions.defaults`,
      )
      : undefined);
  const githubFixture = program.external.github as Context | undefined ?? {};
  const external: Context = serverContext({
    ...program.external,
    secrets: program.external.secrets ?? {},
  });
  const lowered = await lowerProject(config, "./tsugiori.ts");
  const workflow =
    lowered.workflows.find((p) => p.path === author.path)!.workflow;
  const concurrency = program.expectedConcurrency === undefined
    ? undefined
    : resolvedConcurrency(
      workflow.concurrency,
      external,
      { success: true, failure: false, cancelled: false },
      author.path,
    );
  if (program.expectedConcurrency) {
    expectValue(
      concurrency,
      program.expectedConcurrency,
      `${author.path}.concurrency`,
    );
  }
  const authoredJobs = new Map(author.jobs.map((job) => [job.id, job]));
  for (const name of program.jobs.keys()) {
    if (!authoredJobs.has(name)) {
      throw new ScenarioError(
        "fixture_invalid",
        `${author.path}.${name}`,
        "Unknown job ID.",
      );
    }
  }
  for (const [left, right] of program.expectedBefore) {
    const first = workflow.jobs.findIndex((job) => job.id === left);
    const second = workflow.jobs.findIndex((job) => job.id === right);
    if (first < 0 || second < 0) {
      throw new ScenarioError(
        "fixture_invalid",
        author.path,
        "Expected job order names an unknown job.",
      );
    }
    if (first >= second || !workflow.jobs[second].needs.includes(left)) {
      throw new ScenarioError(
        "expectation_failed",
        `${author.path}.${left}->${right}`,
        "Job dependency order does not match the expectation.",
      );
    }
  }
  const executionContexts = new Map<JobInstanceResult, Context>();
  const results: Record<string, JobResult> = {};
  const ancestorStatus = new Map<string, Status>();
  for (const job of workflow.jobs) {
    const location = `${author.path}.${job.id}`;
    const rules = program.jobs.get(job.id) ?? {
      steps: new Map(),
      internals: new Map(),
    } as JobRules;
    const needs: Record<string, unknown> = {};
    for (const dependency of job.needs) {
      const result = results[dependency];
      if (!result) {
        throw new ScenarioError(
          "fixture_invalid",
          location,
          `Dependency ${dependency} was not evaluated.`,
        );
      }
      needs[dependency] = { result: result.result, outputs: result.outputs };
    }
    const context: Context = {
      ...external,
      env: {},
      needs,
      job: { status: "success" },
    };
    const needResults = job.needs.map((dependency) =>
      results[dependency].result
    );
    const status: Status = {
      success: needResults.every((result) => result === "success"),
      failure: needResults.includes("failure") ||
        job.needs.some((id) => ancestorStatus.get(id)?.failure),
      cancelled: needResults.includes("cancelled") ||
        job.needs.some((id) => ancestorStatus.get(id)?.cancelled),
    };
    ancestorStatus.set(job.id, status);

    if (!condition(job.if, context, status, location)) {
      results[job.id] = { result: "skipped", outputs: {}, instances: [] };
      if (rules.expectedResult !== undefined) {
        expectValue("skipped", rules.expectedResult, `${location}.result`);
      }
      continue;
    }
    const failFast = booleanSetting(
      job.strategy?.failFast,
      context,
      status,
      location,
      "strategy.fail-fast",
      true,
    );
    const maxParallel = job.strategy?.maxParallel === undefined
      ? undefined
      : integerSetting(
        job.strategy.maxParallel,
        context,
        status,
        location,
        "strategy.max-parallel",
      );
    const matrices = expandMatrix(job, context, status, location);
    context.strategy = {
      "fail-fast": failFast,
      "job-total": matrices.length,
      "max-parallel": maxParallel ?? matrices.length,
    };

    if (rules.expectedMatrix !== undefined) {
      expectValue(matrices, rules.expectedMatrix, `${location}.matrix`);
    }
    if (
      rules.completionOrder !== undefined &&
      (rules.completionOrder.length !== matrices.length ||
        new Set(rules.completionOrder).size !== matrices.length ||
        rules.completionOrder.some((index) =>
          !Number.isInteger(index) || index < 0 || index >= matrices.length
        ))
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        `${location}.completionOrder`,
        "Supply every expanded job-index exactly once.",
      );
    }
    const permissions = permissionDefaults === undefined
      ? undefined
      : resolvePermissions(
        job.permissions ?? workflow.permissions,
        permissionDefaults,
        assumptions?.restrictWrites ?? false,
        `${location}.permissions`,
        callerTokenPolicy,
      );
    const instances: JobInstanceResult[] = [];
    for (const [matrixIndex, matrix] of matrices.entries()) {
      context.strategy = Object.freeze({
        ...(context.strategy as object),
        "job-index": matrixIndex,
      });
      const specific = rules.matrixRules?.(matrix) ??
        { steps: new Map(), internals: new Map() };
      const authoredJob = authoredJobs.get(job.id)!;
      for (const [id, rule] of rules.steps) {
        if (rule.inherit === false) {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.${id}`,
            "replaceInherited() requires an eachMatrix instance scope.",
          );
        }
      }
      validateRules(rules, authoredJob, location);
      validateRules(specific, authoredJob, location);
      const merged = mergedRules(rules, specific);
      const cache = cachePolicy(
        job,
        workflow.cacheMode,
        callerCacheMode,
        context,
        merged.expectedSettings !== undefined,
      );
      if (job.uses !== undefined) {
        const location = `${author.path}.${job.id}[${JSON.stringify(matrix)}]`;
        const callContext = { ...context, matrix };

        const settings = merged.expectedSettings === undefined ? undefined : {
          ...resolvedSettings(
            job,
            callContext,
            status,
            location,
          ),
          ...cache.settings,
        };
        if (
          merged.jobRuntime !== undefined || merged.runner !== undefined ||
          merged.containerRuntime !== undefined ||
          merged.containerInitialization !== undefined
        ) {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.${
              merged.jobRuntime !== undefined
                ? "jobRuntime"
                : merged.runner !== undefined
                ? "runner"
                : "containerInitialization"
            }`,
            "Reusable callers have no execution runtime; configure job/runner/container fixtures on the callee instance.",
          );
        }
        if (merged.environmentProtection !== undefined) {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.environment`,
            "Reusable caller jobs cannot declare environments; apply protection fixtures to the callee's environment job.",
          );
        }
        if (merged.expectedSettings) {
          expectSubset(
            settings!,
            merged.expectedSettings,
            `${location}.settings`,
          );
        }
        const inputs = evaluateMap(
          job.with,
          callContext,
          status,
          location,
          "with",
        );
        const standardToken =
          (context.secrets as Record<string, unknown> | undefined)
            ?.GITHUB_TOKEN;
        const secrets = {
          ...(standardToken === undefined
            ? {}
            : { GITHUB_TOKEN: standardToken }),
          ...(job.callSecrets === "inherit"
            ? { ...(context.secrets as Record<string, unknown> ?? {}) }
            : evaluateMap(
              job.callSecrets,
              callContext,
              status,
              location,
              "secrets",
            )),
        };
        const callee = authoredJob.callee;
        let child: ScenarioResult;
        if (callee) {
          if (
            !merged.call || merged.call.workflowPath !== callee.path ||
            merged.callFixture
          ) {
            throw new ScenarioError(
              "fixture_missing",
              location,
              "Local workflow call requires its callee scenario, not a fixture.",
            );
          }
          if (Object.keys(merged.call.external).length) {
            throw new ScenarioError(
              "fixture_invalid",
              location,
              "Callee contexts are provided by the caller; use call expectations instead of overriding contexts.",
            );
          }
          for (
            const [name, d] of Object.entries(
              callee.on.workflow_call?.inputs ?? {},
            )
          ) {
            if (!Object.hasOwn(inputs, name)) {
              if (d.required) {
                throw new ScenarioError(
                  "fixture_missing",
                  location,
                  `Required call input ${name} is missing.`,
                );
              }
              inputs[name] =
                typeof d.default === "string" && d.default.startsWith("${{")
                  ? evaluateAt(
                    d.default,
                    { github: external.github, inputs, vars: context.vars },
                    status,
                    `${callee.path}.on.workflow_call.inputs.${name}`,
                    "default",
                  )
                  : d.default ??
                    (d.type === "boolean"
                      ? false
                      : d.type === "number"
                      ? 0
                      : "");
            }
            const actualType = typeof inputs[name];
            if (actualType !== d.type) {
              throw new ScenarioError(
                "fixture_invalid",
                location,
                `Call input ${name} violates declared type.`,
              );
            }
          }
          for (
            const [name, d] of Object.entries(
              callee.on.workflow_call?.secrets ?? {},
            )
          ) {
            if (d.required && !Object.hasOwn(secrets, name)) {
              throw new ScenarioError(
                "fixture_missing",
                location,
                `Required secret ${name} is missing.`,
              );
            }
          }
          // Caller github context remains unchanged. Caller env and custom inputs/secrets do not leak.
          child = await runScenario(
            config,
            {
              ...merged.call,
              external: {
                ...context,
                github: githubFixture,
                env: undefined,
                needs: undefined,
                job: undefined,
                matrix: undefined,
                runner: undefined,
                inputs,
                secrets,
              },
              workflowPath: callee.path,
            },
            true,
            observation,
            cache.explicit,
            permissions === undefined ? undefined : {
              permissions,
              path: [...callerTokenPolicy?.path ?? [], location],
            },
          );
        } else {
          if (!merged.callFixture || merged.call) {
            throw new ScenarioError(
              "fixture_missing",
              location,
              "External workflow call requires a fixture.",
            );
          }
          const fixture = typeof merged.callFixture === "function"
            ? await merged.callFixture({
              inputs,
              env: {},
              matrix,
              strategy: context.strategy as ResolvedStrategy,
              tokenPermissions: permissions,
            })
            : merged.callFixture;
          if (
            !fixture ||
            !["success", "failure", "cancelled"].includes(
              fixture.outcome ?? "success",
            ) || Object.values(fixture.outputs ?? {}).some((v) =>
              typeof v !== "string"
            )
          ) {
            throw new ScenarioError(
              "fixture_invalid",
              location,
              "External workflow fixture has invalid result or outputs.",
            );
          }
          child = {
            result: fixture.outcome ?? "success",
            jobs: {},
            outputs: fixture.outputs as Record<string, string> ?? {},
          };
        }
        if (merged.expectedCallInputs) {
          expectSubset(inputs, merged.expectedCallInputs, `${location}.with`);
        }
        if (merged.expectedCallSecrets) {
          expectSubset(
            secrets,
            merged.expectedCallSecrets,
            `${location}.secrets`,
          );
        }
        if (merged.expectedResult !== undefined) {
          expectValue(
            child.result,
            merged.expectedResult,
            `${location}.result`,
          );
        }
        instances.push({
          matrix,
          strategy: context.strategy as ResolvedStrategy,
          tokenPermissions: permissions,
          result: child.result,
          steps: {},
          call: child,
          ...(settings === undefined ? {} : { settings }),
          outputs: child.outputs ?? {},
        });
        continue;
      }
      instances.push(
        await runInstance(
          job,
          authoredJob,
          matrix,
          context,
          merged,
          author.path,
          program.defaultResult,
          workflow.defaults,
          observation,
          executionContexts,
          cache.settings,
          author.env,
          githubFixture,
          permissions,
        ),
      );
    }
    const result = aggregate(instances);
    if (rules.expectedResult !== undefined) {
      expectValue(result, rules.expectedResult, `${location}.result`);
    }
    const outputs: Record<string, string> = {};
    for (
      const matrixIndex of rules.completionOrder ??
        instances.map((_, index) => index)
    ) {
      const instance = instances[matrixIndex];
      if (instance.environmentProtection === "rejected") continue;
      if (
        job.uses && job.strategy?.matrix !== undefined &&
        instance.result !== "success"
      ) continue;
      const jobContext = {
        ...context,
        ...executionContexts.get(instance),
        matrix: instance.matrix,
        strategy: { ...(context.strategy as object), "job-index": matrixIndex },
        steps: instance.steps,
        job: executionContexts.get(instance)?.job ??
          { status: instance.outcome ?? instance.result },
      };
      for (
        const [name, expression] of Object.entries(
          job.uses ? instance.outputs ?? {} : job.outputs ?? {},
        )
      ) {
        const value = job.uses ? expression : stringValue(
          evaluateAt(
            expression,
            jobContext,
            {
              success: (instance.outcome ?? instance.result) === "success",
              failure: (instance.outcome ?? instance.result) === "failure",
              cancelled: (instance.outcome ?? instance.result) === "cancelled",
            },
            `${location}[${JSON.stringify(instance.matrix)}]`,
            `outputs.${name}`,
          ),
        );
        if (
          rules.completionOrder === undefined && outputs[name] && value &&
          outputs[name] !== value
        ) {
          throw new ScenarioError(
            "fixture_missing",
            `${location}.outputs.${name}`,
            "Matrix instances produce different values for the same job output; GitHub's merge order is unspecified.",
          );
        }
        if (!Object.hasOwn(outputs, name) || value !== "") {
          outputs[name] = value;
        }
      }
    }
    results[job.id] = { result, outputs, instances };
    if (rules.expectedOutputs !== undefined) {
      expectSubset(outputs, rules.expectedOutputs, `${location}.outputs`);
    }
  }
  const values = Object.values(results).map((job) => job.result);
  const result: Result = values.includes("failure")
    ? "failure"
    : values.includes("cancelled")
    ? "cancelled"
    : "success";
  if (program.expectedResult !== undefined) {
    expectValue(result, program.expectedResult, `${author.path}.result`);
  }
  const outputs: Record<string, string> = {};
  for (
    const [name, d] of Object.entries(author.on.workflow_call?.outputs ?? {})
  ) {
    outputs[name] = stringValue(
      evaluateAt(
        d.value,
        { ...external, jobs: results },
        {
          success: result === "success",
          failure: result === "failure",
          cancelled: result === "cancelled",
        },
        author.path,
        `workflow.paths.${name}`,
      ),
    );
  }
  return {
    result,
    jobs: results,
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(author.on.workflow_call?.outputs ? { outputs } : {}),
  };
}

export async function runScenario(
  config: ProjectConfig,
  program: Program,
  called = false,
  observation: ScenarioObservationState = { nextId: 0 },
  callerCacheMode?: CacheMode,
  callerTokenPolicy?: TokenPolicy,
): Promise<ScenarioResult> {
  const operationId = ++observation.nextId;
  const parentId = observation.parentId;
  const emit = (
    status: "start" | "success" | "failure",
    errorType?: string,
  ) => {
    try {
      observation.observer?.({
        operationId,
        parentId,
        stage: "workflow",
        status,
        ...(errorType ? { errorType } : {}),
      });
    } catch { /* Host diagnostics never alter the interpreted result. */ }
  };
  emit("start");
  observation.parentId = operationId;
  try {
    const result = await interpretScenario(
      config,
      program,
      called,
      observation,
      callerCacheMode,
      callerTokenPolicy,
    );
    emit("success");
    return result;
  } catch (error) {
    emit(
      "failure",
      error instanceof ScenarioError ? error.kind : "schema_invalid",
    );
    throw error;
  } finally {
    observation.parentId = parentId;
  }
}
