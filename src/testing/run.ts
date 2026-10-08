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
  truthy,
  UnsupportedExpressionError,
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
  type Result,
  ScenarioError,
  type ScenarioObservationState,
  type ScenarioResult,
  type StepOutcome,
  type StepResult,
  type StepRules,
} from "./mod.ts";

type Context = Record<string, unknown>;
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
  overrides: ReadonlyMap<string, unknown>,
): unknown {
  try {
    return evaluateExpression(value, context, status);
  } catch (error) {
    if (error instanceof ScenarioError) {
      throw new ScenarioError(
        error.kind,
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
    if (error instanceof UnsupportedExpressionError && overrides.has(field)) {
      return overrides.get(field);
    }
    if (error instanceof UnsupportedExpressionError) {
      throw new ScenarioError(
        "expression_unsupported",
        `${location}.${field}`,
        "Expression is unsupported; provide a value at this field.",
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
  overrides: ReadonlyMap<string, unknown>,
): boolean {
  if (!status.success && (!value || !hasStatusFunction(value))) return false;
  if (!value) return true;
  return truthy(evaluateAt(value, context, status, location, "if", overrides));
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
  overrides: ReadonlyMap<string, unknown>,
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
        overrides,
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
  overrides: ReadonlyMap<string, unknown>,
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
      overrides,
    )
    : evaluateMap(
      definition,
      context,
      status,
      location,
      "strategy.matrix",
      overrides,
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
  const ids = new Set(authorJob.steps.map((step) => step.id));
  for (const id of rules.steps.keys()) {
    if (id !== "__job__" && !ids.has(id)) {
      throw new ScenarioError(
        "fixture_invalid",
        `${location}.${id}`,
        "Unknown authored step ID.",
      );
    }
  }
}

function mergedRules(base: JobRules, instance: InstanceRules): InstanceRules {
  return {
    steps: new Map([...base.steps, ...instance.steps]),
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
  overrides: ReadonlyMap<string, unknown>,
  fallback = false,
): boolean {
  if (value === undefined) return fallback;
  const resolved = typeof value === "boolean"
    ? value
    : evaluateAt(value, context, status, location, field, overrides);
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
  overrides: ReadonlyMap<string, unknown>,
  maximum = Infinity,
): number {
  const resolved = typeof value === "number"
    ? value
    : evaluateAt(value, context, status, location, field, overrides);
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
  overrides: ReadonlyMap<string, unknown>,
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
      overrides,
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
        overrides,
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
  overrides: ReadonlyMap<string, unknown>,
): unknown {
  if (typeof value === "string") {
    return stringValue(
      evaluateAt(value, context, status, location, field, overrides),
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
        overrides,
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
          overrides,
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
  overrides: ReadonlyMap<string, unknown>,
): JobSettings {
  const scalar = (value: string, field: string) =>
    stringValue(evaluateAt(value, context, status, location, field, overrides));
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
          context,
          status,
          location,
          "environment.deployment",
          overrides,
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
    context,
    status,
    location,
    overrides,
  );
  return {
    ...(job.container === undefined ? {} : {
      container: resolvedContainerSettings(
        job.container,
        context,
        status,
        location,
        "container",
        overrides,
      ) as JobSettings["container"],
    }),
    ...(job.services === undefined ? {} : {
      services: resolvedContainerSettings(
        job.services,
        context,
        status,
        location,
        "services",
        overrides,
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
        context,
        status,
        location,
        "continue-on-error",
        overrides,
      ),
    }),
    ...(job.timeoutMinutes === undefined ? {} : {
      timeoutMinutes: integerSetting(
        job.timeoutMinutes,
        context,
        status,
        location,
        "timeout-minutes",
        overrides,
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
): Promise<JobInstanceResult> {
  const location = `${workflowPath}.${job.id}[${JSON.stringify(matrix)}]`;
  validateRules(rules, authorJob, location);
  const steps: Record<string, StepResult> = {};
  const context: Context = { ...base, matrix, steps: {} };
  context.env = {
    ...(base.env as Record<string, unknown> ?? {}),
    ...evaluateMap(
      job.env,
      context,
      { success: true, failure: false, cancelled: false },
      location,
      "env",
      rules.steps.get("__job__")?.expressions ?? new Map(),
    ),
  };
  const jobOverrides = rules.steps.get("__job__")?.expressions ?? new Map();
  const initialStatus: Status = {
    success: true,
    failure: false,
    cancelled: false,
  };
  const tolerateFailure = booleanSetting(
    job.continueOnError,
    context,
    initialStatus,
    location,
    "continue-on-error",
    jobOverrides,
  );
  validateContainerRuntime(job, rules.containerRuntime, location);
  const runtimeContext = containerContext(
    job,
    rules.containerRuntime,
    (v, field) =>
      stringValue(
        evaluateAt(v, context, initialStatus, location, field, jobOverrides),
      ),
  );
  const updateJobStatus = (status: string) => {
    const jobContext = { status };
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
      jobOverrides,
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
      if (id === "__job__") continue;
      const authored = authorJob.steps.find((step) => step.id === id);
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
    authorJob.steps.filter((step) => step.id !== undefined).map((
      step,
    ) => [step.id!, step]),
  );
  for (const [index, step] of job.steps.entries()) {
    const id = step.id ?? `#${index + 1}`;
    const stepLocation = `${location}.${id}`;
    const authorStep = step.id === undefined ? undefined : source.get(step.id);
    const isInternal = !authorStep && step.id !== undefined;
    const rule = rules.steps.get(id);
    const status = stepStatus(steps, initializationFailed);
    updateJobStatus(
      status.failure ? "failure" : status.cancelled ? "cancelled" : "success",
    );
    const overrides = rule?.expressions ?? new Map<string, unknown>();
    if (!condition(step.if, context, status, stepLocation, overrides)) {
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
          context,
          status,
          stepLocation,
          "env",
          overrides,
        ),
      };
      env = Object.fromEntries(
        Object.entries(rawEnv).map(([key, value]) => [key, stringValue(value)]),
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
                  ? { ...context, env }
                  : context,
                status,
                stepLocation,
                step[key as "shell" | "workingDirectory"] !== undefined
                  ? (key === "workingDirectory" ? "working-directory" : key)
                  : `defaults.run.${
                    key === "workingDirectory" ? "working-directory" : key
                  }`,
                step[key as "shell" | "workingDirectory"] !== undefined
                  ? overrides
                  : jobOverrides,
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
          context,
          status,
          stepLocation,
          "with",
          overrides,
        );
      }
      let provided: Fixture<Record<string, unknown>>;
      try {
        provided = typeof rule.fixture === "function"
          ? await rule.fixture({
            inputs: inputs as never,
            env,
            matrix: matrix as never,
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
    }
    const conclusion = outcome === "failure" &&
        booleanSetting(
          step.continueOnError,
          { ...context, env },
          status,
          stepLocation,
          "continue-on-error",
          overrides,
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
    steps[id] = result;
    if (step.id) (context.steps as Record<string, unknown>)[id] = result;
    checkStep(result, rule, stepLocation, defaultResult, authorStep);
  }
  if (rules.expectedStepOrder !== undefined) {
    const authoredOrder = Object.keys(steps).filter((id) =>
      authorJob.steps.some((step) => step.id === id)
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
          jobOverrides,
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
            jobOverrides,
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
  const lowered = await lowerProject(config, "./tsugiori.ts");
  const workflow =
    lowered.workflows.find((p) => p.path === author.path)!.workflow;
  const concurrency = program.expectedConcurrency === undefined
    ? undefined
    : resolvedConcurrency(
      workflow.concurrency,
      program.external,
      { success: true, failure: false, cancelled: false },
      author.path,
      program.expressions ?? new Map(),
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
      ...program.external,
      env: evaluateMap(
        author.env,
        program.external,
        { success: true, failure: false, cancelled: false },
        author.path,
        "env",
        new Map(),
      ),
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
    const overrides = rules.steps.get("__job__")?.expressions ??
      new Map<string, unknown>();
    if (!condition(job.if, context, status, location, overrides)) {
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
      overrides,
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
        overrides,
      );
    const matrices = expandMatrix(job, context, status, location, overrides);
    context.strategy = {
      ...(context.strategy as object ?? {}),
      "fail-fast": failFast,
      "job-total": matrices.length,
      ...(maxParallel === undefined ? {} : { "max-parallel": maxParallel }),
    };

    if (rules.expectedMatrix !== undefined) {
      expectValue(matrices, rules.expectedMatrix, `${location}.matrix`);
    }
    const instances: JobInstanceResult[] = [];
    for (const [matrixIndex, matrix] of matrices.entries()) {
      context.strategy = {
        ...(context.strategy as object),
        "job-index": matrixIndex,
      };
      const specific = rules.matrixRules?.(matrix) ??
        { steps: new Map(), internals: new Map() };
      const merged = mergedRules(rules, specific);
      const authoredJob = authoredJobs.get(job.id)!;
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
        const callOverrides = merged.steps.get("__job__")?.expressions ??
          new Map<string, unknown>();
        const settings = merged.expectedSettings === undefined ? undefined : {
          ...resolvedSettings(
            job,
            callContext,
            status,
            location,
            callOverrides,
          ),
          ...cache.settings,
        };
        if (
          merged.containerRuntime !== undefined ||
          merged.containerInitialization !== undefined
        ) {
          throw new ScenarioError(
            "fixture_invalid",
            `${location}.containerInitialization`,
            "Reusable callers cannot declare containers; configure the callee instance.",
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
          overrides,
        );
        const secrets = job.callSecrets === "inherit"
          ? { ...(context.secrets as Record<string, unknown> ?? {}) }
          : evaluateMap(
            job.callSecrets,
            callContext,
            status,
            location,
            "secrets",
            overrides,
          );
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
                    { github: context.github, inputs, vars: context.vars },
                    status,
                    `${callee.path}.on.workflow_call.inputs.${name}`,
                    "default",
                    new Map(),
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
                env: undefined,
                needs: undefined,
                job: undefined,
                matrix: undefined,
                inputs,
                secrets,
              },
              workflowPath: callee.path,
            },
            true,
            observation,
            cache.explicit,
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
            ? await merged.callFixture({ inputs, env: {}, matrix })
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
        ),
      );
    }
    const result = aggregate(instances);
    if (rules.expectedResult !== undefined) {
      expectValue(result, rules.expectedResult, `${location}.result`);
    }
    const outputs: Record<string, string> = {};
    for (const [matrixIndex, instance] of instances.entries()) {
      if (instance.environmentProtection === "rejected") continue;
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
            overrides,
          ),
        );
        if (outputs[name] && value && outputs[name] !== value) {
          throw new ScenarioError(
            "expression_unsupported",
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
        { ...program.external, jobs: results },
        {
          success: result === "success",
          failure: result === "failure",
          cancelled: result === "cancelled",
        },
        author.path,
        `workflow.paths.${name}`,
        new Map(),
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
