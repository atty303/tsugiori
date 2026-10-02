import type {
  AuthoringJob,
  TsugioriConfig,
} from "../../core/src/github_actions/mod.ts";
import { lowerConfig } from "../../compiler/src/authoring.ts";
import type { Job, Step } from "../../compiler/src/github_actions/ast.ts";
import { parseWireValue, serializeValue } from "../../core/src/task/mod.ts";
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
  type Program,
  type Result,
  ScenarioError,
  type ScenarioObservationState,
  type ScenarioResult,
  type StepOutcome,
  type StepResult,
  type StepRules,
} from "./mod.ts";

type Context = Record<string, unknown>;
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ScenarioError(
      "fixture_invalid",
      location,
      "Matrix must evaluate to an object.",
    );
  }
  const axes = Object.entries(value as Record<string, unknown>);
  let rows: Record<string, unknown>[] =
    axes.some(([name]) => name !== "include" && name !== "exclude") ? [{}] : [];
  for (const [name, axis] of axes) {
    if (name === "include" || name === "exclude") continue;
    if (!Array.isArray(axis)) {
      throw new ScenarioError(
        "fixture_invalid",
        `${location}.strategy.matrix.${name}`,
        "Matrix axis must be an array.",
      );
    }
    rows = rows.flatMap((row) =>
      axis.map((item) => ({ ...row, [name]: item }))
    );
  }
  const excluded = (value as Record<string, unknown>).exclude;
  if (Array.isArray(excluded)) {
    rows = rows.filter((row) =>
      !excluded.some((item) =>
        item && typeof item === "object" &&
        Object.entries(item).every(([key, expected]) =>
          same(row[key], expected)
        )
      )
    );
  }
  const included = (value as Record<string, unknown>).include;
  if (Array.isArray(included)) {
    const original = rows.map((row) => ({ ...row }));
    for (const item of included) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ScenarioError(
          "fixture_invalid",
          `${location}.strategy.matrix.include`,
          "Matrix include entry must be an object.",
        );
      }
      const entry = item as Record<string, unknown>;
      let matched = false;
      for (const [index, row] of original.entries()) {
        if (
          Object.entries(entry).every(([key, expected]) =>
            !(key in row) || same(row[key], expected)
          )
        ) {
          Object.assign(rows[index], entry);
          matched = true;
        }
      }
      if (!matched) rows.push({ ...entry });
    }
  }
  return rows;
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
): "artifact" | "cache" | "prepare" | undefined {
  if (step.name === "Resolve task artifact") return "artifact";
  if (step.name === "Cache task artifact") return "cache";
  if (step.name === "Prepare task artifact") return "prepare";
  return undefined;
}

function stepStatus(
  steps: Readonly<Record<string, StepResult>>,
): Status {
  const conclusions = Object.values(steps).map((step) => step.conclusion);
  return {
    success: !conclusions.includes("failure") &&
      !conclusions.includes("cancelled"),
    failure: conclusions.includes("failure"),
    cancelled: conclusions.includes("cancelled"),
  };
}

async function runInstance(
  job: Job,
  authorJob: AuthoringJob,
  matrix: Record<string, unknown>,
  base: Context,
  rules: InstanceRules,
  pipelineId: string,
  defaultResult?: Result,
): Promise<JobInstanceResult> {
  const location = `${pipelineId}.${job.id}[${JSON.stringify(matrix)}]`;
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
    const status = stepStatus(steps);
    context.job = {
      status: status.failure
        ? "failure"
        : status.cancelled
        ? "cancelled"
        : "success",
    };
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
    const conclusion = outcome === "failure" && step.continueOnError
      ? "success"
      : outcome;
    const result: StepResult = {
      id,
      outcome,
      conclusion,
      outputs,
      inputs,
      env,
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
  const status = stepStatus(steps);
  const result: Result = status.failure
    ? "failure"
    : status.cancelled
    ? "cancelled"
    : "success";
  if (rules.expectedResult !== undefined) {
    expectValue(result, rules.expectedResult, `${location}.result`);
  }
  return { matrix, result, steps };
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

function triggered(config: TsugioriConfig, program: Program): boolean {
  const pipeline = config.pipelines.find((p) => p.id === program.pipelineId) ??
    config.pipelines[0];
  const github = program.external.github;
  if (!github || typeof github !== "object") {
    throw new ScenarioError(
      "fixture_missing",
      pipeline.id,
      "github fixture is required.",
    );
  }
  const values = github as Record<string, unknown>;
  const event = values.event_name;
  if (typeof event !== "string") {
    throw new ScenarioError(
      "fixture_missing",
      pipeline.id,
      "github.event_name is required.",
    );
  }
  if (!pipeline.events.includes(event as typeof pipeline.events[number])) {
    return false;
  }
  if (event === "pull_request" || event === "pull_request_target") {
    const types = event === "pull_request"
      ? pipeline.pullRequestTypes
      : pipeline.pullRequestTargetTypes;
    const action =
      (values.event as Record<string, unknown> | undefined)?.action ??
        (types ? undefined : "opened");
    const allowed = types ?? ["opened", "synchronize", "reopened"];
    if (typeof action !== "string") {
      throw new ScenarioError(
        "fixture_missing",
        pipeline.id,
        "github.event.action is required for PR activity filters.",
      );
    }
    if (!allowed.includes(action)) return false;
  }
  if (event === "push" && (pipeline.pushBranches || pipeline.pushTags)) {
    if (typeof values.ref !== "string") {
      throw new ScenarioError(
        "fixture_missing",
        pipeline.id,
        "github.ref is required for push filters.",
      );
    }
    const tag = values.ref.startsWith("refs/tags/");
    const filters = tag ? pipeline.pushTags : pipeline.pushBranches;
    if (!filters) return false;
    const name = values.ref.replace(/^refs\/(heads|tags)\//, "");
    let included = false;
    for (const rule of filters) {
      const negative = rule.startsWith("!");
      if (
        branchPattern(negative ? rule.slice(1) : rule, pipeline.id).test(name)
      ) included = !negative;
    }
    if (!included) return false;
  }
  if (event === "workflow_dispatch") {
    for (
      const [name, input] of Object.entries(
        pipeline.workflowDispatchInputs ?? {},
      )
    ) {
      const supplied = program.external.inputs as
        | Record<string, unknown>
        | undefined;
      if (supplied?.[name] === undefined && input.default !== undefined) {
        program.external.inputs = { ...supplied, [name]: input.default };
      } else if (supplied?.[name] === undefined && input.required) {
        throw new ScenarioError(
          "fixture_missing",
          pipeline.id,
          `Required dispatch input ${name} is missing.`,
        );
      }
    }
  }
  return true;
}

function branchPattern(pattern: string, pipelineId: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index++;
    } else if (char === "*") source += "[^/]*";
    else if (char === "+" || char === "?") {
      if (index === 0) {
        throw new ScenarioError(
          "expression_unsupported",
          `${pipelineId}.on.push.branches`,
          "Branch filter starts with a repetition operator.",
        );
      }
      source += char;
    } else if (char === "[") {
      const end = pattern.indexOf("]", index + 1);
      const contents = pattern.slice(index + 1, end);
      if (end < 0 || !/^[A-Za-z0-9-]+$/.test(contents)) {
        throw new ScenarioError(
          "expression_unsupported",
          `${pipelineId}.on.push.branches`,
          "Branch filter has an unsupported character class.",
        );
      }
      source += `[${contents}]`;
      index = end;
    } else if (char === "\\" && index + 1 < pattern.length) {
      source += pattern[++index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

async function interpretScenario(
  config: TsugioriConfig,
  program: Program,
  called: boolean,
  observation: ScenarioObservationState,
): Promise<ScenarioResult> {
  const author = config.pipelines.find((p) => p.id === program.pipelineId) ??
    config.pipelines[0];
  if (!called && !triggered(config, program)) {
    if (program.expectedResult !== undefined) {
      expectValue("skipped", program.expectedResult, `${author.id}.result`);
    }
    return { result: "skipped", jobs: {} };
  }
  const lowered = await lowerConfig(config, ".github/tsugiori.ts", ".github");
  const workflow = lowered.pipelines.find((p) => p.id === author.id)!.workflow;
  const authoredJobs = new Map(author.jobs.map((job) => [job.id, job]));
  for (const name of program.jobs.keys()) {
    if (!authoredJobs.has(name)) {
      throw new ScenarioError(
        "fixture_invalid",
        `${author.id}.${name}`,
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
        author.id,
        "Expected job order names an unknown job.",
      );
    }
    if (first >= second || !workflow.jobs[second].needs.includes(left)) {
      throw new ScenarioError(
        "expectation_failed",
        `${author.id}.${left}->${right}`,
        "Job dependency order does not match the expectation.",
      );
    }
  }
  const results: Record<string, JobResult> = {};
  for (const job of workflow.jobs) {
    const location = `${author.id}.${job.id}`;
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
        author.id,
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
      failure: needResults.includes("failure"),
      cancelled: needResults.includes("cancelled"),
    };
    const overrides = rules.steps.get("__job__")?.expressions ??
      new Map<string, unknown>();
    if (!condition(job.if, context, status, location, overrides)) {
      results[job.id] = { result: "skipped", outputs: {}, instances: [] };
      if (rules.expectedResult !== undefined) {
        expectValue("skipped", rules.expectedResult, `${location}.result`);
      }
      continue;
    }
    const matrices = expandMatrix(job, context, status, location, overrides);
    if (rules.expectedMatrix !== undefined) {
      expectValue(matrices, rules.expectedMatrix, `${location}.matrix`);
    }
    const instances: JobInstanceResult[] = [];
    for (const matrix of matrices) {
      const specific = rules.matrixRules?.(matrix) ??
        { steps: new Map(), internals: new Map() };
      const merged = mergedRules(rules, specific);
      const authoredJob = authoredJobs.get(job.id)!;
      if (job.uses !== undefined) {
        const location = `${author.id}.${job.id}[${JSON.stringify(matrix)}]`;
        const callContext = { ...context, matrix };
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
            !merged.call || merged.call.pipelineId !== callee.id ||
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
            const [name, d] of Object.entries(callee.workflowCall?.inputs ?? {})
          ) {
            if (!Object.hasOwn(inputs, name)) {
              if (d.required) {
                throw new ScenarioError(
                  "fixture_missing",
                  location,
                  `Required call input ${name} is missing.`,
                );
              }
              inputs[name] = d.default ??
                (d.type === "boolean" ? false : d.type === "number" ? 0 : "");
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
              callee.workflowCall?.secrets ?? {},
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
              pipelineId: callee.id,
            },
            true,
            observation,
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
          author.id,
          program.defaultResult,
        ),
      );
    }
    const result = aggregate(instances);
    if (rules.expectedResult !== undefined) {
      expectValue(result, rules.expectedResult, `${location}.result`);
    }
    const outputs: Record<string, string> = {};
    for (const instance of instances) {
      const jobContext = {
        ...context,
        matrix: instance.matrix,
        steps: instance.steps,
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
              success: instance.result === "success",
              failure: instance.result === "failure",
              cancelled: instance.result === "cancelled",
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
    expectValue(result, program.expectedResult, `${author.id}.result`);
  }
  const outputs: Record<string, string> = {};
  for (const [name, d] of Object.entries(author.workflowCallOutputs ?? {})) {
    outputs[name] = stringValue(
      evaluateAt(
        d.value,
        { ...program.external, jobs: results },
        {
          success: result === "success",
          failure: result === "failure",
          cancelled: result === "cancelled",
        },
        author.id,
        `workflow.outputs.${name}`,
        new Map(),
      ),
    );
  }
  return {
    result,
    jobs: results,
    ...(author.workflowCallOutputs ? { outputs } : {}),
  };
}

export async function runScenario(
  config: TsugioriConfig,
  program: Program,
  called = false,
  observation: ScenarioObservationState = { nextId: 0 },
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
