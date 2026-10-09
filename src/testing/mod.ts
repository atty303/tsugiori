import type {
  JobEnvironment,
  PermissionLevel,
  RunDefaults,
  RunnerRequest,
  WorkflowInputValues,
  WorkflowPermissions,
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
  ScopeValues,
} from "../github_actions/expression.ts";
/**
 * Interpret workflow logic with fixtures using {@link scenario}.
 *
 * Scenarios lower a completed GitHub Actions workflow without executing steps,
 * Actions or task bodies. Supply external contexts with github(), inputs(),
 * vars() and secrets(), and a fixture for every reached authored step. Reached
 * steps need explicit IDs. Task fixtures supply contract-native outputs;
 * run/Action fixtures supply strings. Required task outputs are validated.
 *
 * Use ordinary test assertions on the returned {@link ScenarioResult}, or on
 * fixture callback inputs. Results retain job dependencies, matrix instances,
 * logical authored step launch order, outcomes/conclusions, inputs, environments
 * and outputs. Task steps expose parsed typedOutputs alongside string outputs.
 * Job and step IDs and task contracts are inferred from the completed workflow.
 * A skipped workflow has no job entries; rejected environments run no steps.
 * These maps and contract outputs preserve absence in their public types.
 *
 * Settings evaluate at their native lifecycle boundary without an enablement
 * call. Each getter returns its captured value, or throws {@link ScenarioError}
 * with kind fixture_missing if that field required an unsupplied context.
 * Unspecified/nonapplicable fields remain absent. A shortage in one field does
 * not prevent reading another field. No public Result container or unwrap is
 * needed. Enumeration reveals field names without reading values; copying,
 * destructuring, JSON serialization or assertion of a whole settings object
 * reads its getters and can therefore throw. Getters never evaluate expressions
 * or rerun fixture callbacks. Invalid expressions fail during interpretation.
 * Conditions, inputs and outputs needed for value propagation remain strict.
 * Platform runner defaults and filesystem existence are never inferred.
 *
 * {@link InstanceScenario.suppressedOutputs} supplies output names withheld by
 * the runner. After evaluation and before matrix aggregation, these names are
 * omitted from the execution job's delivered outputs. Step outputs stay intact.
 * Omission means no suppression, not evidence about GitHub secret detection.
 * Neither secrets() nor add-mask commands trigger detection in scenarios.
 *
 * Common step fixtures and github maps are inherited by eachMatrix() instances.
 * Named github keys merge; each value and fixture is atomic. replaceInherited()
 * excludes common settings for a step. Duplicate registrations in one scope
 * fail. Suppression lists replace atomically across instance scopes.
 * completionOrder() supplies a complete job-index permutation for output
 * aggregation, not scheduling. Instance results retain expansion order.
 * Strategy uses expanded instance count as the model default max-parallel.
 * Root tokenPermissions() optionally models permission declarations and caller
 * ceilings; it does not establish actual authorization.
 *
 * Supply config to scenario() for local reusable calls, configure instance.call()
 * with callee fixtures, and inspect callInputs/callSecrets on caller results.
 * Local callee contexts inherit actual caller values and cannot be overridden.
 * GITHUB_TOKEN propagates automatically; custom secrets require explicit passing
 * or inheritance. Workflow env and runner fixtures do not cross call boundaries.
 * Callee execution jobs supply their own runtime and suppression fixtures.
 * External calls use callFixture() with final delivered output values.
 *
 * containerRuntime(), containerInitialization() and environmentProtection()
 * supply runner-owned observations; they do not emulate Docker or protection
 * decisions. Rejection consumes no step fixtures and withholds derived outputs.
 * Generated cache/prepare steps succeed unless overridden with internal().
 * Logical background joins defer fixture results and environment changes.
 * Scenarios do not verify event delivery, live access, runner eligibility,
 * scheduling, timeouts, actual synchronization, image creation or cache work.
 *
 * The optional host-owned observe sink receives bounded stage IDs, statuses and
 * error kinds, never fixture values. Sink failures do not affect interpretation.
 * Getter failures are synchronous retained-result reads, not new operations.
 * Tsugiori owns no recorder, exporter or diagnostic store.
 *
 * @module
 */
import {
  validateJobRuntime,
  validateRunnerRuntime,
  validateStepGitHub,
} from "./contexts.ts";
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
    /** Background launch operations joined or receiving a stop request. IDs contain no fixture values.
     */
    links?: readonly number[];
    /** Workflow interpretation, container initialization or logical synchronization stage.
     */
    stage:
      | "workflow"
      | "container-initialization"
      | "background-start"
      | "background-join"
      | "background-cancel";
    /** Stage start, success, failure or cancellation; no fixture values are included.
     */
    status: "start" | "success" | "failure" | "cancelled";
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
  /** Values written to GITHUB_ENV, supplied as fixture facts. Published only at
   * completion/synchronization and unavailable to the producing step itself.
   * Conflicting writes joined at one boundary fail because completion order is
   * not modeled. No environment values are sent to the observation sink.
   */
  environmentChanges?: Readonly<Record<string, string>>;
  /** Execution result before continue-on-error, default success in a fixture.
   */
  outcome?: StepOutcome;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Partial<Outputs>;
}>;
/** Resolved native matrix strategy for one scenario instance. These modeled values do not observe scheduling. */
export interface ResolvedStrategy {
  /** Failure-cancellation declaration, default true; no cancellation scheduler is simulated. */
  readonly "fail-fast": boolean;
  /** Zero-based index in matrix expansion order, independent of completionOrder(). */
  readonly "job-index": number;
  /** Number of expanded instances. */
  readonly "job-total": number;
  /** Explicit evaluated limit, or the instance count under the scenario's sufficient-runner assumption. */
  readonly "max-parallel": number;
}
type ResolvedTokenPermissionMap = Readonly<
  {
    [K in keyof Exclude<WorkflowPermissions, string>]-?:
      & Exclude<WorkflowPermissions, string>[K]
      & PermissionLevel;
  }
>;
/** Complete readonly scenario token permission map, with native levels for each scope. Values describe fixture-based authority, not live authorization. */
export interface TokenPermissions extends ResolvedTokenPermissionMap {}
/** Root environment assumptions enabling permission interpretation. Declarations may increase defaults; restrictWrites is applied afterwards. */
export interface TokenPermissionFixture {
  /** Environment default permission map or native shorthand. Omitted map scopes become none.
   * @example
   * ```ts
   * const assumptions: TokenPermissionFixture = { defaults: { contents: "read" }, restrictWrites: false };
   * ```
   */
  readonly defaults: WorkflowPermissions;
  /** Explicit environment restriction: write becomes read where supported, otherwise none. No event/repository settings are inferred. */
  readonly restrictWrites: boolean;
}

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
  /** Resolved strategy; omitted max-parallel uses the expanded instance count, not a platform prediction. */
  strategy: ResolvedStrategy;
  /** Resolved complete token map when root tokenPermissions() enables validation; otherwise undefined. */
  tokenPermissions?: TokenPermissions;
  /** Effective explicit/default run settings for a reached run step. Individual getters report fixture shortages; no platform defaults or filesystem checks are inferred. */
  run?: RunDefaults;
}>;
/** A fixed fixture or synchronous/asynchronous callback returning one. The callback receives {@link FixtureContext} and runs only for a reached step. See {@link StepScenario.fixture}.
 */
export type FixtureValue<Inputs, Outputs, Matrix> =
  | Fixture<Outputs>
  | ((
    context: FixtureContext<Inputs, Matrix>,
  ) => Fixture<Outputs> | Promise<Fixture<Outputs>>);

/** Scenario failure with a stable kind and evaluation location. Required missing/invalid fixtures and expression errors reject scenario(); optional setting shortages are retained and thrown by their getters. No authored Action, script or task body is run.
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
      | "expression_error",
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
  /** Effective requested cache access, without actual cache operations or token
   * enforcement. Its getter reports missing trigger fixtures. */
  cacheMode?: import("../github_actions/mod.ts").CacheMode;
  /** Nearest explicit declaration, inherited explicit caller limit, or native
   * trigger default supplying cacheMode. A trigger default is not a reusable cap. */
  cacheModeSource?: "job" | "workflow" | "caller" | "trigger";
  /** Image generation requested after successful execution and a truthy snapshot
   * condition. Absent on failure/cancellation/rejection or a false condition.
   * This is not proof of image creation or runner eligibility. */
  snapshot?: Readonly<{
    /** Requested image name. */ imageName: string;
    /** Optional requested major version; no generated version is invented. */ version?:
      string;
  }>;
  /** Resolved job container request; runner compatibility is not checked. */ container?:
    | string
    | import("../github_actions/mod.ts").ContainerSettings;
  /** Resolved service requests, including empty images that disable startup. */ services?:
    Readonly<
      Record<string, import("../github_actions/mod.ts").ServiceSettings>
    >;
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
/** Partial runner-owned container context. Supply only fields used by reached
 * expressions; omitted fields are not invented. Set per-instance values through
 * eachMatrix(). Disabled services cannot have runtime fixtures. No Docker is run.
 * @example Given a typed job/instance scenario builder `testJob`.
 * ```ts
 * testJob.containerRuntime({ services: { db: { ports: { "5432": "32768" } } } });
 * ```
 */
export type ContainerRuntime = Readonly<{
  /** Job container identity and shared Docker network. A service-only job can provide network, but has no container ID. */
  container?: Readonly<{
    /** Runner-assigned container ID. */ id?: string;
    /** Runner-assigned network ID. */ network?: string;
  }>;
  /** Runtime values for declared, active service names; each entry may be partial. */
  services?: Readonly<
    Record<
      string,
      Readonly<{
        /** Runner-assigned service container ID. */ id?: string;
        /** Shared Docker network ID. */ network?: string;
        /** Container port to runner-assigned host port strings. */ ports?:
          Readonly<Record<string, string>>;
      }>
    >
  >;
}>;
/** Aggregate outcome of the runner's container initialization pre-step. Failure
 * keeps the job failed while later steps follow their native status conditions.
 * Omission in a scenario assumes initialization proceeds, without proving startup.
 */
export type ContainerInitialization = "success" | "failure";

/** Aggregate protection decision supplied by a fixture. passed means all rules passed, not one review approval. pending and rule calculation are outside the scenario contract. */
export type EnvironmentProtection = "passed" | "rejected";
/** Named step results inferred from a completed job. Unknown job shapes retain string-keyed results; runtime-generated steps are not part of the typed authored map. */
export type ScenarioSteps<Job> = [TestStepsOf<Job>] extends [never]
  ? Readonly<Record<string, StepResult>>
  : Readonly<
    Partial<
      {
        [Id in keyof TestStepsOf<Job>]: StepResult<
          InputsOf<TestStepsOf<Job>[Id]>,
          OutputsOf<TestStepsOf<Job>[Id]>
        >;
      }
    >
  >;
/** Named job results inferred from a completed workflow. A skipped workflow has no job entries. */
export type ScenarioJobs<Jobs> = Readonly<
  Partial<{ [Id in keyof Jobs]: JobResult<Jobs[Id]> }>
>;
/** Observed scenario step result. Outcome precedes continue-on-error; conclusion follows it. Inputs are native parsed values, outputs are serialized strings, and env is the interpreted step environment.
 */
export type StepResult<
  Inputs = Record<string, unknown>,
  Outputs = Record<string, unknown>,
> = Readonly<{
  /** Whether a native cancel requested termination. The producer fixture still
   * owns the final outcome; cancellation requests do not invent process results.
   */
  cancellationRequested?: boolean;
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
  /** Contract-native outputs. Task values are parsed from their wire representation; run/Action values remain strings. Skipped steps and omitted task outputs have no typed output keys. */
  typedOutputs: Readonly<Partial<Outputs>>;
  /** Resolved native step inputs, or supplied external workflow context values.
   */
  inputs: Readonly<{ [Name in keyof Inputs]?: Inputs[Name] | null }>;
  /** Resolved step environment; workflow env does not cross a reusable call.
   */
  env: Readonly<Record<string, string>>;
  /** Effective explicit/default run settings for a reached run step. Individual getters report fixture shortages; no platform defaults or filesystem checks are inferred. */
  run?: RunDefaults;
}>;
/** Result of one concrete matrix instance, retaining step results and an optional nested reusable workflow result. See {@link JobResult}.
 */
export type JobInstanceResult<Job = unknown> = Readonly<{
  /** Explicit initialization fixture; omission does not prove runner startup. */ containerInitialization?:
    ContainerInitialization;
  /** Concrete matrix row for this instance; fixtures may branch on its fields.
   */
  matrix: Readonly<Record<string, unknown>>;
  /** Resolved strategy in expansion order; completion order does not renumber instances. */
  strategy: ResolvedStrategy;
  /** Fixture-based token authority for this job/call, present only when permission validation is enabled. */
  tokenPermissions?: TokenPermissions;
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Execution result before job failure tolerance, retained when continueOnError is explicitly set. result is the effective dependency/workflow result; this outcome does not change step conclusions or job.status. */
  outcome?: Result;
  /** Observed named steps or retained per-step rules for this instance.
   */
  steps: ScenarioSteps<Job>;
  /** IDs of reached authored steps in logical launch order; not hosted scheduling. */
  stepOrder: readonly string[];
  /** Evaluated reusable call inputs; absent for execution jobs. */
  callInputs?: Readonly<Record<string, unknown>>;
  /** Propagated reusable call secret fixtures; never emitted to observation sinks. */
  callSecrets?: Readonly<Record<string, unknown>>;
  /** Nested local reusable workflow result or child scenario program.
   */
  call?: ScenarioResult;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Readonly<Record<string, string>>;
  /** Settings captured at their native evaluation time. Missing fixture values throw only when the affected field getter is read. */
  settings: JobSettings;
  /** Explicit aggregate gate fixture, when provided; omission preserves ungated interpretation. */
  environmentProtection?: EnvironmentProtection;
}>;
/** Aggregate scenario job result and string outputs across matrix instances. Conflicting nonempty output values fail unless completionOrder() supplies an explicit order; scheduling is not predicted.
 */
export type JobResult<Job = unknown> = Readonly<{
  /** Declared native dependency IDs. This is a graph edge, not a scheduling observation. */
  needs: readonly string[];
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs: Readonly<Record<string, string>>;
  /** Results of each expanded matrix instance.
   */
  instances: readonly JobInstanceResult<Job>[];
}>;
/** Interpreted workflow result with job and nested call observations. This verifies wiring and modeled logic, not remote execution or authorization. See {@link scenario}.
 */
export type ScenarioResult<Jobs = Record<string, unknown>> = Readonly<{
  /** Aggregate interpreted result; not a live GitHub execution observation.
   */
  result: Result;
  /** Job results or retained per-job rules, keyed by authored job IDs.
   */
  jobs: ScenarioJobs<Jobs>;
  /** Declared fixture values or observed serialized outputs. See the owning type for native task values versus GitHub wire strings.
   */
  outputs?: Readonly<Record<string, string>>;
  /** Workflow concurrency request captured before jobs. Absent when undeclared; individual getters report fixture shortages. */
  concurrency?: ResolvedConcurrency;
}>;

/** Mutable step fixtures retained by the scenario builder. Prefer {@link StepScenario} methods; this record does not run a step.
 */
export type StepRules = {
  /** Step-local runner-owned github values; never recorded by observers. */
  github?: StepGitHub;
  /** Fixed or callback fixture for a reached step. Prefer {@link StepScenario.fixture}.
   * @example Given typed scenario builders for the selected job/step.
   * ```ts
   * testStep.fixture(({ inputs }) => ({ outputs: { version: inputs.sha } }));
   * ```
   */
  fixture?: FixtureValue<never, Record<string, unknown>, never>;
  /** Step-scoped hashFiles return values keyed by JSON-encoded evaluated string argument tuples. Prefer hashFiles(). */
  hashFiles?: Map<string, string>;
  /** False explicitly excludes all inherited step settings. Prefer replaceInherited(). */
  inherit?: false;
};
/** Mutable fixtures for one job/matrix instance. Prefer {@link InstanceScenario} methods.
 */
export type InstanceRules = {
  /** Runner-owned job identity fixture; excludes computed status and containers. */
  jobRuntime?: JobRuntime;
  /** Assigned runner fixture for this instance; no assignment is inferred. */
  runner?: RunnerRuntime;
  /** Explicit partial runner context fixture; never recorded by observers. */ containerRuntime?:
    ContainerRuntime;
  /** Explicit aggregate container initialization result. */ containerInitialization?:
    ContainerInitialization;
  /** Aggregate environment gate fixture; omit to retain previous behavior. */
  environmentProtection?: EnvironmentProtection;
  /** Output names withheld by the runner for this execution job. Omission means no suppression; matrix-specific lists replace the common list. */
  suppressedOutputs?: readonly string[];
  /** Observed named steps or retained per-step rules for this instance.
   */
  steps: Map<string, StepRules>;
  /** Outcome overrides for generated cache and preparation steps.
   */
  internals: Map<string, StepOutcome>;
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
};
/** Job-wide fixtures plus per-instance rules. Prefer {@link JobScenario} methods.
 */
export type JobRules = InstanceRules & {
  /** Full permutation of expanded zero-based job indices for output aggregation, not execution scheduling. */
  completionOrder?: readonly number[];
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
  /** Root-only environment assumptions. Nested local calls inherit the caller authority instead. */
  tokenPermissions?: TokenPermissionFixture;
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
  return {};
}
function newInstanceRules(): InstanceRules {
  return { steps: new Map(), internals: new Map() };
}
function newJobRules(): JobRules {
  return { ...newInstanceRules() };
}

function duplicate(setting: string): never {
  throw new ScenarioError(
    "fixture_invalid",
    "scenario.step",
    `Duplicate ${setting} registration in one scope.`,
  );
}
function setStepValue<K extends keyof StepRules>(
  rules: StepRules,
  key: K,
  value: StepRules[K],
): void {
  if (rules[key] !== undefined) duplicate(key);
  rules[key] = value;
}
function addNamedValues<T extends object>(
  previous: T | undefined,
  value: T,
  setting: string,
): T {
  for (const key of Object.keys(value)) {
    if (previous && Object.hasOwn(previous, key)) {
      duplicate(`${setting}.${key}`);
    }
  }
  return Object.freeze({ ...previous, ...value });
}

/** Fixture inputs for one named authored step. Obtain through {@link InstanceScenario.step}; assert its observed result after scenario().
 */
export class StepScenario<Inputs, Outputs, Matrix> {
  /** Construct StepScenario. Usually obtained through scenario builders; constructing a builder does not run interpretation.
   * @example
   * ```ts
   * new StepScenario({});
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
  /** Exclude all job-wide settings for this instance's step, keeping only registrations in this scope. Call inside eachMatrix(); calling on common rules fails interpretation. Repeated calls fail. Does not delete individual keys.
   * @example Given a typed job scenario builder `testJob`.
   * ```ts
   * testJob.eachMatrix((matrix, instance) => { instance.step("build").replaceInherited().fixture({}); });
   * ```
   */
  replaceInherited(): this {
    setStepValue(this.rules, "inherit", false);
    return this;
  }
  /** Inject a hashFiles return value for this step's evaluated string arguments, preserving exact order/case. Shared across its expression fields; surrounding operations still evaluate. Duplicate tuples in one scope fail; instance tuples override common ones. Empty results are valid. No glob or filesystem hashing runs. Only reached calls require fixtures; unused registrations are allowed.
   * @example Given a typed step scenario builder `testStep`.
   * ```ts
   * testStep.hashFiles(["deno.lock", "!vendor/**"], "fixture-hash").fixture({});
   * ```
   */
  hashFiles(paths: readonly [string, ...string[]], value: string): this {
    if (
      !Array.isArray(paths) || !paths.length ||
      !paths.every((path) => typeof path === "string") ||
      typeof value !== "string"
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.step.hashFiles",
        "Supply a nonempty string argument tuple and a string result.",
      );
    }
    const key = JSON.stringify(paths);
    const hashes = this.rules.hashFiles ??= new Map();
    if (hashes.has(key)) duplicate("hashFiles arguments");
    hashes.set(key, value);
    return this;
  }
  /** Supply runner-owned github values for this step, overriding matching
   * workflow fixture values only for this step's condition, env, inputs and run
   * settings. Event/caller identity and computed contexts cannot be overridden.
   * Invalid keys/types fail with fixture_invalid; missing referenced values fail
   * at evaluation. No files are read or written. Observer records omit values.
   * @example Given a typed step scenario builder `testStep`.
   * ```ts
   * testStep.github({ artifacts: "/fixture/step-artifacts" }).fixture({});
   * ```
   */
  github(value: StepGitHub): this {
    validateStepGitHub(value, "scenario.step.github");
    this.rules.github = addNamedValues(this.rules.github, value, "github");
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
  /** Select a declared step ID for fixtures. Repeated selection returns rules for the same step. Anonymous authored steps cannot be fixture targets.
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
  /** Supply the runner-owned identity of this execution job. Job-wide values
   * are merged with eachMatrix instance values, with the instance taking priority
   * for matching fields. In local calls configure the callee's execution jobs;
   * reusable caller jobs have no runner and reject this fixture. Missing reads
   * fail at evaluation; IDs and workflow identities are never inferred. Status,
   * container/services and other contexts cannot be overridden. Invalid keys or
   * types fail with fixture_invalid. Observer records omit fixture values.
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.jobRuntime({ check_run_id: 42, workflow_file_path: ".github/workflows/build.yml" });
   * ```
   */
  jobRuntime(value: JobRuntime): this {
    validateJobRuntime(value, "scenario.jobRuntime");
    this.rules.jobRuntime = value;
    return this;
  }
  /** Supply assigned-runner context for this execution job or matrix instance.
   * Instance fields override matching job-wide values. No value is inferred from
   * runsOn, and callee execution jobs receive their own fixtures rather than the
   * caller's runner. Reusable caller jobs reject this fixture. Referenced missing
   * values fail at evaluation; invalid keys/types fail with fixture_invalid.
   * Observer records omit fixture values.
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.runner({ environment: "self-hosted", os: "Linux", arch: "ARM64" });
   * ```
   */
  runner(value: RunnerRuntime): this {
    validateRunnerRuntime(value, "scenario.runner");
    this.rules.runner = value;
    return this;
  }
  /** Supply the aggregate environment protection decision for a reached job instance. passed means every rule passed; rejected prevents all steps and produces job failure. Omission advances as before and proves nothing about GitHub protection. No pending, reviewers, timers or rule calculation is modeled. Configure per-matrix decisions with eachMatrix().
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.environmentProtection("rejected");
   * ```
   */
  environmentProtection(value: EnvironmentProtection): this {
    this.rules.environmentProtection = value;
    return this;
  }
  /** Supply partial job/service container context for this instance. Only runtime
   * fields read by reached expressions are required; missing values fail at their
   * evaluation site. No ID, network or host port is generated from declarations.
   * Configure matrix-specific fixtures with eachMatrix().
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.containerRuntime({ services: { db: { ports: { "5432": "32768" } } } });
   * ```
   */
  containerRuntime(value: ContainerRuntime): this {
    this.rules.containerRuntime = value;
    return this;
  }
  /** Supply the aggregate container initialization pre-step outcome. Failure
   * closes the implicit success gate; failure()/always() steps may still be reached.
   * Their commands are not executed and may themselves need fixtures. Job failure
   * tolerance affects the dependency/workflow result, not failure() or job.status.
   * Requires container/services declarations. No Docker health check, retry or
   * partial startup is inferred; supply any required partial context separately.
   * @example Given a typed job/instance scenario builder `testJob`.
   * ```ts
   * testJob.containerInitialization("failure");
   * ```
   */
  containerInitialization(value: ContainerInitialization): this {
    this.rules.containerInitialization = value;
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
  /** Supply the output names withheld by the runner, without modeling secret detection. Applies only to execution jobs; configure local reusable callees at their execution jobs. External call fixtures already contain delivered outputs. Names must be declared job outputs, unique and nonempty. Duplicate registration in one scope fails. Matrix instance lists replace common lists, including an empty list.
   * @example Given a job scenario builder for a job declaring output `token`.
   * ```ts
   * testJob.suppressedOutputs(["token"]);
   * ```
   */
  suppressedOutputs(names: readonly string[]): this {
    if (
      this.rules.suppressedOutputs !== undefined || !Array.isArray(names) ||
      names.some((name) => typeof name !== "string" || !name) ||
      new Set(names).size !== names.length
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.suppressedOutputs",
        "Suppression requires unique nonempty output names and one registration per scope.",
      );
    }
    this.rules.suppressedOutputs = Object.freeze([...names]);
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
}

/** Job-wide and per-matrix fixtures. Obtain from {@link WorkflowScenario.job}. All reached authored steps still need fixtures.
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
  /** Supply each expanded job-index exactly once, earliest completion first. Duplicates, missing/out-of-range indices and repeat registration fail. Changes output aggregation only, not fixture execution or result instance order. Omission retains conflict errors for differing nonempty values. Applies to ordinary jobs and reusable calls, with their respective native output rules.
   * @example Given a two-instance job scenario builder `testJob`.
   * ```ts
   * testJob.completionOrder([1, 0]);
   * ```
   */
  completionOrder(indices: readonly number[]): this {
    if (this.rules.completionOrder !== undefined) duplicate("completionOrder");
    if (
      !Array.isArray(indices) ||
      !indices.every((index) => Number.isInteger(index) && index >= 0) ||
      new Set(indices).size !== indices.length
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.job.completionOrder",
        "Completion order must contain unique nonnegative integer indices.",
      );
    }
    this.rules.completionOrder = Object.freeze([...indices]);
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

type Empty = Readonly<Record<never, never>>;
type RunnerValues = ScopeValues<Empty, Empty, Empty, never, never>["runner"];

type StepGitHubValues = Pick<
  GitHubContext,
  | "action"
  | "action_path"
  | "action_ref"
  | "action_repository"
  | "action_status"
  | "artifacts"
  | "artifacts_list"
  | "env"
  | "event_path"
  | "job"
  | "path"
  | "token"
  | "workspace"
>;

/** Explicit runner-owned job identity. All properties are optional until read by
 * an expression. Computed status and container/services belong to the interpreter
 * and {@link InstanceScenario.containerRuntime}, respectively.
 */
export type JobRuntime = Readonly<
  Partial<
    Pick<
      ScopeValues<Empty, Empty, Empty, never, never>["job"],
      | "check_run_id"
      | "workflow_ref"
      | "workflow_sha"
      | "workflow_repository"
      | "workflow_file_path"
    >
  >
>;

/** Partial assigned-runner context. These are test values, not deductions from
 * runsOn labels. Referenced missing fields fail at their expression site.
 */
export interface RunnerRuntime extends Partial<RunnerValues> {
  /** Explicit assigned runner environment. Omission does not infer a value from
   * runsOn labels; reading it requires a fixture.
   */
  readonly environment?: RunnerValues["environment"];
}

/** Step-local github context values supplied by the runner. Event and caller
 * identity cannot be overridden here. Overrides apply only while this step's
 * expressions are evaluated; later steps and job outputs use the workflow fixture.
 */
export interface StepGitHub extends Partial<StepGitHubValues> {
  /** Current step's artifact declaration file path. This fixture supplies only
   * a path; scenario neither accesses the file nor declares artifacts.
   */
  readonly artifacts?: GitHubContext["artifacts"];
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

/** Builder for external contexts and fixtures. The callback passed to {@link scenario} receives this builder; constructing one alone does not interpret a workflow.
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
  /** Enable token authority interpretation from root environment assumptions. Workflow/job declarations replace defaults; unspecified map scopes become none, then restrictWrites applies. Defaults are not a ceiling. Local callees inherit the caller ceiling and may reduce it; excess demands and nested initial fixtures fail. External calls expose only the incoming authority. Without this method permissions are not interpreted. No token/API authorization is performed.
   * @example Given a workflow scenario builder `test`.
   * ```ts
   * test.tokenPermissions({ defaults: { contents: "read" }, restrictWrites: false });
   * ```
   */
  tokenPermissions(value: TokenPermissionFixture): this {
    if (this.program.tokenPermissions !== undefined) {
      duplicate("tokenPermissions");
    }
    if (
      !value || typeof value.restrictWrites !== "boolean" ||
      value.defaults === undefined
    ) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.permissions",
        "Supply defaults and an explicit restrictWrites boolean.",
      );
    }
    this.program.tokenPermissions = Object.freeze({
      ...value,
      defaults: typeof value.defaults === "string"
        ? value.defaults
        : Object.freeze({ ...value.defaults }),
    });
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

/** Interpret a completed workflow with explicit fixtures and return typed observations for ordinary test assertions. The definition callback runs first; fixture callbacks run when their steps are reached. Returns results or rejects with {@link ScenarioError}. Supply config for local reusable calls. See this module for supported logic and verification limits.
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { scenario, workflow } from "@atty303/tsugiori/github-actions";
 * const ci = workflow("ci.yml", { on: { push: {} } }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({ id: "build", name: "Build", run: "true" }));
 * const result = await scenario(ci, (test) => {
 *   test.github({ event_name: "push" });
 *   test.job("build", (job) => job.step("build").fixture({}));
 * });
 * assertEquals(result.jobs.build!.instances[0].steps.build!.outcome, "success");
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
): Promise<ScenarioResult<TestJobsOf<Workflow>>> {
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
  }) as ScenarioResult<TestJobsOf<Workflow>>;
}
