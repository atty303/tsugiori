import type {
  JobEnvironment,
  RunDefaults,
  RunnerRequest,
  WorkflowInputValues,
} from "../github_actions/mod.ts";
import type {
  EventPayload,
  EventsOf,
  RuntimeEvents,
  WorkflowTriggers,
} from "../github_actions/events.ts";
import type {
  Expression,
  GitHubContext,
} from "../github_actions/expression.ts";
/**
 * Interpret workflow logic with fixtures using {@link scenario}.
 *
 * Use `scenario()` inside `Deno.test` to check the lowered GitHub Actions
 * workflow without running authored steps or task bodies. Give referenced
 * external values with `github()`, `inputs()`, `vars()`, or `secrets()`. A reached
 * authored step needs an explicit ID and a fixture. Task fixtures return native
 * output values; Tsugiori validates and serializes them before passing them to
 * later steps and jobs. Action and run-step outputs are strings.
 *
 * Supply fixtures for every reached authored step and all required task outputs. The
 * workflow type supplies job and step IDs, task input and output values, and
 * matrix values to the editor and type checker. `fixture()` supplies values;
 * `expectRun()`, `expectSkip()`, `expectInputs()`, `expectOutputs()`, and
 * `expectResult()` check independent expectations. Expectations are optional.
 * `expectBefore()` checks a declared `needs` edge without asserting an order
 * between independent jobs. `expectAllReached()` provides an optional common
 * step conclusion expectation.
 *
 * Typed expressions are evaluated by the interpreter. For an unsupported raw
 * expression or `hashFiles()`, give the value at its exact evaluation site, such
 * as `job.step("build").expression("if", true)` or
 * `job.expression("strategy.matrix", { stage: ["dev"] })`. An omitted value is
 * an error. Generated task preparation steps succeed by default and can be
 * overridden with `job.internal("prepare", "failure")`. Failures identify the
 * workflow, job, matrix, step, and field, and distinguish missing or invalid
 * fixtures, expression errors, and expectation mismatches.
 *
 * This test covers trigger filters, conditions, matrix expansion, `needs`,
 * status, input and output wiring, and results. GitHub Actions still owns runner
 * execution, effective permissions, protection-rule decisions, timeouts, concurrency effects, and
 * actual scheduling. Keep task unit tests for the task bodies themselves.
 *
 * Pass `{ config }` as the third argument of `scenario()` when testing local
 * calls. Configure a caller instance with
 * `instance.call(callee, test => { ...callee job fixtures... })`, nesting this for
 * further calls. `expectCallInputs()` and `expectCallSecrets()` check the actual
 * propagated values. Child contexts come from the call and cannot be overridden by
 * child context fixtures. External calls use `callFixture()`; local calls
 * interpret their callee and reject external fixtures. Workflow env does not cross
 * a call. Results retain nested call results and workflow outputs. Optional
 * `{ observe }` sends bounded per-workflow stage events to a host-owned sink
 * without fixture values; sink errors do not change the scenario result.
 *
 * @module
 */
import {
  project,
  type ProjectConfig,
  type TestableWorkflow,
  type TestJobsOf,
  type TestMatrixOf,
  type TestStepOf,
  type TestStepsOf,
  type TS,
} from "../github_actions/mod.ts";
import { runScenario } from "./run.ts";

/** Optional host-owned diagnostic sink. No input, environment, secret, expression or fixture values are recorded.
 * Sink errors never change scenario results. Tsugiori does not own storage or exporters.
 */
export type ScenarioObservation = Readonly<
  {
    /** Run-local operation identifier; not a persistent trace ID.
     */
    operationId: number;
    /** Parent workflow operation ID for a nested reusable call, when present.
     */
    parentId?: number;
    /** Recorded stage, currently workflow.
     */
    stage: "workflow";
    /** Stage start, success or failure; no fixture values are included.
     */
    status: "start" | "success" | "failure";
    /** Stable error category on failure, without raw error text.
     */
    errorType?: string;
  }
>;
/** Host-owned callback receiving privacy-safe workflow stage events. Exceptions are ignored; Tsugiori does not provide storage or exporters. See {@link ScenarioObservation} and {@link scenario}.
 */
export type ScenarioObserver = (event: ScenarioObservation) => void;
/** Recorder state shared by nested scenario workflows. Prefer the observe option on {@link scenario}; IDs identify operations within one run.
 */
export type ScenarioObservationState = {
  /** Host-owned stage event sink; exceptions do not change results.
   * @example Given typed scenario builders for the selected job/step.
   * ```ts
   * const observer: ScenarioObserver = (event) => { console.log(event.stage, event.status); };
   * ```
   */
  observer?: ScenarioObserver;
  /** Next operation identifier shared by nested workflows.
   */
  nextId: number;
  /** Parent workflow operation ID for a nested reusable call, when present.
   */
  parentId?: number;
};
/** Native success, failure or cancelled outcome before continue-on-error changes the conclusion.
 */
export type StepOutcome = "success" | "failure" | "cancelled";
/** Step, job or workflow result, including skipped when its condition or trigger prevents execution.
 */
export type Result = StepOutcome | "skipped";
/** Declared outcome and outputs for a reached authored step. Outcome defaults to success. Task outputs use native contract values; run/Action outputs use strings. All required task outputs must be supplied. See {@link StepScenario.fixture}.
 */
export type Fixture<Outputs> = Readonly<{
  /** Execution result before continue-on-error, default success in a fixture.
   */
  outcome?: StepOutcome;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Partial<Outputs>;
}>;
/** Values resolved by the scenario for a fixture callback: native task inputs, step env and one concrete matrix instance. These are interpreted test values, not live runner observations.
 */
export type FixtureContext<Inputs, Matrix> = Readonly<{
  /** Resolved native step inputs, or supplied external workflow context values.
   */
  inputs: Inputs;
  /** Resolved step environment; workflow env does not cross a reusable call.
   */
  env: Readonly<Record<string, string>>;
  /** Concrete matrix row for this instance; fixtures may branch on its fields.
   */
  matrix: Matrix;
  /** Explicit/default run settings enabled by expectRunSettings(), without runner defaults or filesystem checks. Absent unless explicitly requested on a reached run step. */
  run?: RunDefaults;
}>;
/** A fixed fixture or synchronous/asynchronous callback returning one. The callback receives {@link FixtureContext} and runs only for a reached step. See {@link StepScenario.fixture}.
 */
export type FixtureValue<Inputs, Outputs, Matrix> =
  | Fixture<Outputs>
  | ((
    context: FixtureContext<Inputs, Matrix>,
  ) => Fixture<Outputs> | Promise<Fixture<Outputs>>);

/** Scenario failure with a stable kind and evaluation location. Missing/invalid fixtures, unsupported expressions, evaluation errors and expectation mismatches reject scenario(). No authored Action, script or task body is run.
 */
export class ScenarioError extends Error {
  /** Construct ScenarioError. Usually obtained through scenario builders; constructing a builder does not run interpretation.
   * @example
   * ```ts
   * new ScenarioError("fixture_missing", "ci/build", "Supply a fixture.");
   * ```
   */
  constructor(
    readonly kind:
      | "fixture_missing"
      | "fixture_invalid"
      | "expression_unsupported"
      | "expression_error"
      | "expectation_failed",
    readonly location: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${location}: ${message}`, options);
    this.name = "ScenarioError";
  }
}

/** Interpreted concurrency request, without scheduling or cancellation effects. */
export type ResolvedConcurrency = Readonly<{
  /** Case-insensitive group name resolved from the supplied contexts. */
  group: string;
  /** Whether the supplied context requests cancellation of an in-progress member. */
  cancelInProgress: boolean;
  /** Pending queue policy; this interpreter does not maintain a queue. */
  queue?: "single" | "max";
}>;
/** Settings resolved for a reached concrete job, not a live runner assignment or deployment observation. */
export type JobSettings = Readonly<{
  /** Requested runner labels/group; a group's supplied labels are normalized to an array. Availability and assignment are not simulated. */
  runsOn?: RunnerRequest;
  /** Environment name and deployment flag before steps, optional URL after steps. */
  environment?:
    & Omit<JobEnvironment, "deployment">
    & Readonly<{
      /** Explicit creation flag resolved to a boolean; omission retains GitHub's default. */
      deployment?: boolean;
    }>;
  /** Requested concurrency policy. */
  concurrency?: ResolvedConcurrency;
  /** Explicit strategy controls resolved before expansion; no scheduling or cancellation is simulated. */
  strategy?: Readonly<{
    /** Explicit fail-fast value. */
    failFast?: boolean;
    /** Explicit positive maximum parallel member count. */
    maxParallel?: number;
  }>;
  /** Per-instance failure tolerance; steps retain their actual conclusions. */
  continueOnError?: boolean;
  /** Explicit job timeout in minutes; no elapsed time is simulated. */
  timeoutMinutes?: number;
}>;
/** Aggregate protection decision supplied by a fixture. passed means all rules passed, not one review approval. pending and rule calculation are outside the scenario contract. */
export type EnvironmentProtection = "passed" | "rejected";
/** Observed scenario step result. Outcome precedes continue-on-error; conclusion follows it. Inputs are native parsed values, outputs are serialized strings, and env is the interpreted step environment.
 */
export type StepResult = Readonly<{
  /** Explicit authored step ID.
   */
  id: string;
  /** Execution result before continue-on-error, default success in a fixture.
   */
  outcome: Result;
  /** Result after continue-on-error; a failing step can conclude successfully.
   */
  conclusion: Result;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs: Readonly<Record<string, string>>;
  /** Resolved native step inputs, or supplied external workflow context values.
   */
  inputs: Readonly<Record<string, unknown>>;
  /** Resolved step environment; workflow env does not cross a reusable call.
   */
  env: Readonly<Record<string, string>>;
  /** Explicit/default run settings enabled by expectRunSettings(), without runner defaults or filesystem checks. Absent unless explicitly requested on a reached run step. */
  run?: RunDefaults;
}>;
/** Result of one concrete matrix instance, retaining step results and an optional nested reusable workflow result. See {@link JobResult}.
 */
export type JobInstanceResult = Readonly<{
  /** Concrete matrix row for this instance; fixtures may branch on its fields.
   */
  matrix: Readonly<Record<string, unknown>>;
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Execution result before job failure tolerance, retained when continueOnError is explicitly set. result is the effective dependency/workflow result; this outcome does not change step conclusions or job.status. */
  outcome?: Result;
  /** Observed named steps or retained per-step rules for this instance.
   */
  steps: Readonly<Record<string, StepResult>>;
  /** Nested local reusable workflow result or child scenario program.
   */
  call?: ScenarioResult;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Readonly<Record<string, string>>;
  /** Settings interpreted when expectSettings() explicitly enables validation for this instance. */
  settings?: JobSettings;
  /** Explicit aggregate gate fixture, when provided; omission preserves ungated interpretation. */
  environmentProtection?: EnvironmentProtection;
}>;
/** Aggregate scenario job result and string outputs across matrix instances. Conflicting nonempty output values fail because GitHub completion order cannot be predicted.
 */
export type JobResult = Readonly<{
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs: Readonly<Record<string, string>>;
  /** Results of each expanded matrix instance.
   */
  instances: readonly JobInstanceResult[];
}>;
/** Interpreted workflow result with job and nested call observations. This verifies wiring and modeled logic, not remote execution or authorization. See {@link scenario}.
 */
export type ScenarioResult = Readonly<{
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Job results or retained per-job rules, keyed by authored job IDs.
   */
  jobs: Readonly<Record<string, JobResult>>;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Readonly<Record<string, string>>;
  /** Workflow concurrency request evaluated when expectConcurrency() explicitly enables validation. */
  concurrency?: ResolvedConcurrency;
}>;

/** Mutable step expectations retained by the scenario builder. Prefer {@link StepScenario} methods; this record does not run a step.
 */
export type StepRules = {
  /** Expected effective run settings; no command execution is performed. */
  expectedRunSettings?: RunDefaults;
  /** Fixed or callback fixture for a reached step. Prefer {@link StepScenario.fixture}.
   * @example Given typed scenario builders for the selected job/step.
   * ```ts
   * testStep.fixture(({ inputs }) => ({ outputs: { version: inputs.sha } }));
   * ```
   */
  fixture?: FixtureValue<never, Record<string, unknown>, never>;
  /** Subset of native input keys to compare.
   */
  expectedInputs?: Readonly<Record<string, unknown>>;
  /** Subset of output keys to compare; native values for tasks, strings for job outputs.
   */
  expectedOutputs?: Readonly<Record<string, unknown>>;
  /** Whether the step must be reached (true) or skipped (false).
   */
  expectedRun?: boolean;
  /** Expected result before continue-on-error.
   */
  expectedOutcome?: Result;
  /** Expected result after continue-on-error.
   */
  expectedConclusion?: Result;
  /** Field-specific replacements for unsupported expressions.
   */
  expressions: Map<string, unknown>;
};
/** Mutable expectations for one job/matrix instance. Prefer {@link InstanceScenario} methods.
 */
export type InstanceRules = {
  /** Aggregate environment gate fixture; omit to retain previous behavior. */
  environmentProtection?: EnvironmentProtection;
  /** Requested runner/environment/concurrency expectations. */
  expectedSettings?: JobSettings;
  /** Observed named steps or retained per-step rules for this instance.
   */
  steps: Map<string, StepRules>;
  /** Outcome overrides for generated cache and preparation steps.
   */
  internals: Map<string, StepOutcome>;
  /** Required aggregate result.
   */
  expectedResult?: Result;
  /** Required order of reached authored step IDs.
   */
  expectedStepOrder?: readonly string[];
  /** Nested local reusable workflow result or child scenario program.
   */
  call?: Program;
  /** External reusable call fixture; local calls require a child scenario.
   * @example Given typed scenario builders for the selected job/step.
   * ```ts
   * testJob.callFixture({ outcome: "success", outputs: { version: "1.0.0" } });
   * ```
   */
  callFixture?: FixtureValue<
    Readonly<Record<string, unknown>>,
    Record<string, string>,
    Readonly<Record<string, unknown>>
  >;
  /** Call input keys and values to compare.
   */
  expectedCallInputs?: Readonly<Record<string, unknown>>;
  /** Call secret keys and fixture values to compare.
   */
  expectedCallSecrets?: Readonly<Record<string, string>>;
};
/** Job-wide expectations plus per-instance rules. Prefer {@link JobScenario} methods.
 */
export type JobRules = InstanceRules & {
  /** Expected concrete matrix rows after expansion.
   */
  expectedMatrix?: readonly Readonly<Record<string, unknown>>[];
  /** Subset of output keys to compare; native values for tasks, strings for job outputs.
   */
  expectedOutputs?: Readonly<Record<string, string>>;
  /** Callback constructing rules for one concrete matrix instance. Prefer {@link JobScenario.eachMatrix}.
   * @example Given typed scenario builders for the selected job/step.
   * ```ts
   * testJob.eachMatrix(({ stage }, instance) => { instance.step("build").fixture({ outputs: { version: stage } }); });
   * ```
   */
  matrixRules?: (matrix: Readonly<Record<string, unknown>>) => InstanceRules;
};
/** Mutable scenario definition retained by {@link WorkflowScenario}. Prefer its methods to setting maps directly; interpretation begins in {@link scenario}.
 */
export type Program = {
  /** Expected resolved workflow concurrency request. */
  expectedConcurrency?: ResolvedConcurrency;
  /** Exact workflow expression overrides, such as concurrency.group. */
  expressions?: Map<string, unknown>;
  /** Ordered files considered by GitHub, or its diff bypass reason. */
  changedFiles?: readonly string[] | "timeout" | "over-1000-commits";
  /** Delivered image identity, independent of undocumented payload fields. */
  imageVersion?: Readonly<{
    /** Delivered image name. */
    name: string;
    /** Delivered image version. */
    version: string;
  }>;
  /** Supplied github, inputs, vars and secrets test contexts.
   */
  external: Record<string, unknown>;
  /** Job results or retained per-job rules, keyed by authored job IDs.
   */
  jobs: Map<string, JobRules>;
  /** Common expected conclusion for reached steps.
   */
  defaultResult?: Result;
  /** Required aggregate result.
   */
  expectedResult?: Result;
  /** Declared dependency edges to verify, not parallel scheduling order.
   */
  expectedBefore: [string, string][];
  /** Path of the workflow to interpret.
   */
  workflowPath?: string;
};

type InputsOf<Step> = TestStepOf<Step> extends TS<infer Inputs, unknown>
  ? Inputs
  : never;
type OutputsOf<Step> = TestStepOf<Step> extends TS<unknown, infer Outputs>
  ? Outputs
  : never;
type JobSteps<Job> = TestStepsOf<Job>;
type JobMatrix<Job> = TestMatrixOf<Job>;
type JobNames<Jobs> = keyof Jobs & string;
type StepNames<Job> = keyof JobSteps<Job> & string;

function newStepRules(): StepRules {
  return { expressions: new Map() };
}
function newInstanceRules(): InstanceRules {
  return { steps: new Map(), internals: new Map() };
}
function newJobRules(): JobRules {
  return { ...newInstanceRules() };
}

/** Fixture and independent expectations for one named authored step. Obtain through {@link InstanceScenario.step}; expectations alone do not supply a fixture.
 */
export class StepScenario<Inputs, Outputs, Matrix> {
  /** Construct StepScenario. Usually obtained through scenario builders; constructing a builder does not run interpretation.
   * @example
   * ```ts
   * new StepScenario({ expressions: new Map() });
   * ```
   */
  constructor(private readonly rules: StepRules) {}
  /** Supply one fixture for a reached step; a duplicate fixture throws fixture_invalid. A function receives parsed inputs, env and the concrete matrix row and may return a Promise. Task fixture outputs are validated and serialized; no task body runs.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.fixture(({ inputs }) => ({ outputs: { version: inputs.sha } }));
   * ```
   */
  fixture(value: FixtureValue<Inputs, Outputs, Matrix>): this {
    if (this.rules.fixture !== undefined) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.step",
        "Duplicate fixture.",
      );
    }
    this.rules.fixture = value as StepRules["fixture"];
    return this;
  }
  /** Compare only supplied input keys against resolved native input values; this expectation does not provide a fixture.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectInputs({ sha: "abc" });
   * ```
   */
  expectInputs(value: Partial<Inputs>): this {
    this.rules.expectedInputs = value as Readonly<Record<string, unknown>>;
    return this;
  }
  /** Compare supplied output keys. Step task expectations use native contract values; job expectations use serialized strings.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectOutputs({ version: "1.0.0" });
   * ```
   */
  expectOutputs(value: Partial<Outputs>): this {
    this.rules.expectedOutputs = value as Readonly<Record<string, unknown>>;
    return this;
  }
  /** Enable interpretation and compare effective shell/directory after workflow, job and step overrides. Only applies to reached run steps; does not verify commands or directory existence. Pass {} to expose the resolved values to the fixture callback without comparing properties. Without this call, existing scenarios do not evaluate shell/directory expressions or require their contexts.
   * @example Given a typed step scenario builder `testStep`.
   * ```ts
   * testStep.expectRunSettings({ shell: "bash", workingDirectory: "src" });
   * ```
   */
  expectRunSettings(value: RunDefaults): this {
    this.rules.expectedRunSettings = value;
    return this;
  }
  /** Require the step to be reached. Still supply a fixture for its execution.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectRun();
   * ```
   */
  expectRun(): this {
    this.rules.expectedRun = true;
    return this;
  }
  /** Require the step to be skipped; a skipped step needs no fixture.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectSkip();
   * ```
   */
  expectSkip(): this {
    this.rules.expectedRun = false;
    return this;
  }
  /** Require the outcome before continue-on-error handling.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectOutcome("failure");
   * ```
   */
  expectOutcome(value: Result): this {
    this.rules.expectedOutcome = value;
    return this;
  }
  /** Require the conclusion after continue-on-error handling; it may differ from outcome.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expectConclusion("success");
   * ```
   */
  expectConclusion(value: Result): this {
    this.rules.expectedConclusion = value;
    return this;
  }
  /** Supply a value at this exact expression field for an unsupported raw expression or hashFiles(). The interpreter does not guess unspecified values; use the native field path, such as if or strategy.matrix.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testStep.expression("if", true);
   * ```
   */
  expression(field: string, value: unknown): this {
    this.rules.expressions.set(field, value);
    return this;
  }
}

/** Rules for one execution or reusable-call job instance. Obtain through {@link WorkflowScenario.job} or {@link JobScenario.eachMatrix}.
 */
export class InstanceScenario<Job> {
  /** Construct InstanceScenario. Usually obtained through scenario builders; constructing a builder does not run interpretation.
   * @example
   * ```ts
   * new InstanceScenario({ steps: new Map(), internals: new Map() });
   * ```
   */
  constructor(protected readonly rules: InstanceRules) {}
  /** Select a declared step ID for fixtures and expectations. Repeated selection returns rules for the same step. Anonymous authored steps cannot be fixture targets.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.step("build").fixture({ outputs: { version: "1.0.0" } });
   * ```
   */
  step<const Id extends StepNames<Job>>(
    id: Id,
  ): StepScenario<
    InputsOf<JobSteps<Job>[Id]>,
    OutputsOf<JobSteps<Job>[Id]>,
    JobMatrix<Job>
  > {
    let rules = this.rules.steps.get(id);
    if (rules === undefined) {
      rules = newStepRules();
      this.rules.steps.set(id, rules);
    }
    return new StepScenario(rules);
  }
  /** Interpret a local call with an isolated scenario; do not supply step fixtures on the caller job.
   * @see https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-secrets-to-nested-workflows
   */
  /** Interpret a local reusable call with an isolated child scenario. Supply config containing the callee to scenario(). Child inputs/secrets come from the call and cannot be overridden by child context fixtures; do not supply step fixtures on the caller job. Workflow env does not cross the call.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.call(reusable, (child) => { child.job("build", (job) => { job.step("build").fixture({}); }); });
   * ```
   */
  call<const P extends TestableWorkflow>(
    workflow: P,
    define: (test: WorkflowScenario<TestJobsOf<P>, TestEventsOf<P>>) => void,
  ): this {
    const child = new WorkflowScenario<TestJobsOf<P>, TestEventsOf<P>>();
    define(child);
    child.program.workflowPath =
      project({ workflows: [workflow] }).workflows[0].path;
    this.rules.call = child.program;
    return this;
  }
  /** Supply the aggregate environment protection decision for a reached job instance. passed means every rule passed; rejected prevents all steps and produces job failure. Omission advances as before and proves nothing about GitHub protection. No pending, reviewers, timers or rule calculation is modeled. Configure per-matrix decisions with eachMatrix().
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.environmentProtection("rejected").expectResult("failure");
   * ```
   */
  environmentProtection(value: EnvironmentProtection): this {
    this.rules.environmentProtection = value;
    return this;
  }
  /** Enable interpretation and compare resolved runner/environment/concurrency requests. Runner assignment, protection rules and concurrency scheduling are not simulated. Environment URLs resolve after steps. Pass {} to expose resolved settings on the result without comparing properties. Without this call, existing scenarios do not evaluate these settings or require their contexts.
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.expectSettings({ environment: { name: "production" }, runsOn: { group: "deploy", labels: ["linux"] } });
   * ```
   */
  expectSettings(value: JobSettings): this {
    this.rules.expectedSettings = value;
    return this;
  }
  /** Supply an exact job expression value for raw expressions or unsupported functions; native paths include runs-on.group, environment.url and defaults.run.shell. For settings fields, enable interpretation with expectSettings() or expectRunSettings(); condition and matrix overrides retain their existing behavior.
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.expression("environment.url", "https://example.com")
   *   .expectSettings({ environment: { name: "production", url: "https://example.com" } });
   * ```
   */
  expression(field: string, value: unknown): this {
    const rules = this.rules.steps.get("__job__") ?? newStepRules();
    rules.expressions.set(field, value);
    this.rules.steps.set("__job__", rules);
    return this;
  }
  /** Supply outputs and outcome for an external raw reusable call. A local typed call instead requires call() and rejects an external fixture.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.callFixture({ outcome: "success", outputs: { version: "1.0.0" } });
   * ```
   */
  callFixture(
    value: FixtureValue<
      Readonly<Record<string, unknown>>,
      Record<string, string>,
      Readonly<Record<string, unknown>>
    >,
  ): this {
    this.rules.callFixture = value;
    return this;
  }
  /** Compare propagated reusable call input values independently of fixtures.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectCallInputs({ module: "app" });
   * ```
   */
  expectCallInputs(value: Readonly<Record<string, unknown>>): this {
    this.rules.expectedCallInputs = value;
    return this;
  }
  /** Compare propagated reusable call secrets. Values remain test fixtures, not evidence that GitHub secrets are available.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectCallSecrets({ token: "test-token" });
   * ```
   */
  expectCallSecrets(value: Readonly<Record<string, string>>): this {
    this.rules.expectedCallSecrets = value;
    return this;
  }
  /** Override generated task cache/prepare step outcomes, which otherwise default to success. Authored task bodies still do not run.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.internal("prepare", "failure");
   * ```
   */
  internal(
    which: "cache" | "prepare",
    outcome: StepOutcome,
  ): this {
    this.rules.internals.set(which, outcome);
    return this;
  }
  /** Require the aggregate job or workflow result after dependency and condition evaluation.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectResult("success");
   * ```
   */
  expectResult(result: Result): this {
    this.rules.expectedResult = result;
    return this;
  }
  /** Require the reached authored step order using declared IDs. This does not assert real runner scheduling.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectStepOrder("build");
   * ```
   */
  expectStepOrder(...ids: readonly StepNames<Job>[]): this {
    this.rules.expectedStepOrder = ids;
    return this;
  }
}

/** Job-wide and per-matrix expectations. Obtain from {@link WorkflowScenario.job}. All reached authored steps still need fixtures.
 */
export class JobScenario<Job> extends InstanceScenario<Job> {
  /** Construct JobScenario. Usually obtained through scenario builders; constructing a builder does not run interpretation.
   * @example
   * ```ts
   * new JobScenario({ steps: new Map(), internals: new Map() });
   * ```
   */
  constructor(protected override readonly rules: JobRules) {
    super(rules);
  }
  /** Require the expanded concrete matrix rows. Compare after include/exclude and expression evaluation.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectMatrix([{ stage: "dev" }, { stage: "prd" }]);
   * ```
   */
  expectMatrix(value: readonly JobMatrix<Job>[]): this {
    this.rules.expectedMatrix = value as readonly Readonly<
      Record<string, unknown>
    >[];
    return this;
  }
  /** Compare supplied output keys. Step task expectations use native contract values; job expectations use serialized strings.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.expectOutputs({ version: "1.0.0" });
   * ```
   */
  expectOutputs(value: Readonly<Record<string, string>>): this {
    this.rules.expectedOutputs = value;
    return this;
  }
  /** Define rules separately for every expanded matrix instance. Receives the concrete row and its instance builder; fixtures may depend on that row.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * testJob.eachMatrix(({ stage }, instance) => { instance.step("build").fixture({ outputs: { version: stage } }); });
   * ```
   */
  eachMatrix(
    define: (
      matrix: JobMatrix<Job>,
      instance: InstanceScenario<Job>,
    ) => void,
  ): this {
    this.rules.matrixRules = (matrix) => {
      const rules = newInstanceRules();
      define(matrix as JobMatrix<Job>, new InstanceScenario<Job>(rules));
      return rules;
    };
    return this;
  }
}

/** Recursive optional fixture shape. Properties retain their source value types; missing values needed by evaluation fail at their location. */
export type EventFixture<T> = T extends readonly (infer V)[]
  ? readonly EventFixture<V>[]
  : T extends object ? keyof T extends never ? Readonly<Record<string, never>>
    : { readonly [K in keyof T]?: EventFixture<T[K]> }
  : T;
/** Correlated event name and partial payload; the event must be declared by the workflow, or inherited by workflow_call. */
export type GitHubFixture<On extends WorkflowTriggers> = {
  [E in RuntimeEvents<On>]:
    & EventFixture<Omit<GitHubContext, "event" | "event_name">>
    & {
      /** Delivered event, correlated with its payload. */
      readonly event_name: E;
      /** Only values relevant to this scenario; required reads report missing fixtures. */
      readonly event?: EventFixture<EventPayload<E, On>>;
    };
}[RuntimeEvents<On>];
type TestEventsOf<W> = W extends { readonly inputs: Expression<infer I> }
  ? EventsOf<I>
  : WorkflowTriggers;

/** Builder for external contexts, fixtures and expectations. The callback passed to {@link scenario} receives this builder; constructing one alone does not interpret a workflow.
 */
export class WorkflowScenario<
  Jobs,
  On extends WorkflowTriggers = WorkflowTriggers,
> {
  /** Mutable scenario definition populated by builder methods. Interpretation starts in {@link scenario}.
   */
  readonly program: Program = {
    external: {},
    jobs: new Map(),
    expectedBefore: [],
  };
  /** Supply referenced github context properties, including event_name/ref/event for trigger filtering. These are test values; no network lookup occurs.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
   * ```
   */
  github(value: GitHubFixture<On>): this {
    this.program.external.github = value;
    return this;
  }
  /** Supply the ordered file list GitHub considered, or a GitHub diff bypass reason.
   * Files are truncated to GitHub's first 300. A timeout or over 1,000 commits bypasses path filters.
   * Omission is an error when a path filter needs this fact; no Git lookup occurs.
   * @example Given a workflow scenario builder `test`.
   * ```ts
   * test.changedFiles(["src/main.ts"]);
   * ```
   */
  changedFiles(
    value: readonly string[] | "timeout" | "over-1000-commits",
  ): this {
    this.program.changedFiles = value;
    return this;
  }
  /** Supply delivered custom image identity; the fixed source does not specify image_version payload fields.
   * @example Given a workflow scenario builder `test`.
   * ```ts
   * test.imageVersion({ name: "MyImage", version: "1.0.0" });
   * ```
   */
  imageVersion(
    value: Readonly<{
      /** Delivered image name. */
      name: string;
      /** Delivered image version. */
      version: string;
    }>,
  ): this {
    this.program.imageVersion = value;
    return this;
  }
  /** Supply native values for inputs declared by this workflow; undeclared names and wrong native types fail typechecking. Omitted values use declaration defaults; required omitted values fail interpretation. Local child calls receive propagated call arguments instead.
   * @example
   * ```ts
   * const manual = workflow("manual.yml", {on:{workflow_dispatch:{inputs:{stage:{type:"string"}}}}})
   *   .job("check", ({job})=>job.runsOn("ubuntu-latest").run({id:"check",name:"Check",run:"true"}));
   * await scenario(manual, test => {
   *   test.github({event_name:"workflow_dispatch"});
   *   test.inputs({stage:"dev"});
   *   test.job("check", job => job.step("check").fixture({}));
   * });
   * ```
   */
  inputs(
    value: keyof WorkflowInputValues<On> extends never
      ? Readonly<Record<string, never>>
      : Partial<WorkflowInputValues<On>>,
  ): this {
    this.program.external.inputs = value;
    return this;
  }
  /** Supply referenced repository/organization variable context values.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.vars({ REGION: "ap-northeast-1" });
   * ```
   */
  vars(value: Readonly<Record<string, unknown>>): this {
    this.program.external.vars = value;
    return this;
  }
  /** Supply referenced secrets as test data; this does not verify GitHub availability or permissions.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.secrets({ TOKEN: "fixture-token" });
   * ```
   */
  secrets(value: Readonly<Record<string, unknown>>): this {
    this.program.external.secrets = value;
    return this;
  }
  /** Enable interpretation and compare the workflow concurrency request without simulating competing runs. Without this call, existing scenarios do not evaluate concurrency expressions or require their contexts.
   * @example Given a workflow scenario builder `test`.
   * ```ts
   * test.expectConcurrency({ group: "ci-main", cancelInProgress: true });
   * ```
   */
  expectConcurrency(value: ResolvedConcurrency): this {
    this.program.expectedConcurrency = value;
    return this;
  }
  /** Supply an exact workflow expression override, such as concurrency.cancel-in-progress, for unsupported raw expressions. Enable interpretation with expectConcurrency().
   * @example Given a workflow scenario builder `test`.
   * ```ts
   * test.expression("concurrency.group", "ci-main")
   *   .expectConcurrency({ group: "ci-main", cancelInProgress: false });
   * ```
   */
  expression(field: string, value: unknown): this {
    (this.program.expressions ??= new Map()).set(field, value);
    return this;
  }
  /** Set a common expected conclusion for all reached authored steps. Explicit step expectations remain independent.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.expectAllReached("success");
   * ```
   */
  expectAllReached(result: Result): this {
    this.program.defaultResult = result;
    return this;
  }
  /** Require the aggregate job or workflow result after dependency and condition evaluation.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.expectResult("success");
   * ```
   */
  expectResult(result: Result): this {
    this.program.expectedResult = result;
    return this;
  }
  /** Check a declared needs edge between two jobs. Independent jobs have no asserted execution order.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.expectBefore("build", "deploy");
   * ```
   */
  expectBefore<Left extends JobNames<Jobs>, Right extends JobNames<Jobs>>(
    left: Left,
    right: Right,
  ): this {
    this.program.expectedBefore.push([left, right]);
    return this;
  }
  /** Define rules for a declared job ID; duplicate job definitions throw fixture_invalid. The callback receives job-wide rules and can define per-matrix fixtures.
   * @example Given typed scenario builders `test`, `testJob` or `testStep` for the selected workflow/job/step.
   * ```ts
   * test.job("build", (job) => { job.step("build").fixture({ outputs: { version: "1.0.0" } }); });
   * ```
   */
  job<const Id extends JobNames<Jobs>>(
    id: Id,
    define: (job: JobScenario<Jobs[Id]>) => void,
  ): this {
    if (this.program.jobs.has(id)) {
      throw new ScenarioError("fixture_invalid", id, "Duplicate job scenario.");
    }
    const rules = newJobRules();
    this.program.jobs.set(id, rules);
    define(new JobScenario(rules));
    return this;
  }
}

/** Interpret a completed workflow with explicit fixtures and check expectations. The definition callback runs first; fixture callbacks run when their steps are reached. Returns results or rejects with {@link ScenarioError}. Supply config for local reusable calls. See this module for supported logic and verification limits.
 * @example Given a completed workflow with a `build` matrix job (stage) and task step `build` producing required text output `version`.
 * ```ts
 * await scenario(ci, (test) => {
 *   test.github({ event_name: "push", ref: "refs/heads/main", event: {} });
 *   test.job("build", (job) => {
 *     job.eachMatrix(({ stage }, instance) => {
 *       instance.step("build").fixture({ outputs: { version: stage } }).expectRun();
 *     });
 *   });
 * });
 * ```
 */
export async function scenario<
  const Workflow extends TestableWorkflow,
>(
  workflow: Workflow,
  define: (
    test: WorkflowScenario<TestJobsOf<Workflow>, TestEventsOf<Workflow>>,
  ) => void,
  options: Readonly<{
    /** Project containing the primary workflow and all local reusable callees. */
    config?: ProjectConfig;
    /** Privacy-safe stage sink; sink exceptions do not change the result.
     * @example Given a completed `workflow` and `configureScenario`, a callback supplying its fixtures.
     * ```ts
     * await scenario(ci, configureScenario, { observe: (event) => console.log(event.stage, event.status) });
     * ```
     */
    observe?: ScenarioObserver;
  }> = {},
): Promise<ScenarioResult> {
  const builder = new WorkflowScenario<
    TestJobsOf<Workflow>,
    TestEventsOf<Workflow>
  >();
  define(builder);
  const primary = project({ workflows: [workflow] }).workflows[0];
  const config = options.config ?? project({ workflows: [workflow] });
  if (!config.workflows.includes(primary)) {
    throw new ScenarioError(
      "fixture_invalid",
      primary.path,
      "Scenario workflow must be included in config.",
    );
  }
  builder.program.workflowPath = primary.path;
  return await runScenario(config, builder.program, false, {
    observer: options.observe,
    nextId: 0,
  });
}
