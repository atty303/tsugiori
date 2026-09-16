import type { TaskFunction } from "../task/mod.ts";

export type PipelineEvent = "pull_request" | "push";
export type PermissionLevel = "none" | "read" | "write";
export type WorkflowPermissions = Readonly<{ contents?: PermissionLevel }>;
export type ActionInput = string | number | boolean;
export type ActionInputs = Readonly<Record<string, ActionInput>>;
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type AuthoringUsesStep = Readonly<{
  type: "uses";
  id?: string;
  name: string;
  uses: string;
  with?: ActionInputs;
}>;
export type AuthoringRunStep = Readonly<{
  type: "run";
  id?: string;
  name: string;
  run: string;
}>;
export type AuthoringTaskStep = Readonly<{
  type: "task";
  id?: string;
  name: string;
  task: TaskFunction;
}>;
export type AuthoringStep =
  | AuthoringUsesStep
  | AuthoringRunStep
  | AuthoringTaskStep;
export type AuthoringJob = Readonly<{
  id: string;
  runsOn: string;
  needs: readonly string[];
  steps: readonly AuthoringStep[];
}>;
export type AuthoringPipeline = Readonly<{
  id: string;
  name: string;
  output: string;
  events: readonly PipelineEvent[];
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
}>;
export type TsugioriConfig = Readonly<{
  kind: "tsugiori.config";
  pipelines: readonly AuthoringPipeline[];
}>;

export type PipelineOptions<
  Events extends NonEmptyReadonlyArray<PipelineEvent> = NonEmptyReadonlyArray<
    PipelineEvent
  >,
> = Readonly<{
  name?: string;
  output: string;
  events: Events;
  permissions?: WorkflowPermissions;
}>;

const actionOutputs = Symbol("tsugiori.action-outputs");

export type ActionInvocation<
  Outputs extends readonly string[] = readonly string[],
> = Readonly<{
  uses: string;
  with?: ActionInputs;
  [actionOutputs]: Outputs;
}>;

const actionInputDefinition = Symbol("tsugiori.action-input-definition");

export type ActionInputDefinition<
  Value extends ActionInput,
  Required extends boolean = false,
> = Readonly<{
  type: "string" | "number" | "boolean";
  required: Required;
  [actionInputDefinition]: Value;
}>;

type ActionInputDefinitions = Readonly<
  Record<string, ActionInputDefinition<ActionInput, boolean>>
>;
type LiteralActionOutputs<Outputs extends readonly string[]> = string extends
  Outputs[number] ? never : Outputs;
type ActionInputValue<Definition> = Definition extends ActionInputDefinition<
  infer Value,
  boolean
> ? Value
  : never;
type RequiredActionInputKeys<Definitions extends ActionInputDefinitions> = {
  [Key in keyof Definitions]-?: Definitions[Key] extends
    ActionInputDefinition<ActionInput, true> ? Key
    : never;
}[keyof Definitions];
type OptionalActionInputKeys<Definitions extends ActionInputDefinitions> =
  Exclude<keyof Definitions, RequiredActionInputKeys<Definitions>>;

export type ActionArguments<Definitions extends ActionInputDefinitions> =
  Readonly<
    & {
      [Key in RequiredActionInputKeys<Definitions>]: ActionInputValue<
        Definitions[Key]
      >;
    }
    & {
      [Key in OptionalActionInputKeys<Definitions>]?: ActionInputValue<
        Definitions[Key]
      >;
    }
  >;

function inputDefinition<Value extends ActionInput>(
  type: Type,
  options?: Readonly<{ required?: boolean }>,
): ActionInputDefinition<Value, boolean> {
  return Object.freeze({
    type,
    required: options?.required ?? false,
    [actionInputDefinition]: undefined as unknown as Value,
  });
}

type Type = "string" | "number" | "boolean";
type ActionInputFactory<Value extends ActionInput> = {
  (): ActionInputDefinition<Value, false>;
  (options: Readonly<{ required?: false }>): ActionInputDefinition<
    Value,
    false
  >;
  (options: Readonly<{ required: true }>): ActionInputDefinition<Value, true>;
};

const stringInput =
  ((options?: Readonly<{ required?: boolean }>) =>
    inputDefinition<string>("string", options)) as ActionInputFactory<string>;
const numberInput =
  ((options?: Readonly<{ required?: boolean }>) =>
    inputDefinition<number>("number", options)) as ActionInputFactory<number>;
const booleanInput =
  ((options?: Readonly<{ required?: boolean }>) =>
    inputDefinition<boolean>("boolean", options)) as ActionInputFactory<
      boolean
    >;

export const actionInput = Object.freeze({
  string: stringInput,
  number: numberInput,
  boolean: booleanInput,
});

export function defineAction<
  const Definitions extends ActionInputDefinitions,
  const Outputs extends readonly string[],
>(
  definition: Readonly<{
    uses: string;
    inputs: Definitions;
    outputs: LiteralActionOutputs<Outputs>;
  }>,
): (
  inputs: ActionArguments<Definitions>,
) => ActionInvocation<Outputs> {
  assertPlainRecord(definition.inputs, "Action input definitions");
  validateActionOutputs(definition.outputs);
  const definitions = Object.freeze({ ...definition.inputs });
  const outputs = Object.freeze([...definition.outputs]) as unknown as Outputs;
  return (inputs) => {
    assertPlainRecord(inputs, "Action inputs");
    for (const [key, value] of Object.entries(inputs)) {
      const input = definitions[key];
      if (input === undefined) {
        throw new TypeError(
          `Action input ${JSON.stringify(key)} is not declared.`,
        );
      }
      if (!matchesActionInputType(value, input.type)) {
        throw new TypeError(
          `Action input ${JSON.stringify(key)} must be a ${input.type}.`,
        );
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new TypeError(
          `Action input ${JSON.stringify(key)} must be finite.`,
        );
      }
    }
    for (const [key, input] of Object.entries(definitions)) {
      if (input.required && !(key in inputs)) {
        throw new TypeError(
          `Required action input ${JSON.stringify(key)} is missing.`,
        );
      }
    }
    return freezeActionInvocation(definition.uses, inputs, outputs);
  };
}

export function rawAction(
  uses: string,
  withInputs?: ActionInputs,
): ActionInvocation<readonly []> {
  if (withInputs !== undefined) validateActionInputs(withInputs);
  return freezeActionInvocation(
    uses,
    withInputs,
    Object.freeze([]) as readonly [],
  );
}

export type UsesStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly string[],
> = Readonly<{ id?: Id; name: string; uses: ActionInvocation<Outputs> }>;
export type RunStepDefinition<Id extends string | undefined = undefined> =
  Readonly<{ id?: Id; name: string; run: string }>;
export type TaskStepDefinition<Id extends string | undefined = undefined> =
  Readonly<{ id?: Id; name: string; task: TaskFunction }>;

export type JobReference<
  PipelineId extends string = string,
  JobId extends string = string,
> = Readonly<{ id: JobId; pipelineId: PipelineId }>;

type JobReferences = Readonly<Record<string, JobReference>>;
export type ActionOutputReference<
  StepId extends string = string,
  OutputName extends string = string,
> = `\${{ steps.${StepId}.outputs.${OutputName} }}`;
export type StepReference<
  Id extends string = string,
  Outputs extends readonly string[] = readonly string[],
> = Readonly<{
  id: Id;
  outputs: Readonly<
    {
      [OutputName in Outputs[number]]: ActionOutputReference<Id, OutputName>;
    }
  >;
}>;
type StepReferences = Readonly<Record<string, StepReference>>;
const jobDefinition = Symbol("tsugiori.job-definition");
const pipelineDefinition = Symbol("tsugiori.pipeline-definition");

type FinalizedJobDefinition<
  PipelineId extends string,
  JobId extends string,
> = Readonly<{
  pipelineId: PipelineId;
  jobId: JobId;
  owner: symbol;
  job: AuthoringJob;
}>;

export interface FinalizedJobState<
  PipelineId extends string = string,
  JobId extends string = string,
> {
  readonly [jobDefinition]: FinalizedJobDefinition<PipelineId, JobId>;
}

type DefinitionStepId<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? Id
  : never;
type AvailableStepDefinition<Definition, Steps extends StepReferences> =
  [DefinitionStepId<Definition>] extends [never] ? Definition
    : DefinitionStepId<Definition> extends keyof Steps ? never
    : Definition;
type DefinitionStepReference<Definition> = Definition extends
  UsesStepDefinition<infer Id extends string, infer Outputs>
  ? StepReference<Id, Outputs>
  : Definition extends Readonly<{ id: infer Id extends string }>
    ? StepReference<Id, readonly []>
  : never;
type AddStepReference<Definition, Steps extends StepReferences> =
  [DefinitionStepId<Definition>] extends [never] ? Steps
    : Readonly<
      & Steps
      & Record<
        DefinitionStepId<Definition>,
        DefinitionStepReference<Definition>
      >
    >;

export interface ExecutionJobState<
  PipelineId extends string,
  JobId extends string,
> {
  uses<const Definition extends UsesStepDefinition<string | undefined>>(
    definition: Definition,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Record<never, never>>
  >;
  run<const Definition extends RunStepDefinition<string | undefined>>(
    definition: Definition,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Record<never, never>>
  >;
  task<const Definition extends TaskStepDefinition<string | undefined>>(
    definition: Definition,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Record<never, never>>
  >;
}

export interface NonEmptyStepState<
  PipelineId extends string,
  JobId extends string,
  Steps extends StepReferences,
> extends FinalizedJobState<PipelineId, JobId> {
  readonly steps: Steps;
  uses<const Definition extends UsesStepDefinition<string | undefined>>(
    definition: AvailableStepDefinition<Definition, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Steps>
  >;
  run<const Definition extends RunStepDefinition<string | undefined>>(
    definition: AvailableStepDefinition<Definition, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Steps>
  >;
  task<const Definition extends TaskStepDefinition<string | undefined>>(
    definition: AvailableStepDefinition<Definition, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<Definition, Steps>
  >;
}

export interface IndependentJobState<
  PipelineId extends string,
  JobId extends string,
> {
  runsOn(runner: string): ExecutionJobState<PipelineId, JobId>;
}
export interface DependentJobState<
  PipelineId extends string,
  JobId extends string,
> extends IndependentJobState<PipelineId, JobId> {}
export interface JobStartState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
> extends IndependentJobState<PipelineId, JobId> {
  needs<
    const Dependencies extends readonly [
      Jobs[keyof Jobs],
      ...Jobs[keyof Jobs][],
    ],
  >(...dependencies: Dependencies): DependentJobState<PipelineId, JobId>;
}
export type AvailableJobState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
> = keyof Jobs extends never ? IndependentJobState<PipelineId, JobId>
  : JobStartState<PipelineId, JobId, Jobs>;
export type JobDefinitionScope<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
> = Readonly<{
  job: AvailableJobState<PipelineId, JobId, Jobs>;
  jobs: Jobs;
}>;

type AddJobReference<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
> = Readonly<Jobs & Record<JobId, JobReference<PipelineId, JobId>>>;
type AvailableJobId<JobId extends string, Jobs extends JobReferences> =
  JobId extends keyof Jobs ? never : JobId;

export interface EmptyPipelineState<PipelineId extends string> {
  job<const JobId extends string>(
    id: JobId,
    define: (
      scope: JobDefinitionScope<PipelineId, JobId, Record<never, never>>,
    ) => FinalizedJobState<PipelineId, NoInfer<JobId>>,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Record<never, never>>
  >;
}
export interface NonEmptyPipelineState<
  PipelineId extends string,
  Jobs extends JobReferences,
> {
  readonly [pipelineDefinition]: AuthoringPipeline;
  job<const JobId extends string>(
    id: AvailableJobId<JobId, Jobs>,
    define: (
      scope: JobDefinitionScope<PipelineId, JobId, Jobs>,
    ) => FinalizedJobState<PipelineId, NoInfer<JobId>>,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Jobs>
  >;
}

type PipelineDraft = Readonly<{
  id: string;
  name: string;
  output: string;
  events: readonly PipelineEvent[];
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
  references: JobReferences;
  owner: symbol;
}>;
type JobDraft = Readonly<{
  pipelineId: string;
  id: string;
  owner: symbol;
  runsOn?: string;
  needs: readonly string[];
  steps: readonly AuthoringStep[];
  references: StepReferences;
}>;

export function pipeline<
  const PipelineId extends string,
  const Events extends NonEmptyReadonlyArray<PipelineEvent>,
>(
  id: PipelineId,
  options: PipelineOptions<Events>,
): EmptyPipelineState<PipelineId> {
  const draft: PipelineDraft = Object.freeze({
    id,
    name: options.name ?? id,
    output: options.output,
    events: Object.freeze([...options.events]),
    ...(options.permissions === undefined
      ? {}
      : { permissions: copyPermissions(options.permissions) }),
    jobs: Object.freeze([]),
    references: Object.freeze({}),
    owner: Symbol(`tsugiori.pipeline.${id}`),
  });
  return createPipelineFacade(draft, false) as EmptyPipelineState<PipelineId>;
}

export function defineTsugiori<
  const Pipelines extends NonEmptyReadonlyArray<
    NonEmptyPipelineState<string, JobReferences>
  >,
>(input: Readonly<{ pipelines: Pipelines }>): TsugioriConfig {
  return Object.freeze({
    kind: "tsugiori.config",
    pipelines: Object.freeze(
      input.pipelines.map((value) => value[pipelineDefinition]),
    ),
  });
}

function createPipelineFacade(
  draft: PipelineDraft,
  finalized: boolean,
): EmptyPipelineState<string> | NonEmptyPipelineState<string, JobReferences> {
  const facade = {
    job(
      id: string,
      define: (
        scope: JobDefinitionScope<string, string, JobReferences>,
      ) => FinalizedJobState<string, string>,
    ) {
      if (id in draft.references) {
        throw new TypeError(`Job ID ${JSON.stringify(id)} is duplicated.`);
      }
      const state = createJobStartFacade(
        Object.freeze({
          pipelineId: draft.id,
          id,
          owner: draft.owner,
          needs: Object.freeze([]),
          steps: Object.freeze([]),
          references: Object.freeze({}),
        }),
        Object.keys(draft.references).length > 0,
      );
      const result = define(Object.freeze({
        job: state,
        jobs: draft.references,
      }) as JobDefinitionScope<string, string, JobReferences>);
      if (!isRecord(result) || !(jobDefinition in result)) {
        throw new TypeError(
          `Job ${JSON.stringify(id)} did not return a completed definition.`,
        );
      }
      const completed = result[jobDefinition];
      if (
        completed.owner !== draft.owner || completed.pipelineId !== draft.id ||
        completed.jobId !== id
      ) {
        throw new TypeError(
          `Job ${JSON.stringify(id)} returned a definition for another job.`,
        );
      }
      return createPipelineFacade(
        Object.freeze({
          ...draft,
          jobs: Object.freeze([...draft.jobs, completed.job]),
          references: Object.freeze({
            ...draft.references,
            [id]: Object.freeze({ id, pipelineId: draft.id }),
          }),
        }),
        true,
      );
    },
    ...(finalized ? { [pipelineDefinition]: materializePipeline(draft) } : {}),
  };
  return Object.freeze(facade) as
    | EmptyPipelineState<string>
    | NonEmptyPipelineState<string, JobReferences>;
}

function createJobStartFacade(
  draft: JobDraft,
  dependenciesAvailable: boolean,
):
  | IndependentJobState<string, string>
  | JobStartState<
    string,
    string,
    JobReferences
  > {
  const runsOn = (runner: string) =>
    createExecutionJobFacade(Object.freeze({ ...draft, runsOn: runner }));
  const facade = {
    runsOn,
    ...(dependenciesAvailable
      ? {
        needs: (...dependencies: readonly JobReference[]) =>
          Object.freeze({
            runsOn: (runner: string) =>
              createExecutionJobFacade(Object.freeze({
                ...draft,
                needs: Object.freeze(
                  dependencies.map((dependency) => dependency.id),
                ),
                runsOn: runner,
              })),
          }),
      }
      : {}),
  };
  return Object.freeze(facade) as
    | IndependentJobState<string, string>
    | JobStartState<string, string, JobReferences>;
}

function createExecutionJobFacade(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): ExecutionJobState<string, string> {
  return Object.freeze({
    uses: (definition: UsesStepDefinition<string | undefined>) =>
      appendStep(draft, usesStep(definition), definition.uses[actionOutputs]),
    run: (definition: RunStepDefinition<string | undefined>) =>
      appendStep(draft, runStep(definition)),
    task: (definition: TaskStepDefinition<string | undefined>) =>
      appendStep(draft, taskStep(definition)),
  }) as ExecutionJobState<string, string>;
}

function createStepFacade(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): NonEmptyStepState<string, string, StepReferences> {
  return Object.freeze({
    [jobDefinition]: Object.freeze({
      pipelineId: draft.pipelineId,
      jobId: draft.id,
      owner: draft.owner,
      job: materializeJob(draft),
    }),
    steps: draft.references,
    uses: (definition: UsesStepDefinition<string | undefined>) =>
      appendStep(draft, usesStep(definition), definition.uses[actionOutputs]),
    run: (definition: RunStepDefinition<string | undefined>) =>
      appendStep(draft, runStep(definition)),
    task: (definition: TaskStepDefinition<string | undefined>) =>
      appendStep(draft, taskStep(definition)),
  }) as NonEmptyStepState<string, string, StepReferences>;
}

function appendStep(
  draft: JobDraft & Readonly<{ runsOn: string }>,
  step: AuthoringStep,
  outputNames: readonly string[] = Object.freeze([]),
): NonEmptyStepState<string, string, StepReferences> {
  if (
    step.id !== undefined &&
    draft.steps.some((candidate) => candidate.id === step.id)
  ) {
    throw new TypeError(`Step ID ${JSON.stringify(step.id)} is duplicated.`);
  }
  return createStepFacade(Object.freeze({
    ...draft,
    steps: Object.freeze([...draft.steps, step]),
    references: step.id === undefined ? draft.references : Object.freeze({
      ...draft.references,
      [step.id]: stepReference(step.id, outputNames),
    }),
  }));
}

function usesStep(
  definition: UsesStepDefinition<string | undefined>,
): AuthoringUsesStep {
  return Object.freeze({
    type: "uses",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    uses: definition.uses.uses,
    ...(definition.uses.with === undefined
      ? {}
      : { with: copyActionInputs(definition.uses.with) }),
  });
}
function runStep(
  definition: RunStepDefinition<string | undefined>,
): AuthoringRunStep {
  return Object.freeze({
    type: "run",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    run: definition.run,
  });
}
function taskStep(
  definition: TaskStepDefinition<string | undefined>,
): AuthoringTaskStep {
  return Object.freeze({
    type: "task",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    task: definition.task,
  });
}
function materializeJob(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): AuthoringJob {
  return Object.freeze({
    id: draft.id,
    runsOn: draft.runsOn,
    needs: draft.needs,
    steps: draft.steps,
  });
}
function materializePipeline(draft: PipelineDraft): AuthoringPipeline {
  return Object.freeze({
    id: draft.id,
    name: draft.name,
    output: draft.output,
    events: draft.events,
    ...(draft.permissions === undefined
      ? {}
      : { permissions: draft.permissions }),
    jobs: draft.jobs,
  });
}
function freezeActionInvocation<const Outputs extends readonly string[]>(
  uses: string,
  withInputs: ActionInputs | undefined,
  outputs: Outputs,
): ActionInvocation<Outputs> {
  const withValues =
    withInputs === undefined || Object.keys(withInputs).length === 0
      ? undefined
      : copyActionInputs(withInputs);
  return Object.freeze({
    uses,
    ...(withValues === undefined ? {} : { with: withValues }),
    [actionOutputs]: outputs,
  });
}
function stepReference(
  id: string,
  outputNames: readonly string[],
): StepReference {
  return Object.freeze({
    id,
    outputs: Object.freeze(Object.fromEntries(outputNames.map((name) => [
      name,
      `\${{ steps.${id}.outputs.${name} }}`,
    ]))),
  }) as StepReference;
}
function copyPermissions(
  permissions: WorkflowPermissions,
): WorkflowPermissions {
  assertPlainRecord(permissions, "Workflow permissions");
  for (const [key, value] of Object.entries(permissions)) {
    if (key !== "contents") {
      throw new TypeError(
        `Workflow permission ${JSON.stringify(key)} is not supported.`,
      );
    }
    if (value !== "none" && value !== "read" && value !== "write") {
      throw new TypeError("Workflow permission must be none, read, or write.");
    }
  }
  return Object.freeze({ ...permissions });
}
function validateActionInputs(inputs: ActionInputs): void {
  assertPlainRecord(inputs, "Action inputs");
  for (const value of Object.values(inputs)) {
    if (
      typeof value !== "string" && typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      throw new TypeError(
        "Action input must be a string, boolean, or finite number.",
      );
    }
  }
}
function validateActionOutputs(outputs: readonly string[]): void {
  if (!Array.isArray(outputs)) {
    throw new TypeError("Action outputs must be an array.");
  }
  const seen = new Set<string>();
  for (const output of outputs) {
    if (
      typeof output !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(output)
    ) {
      throw new TypeError(
        "Action output names must start with a letter or underscore and contain only letters, digits, hyphens, or underscores.",
      );
    }
    if (seen.has(output)) {
      throw new TypeError(
        `Action output ${JSON.stringify(output)} is duplicated.`,
      );
    }
    seen.add(output);
  }
}
function matchesActionInputType(
  value: unknown,
  type: "string" | "number" | "boolean",
): value is ActionInput {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
  }
}
function copyActionInputs(inputs: ActionInputs): ActionInputs {
  validateActionInputs(inputs);
  return Object.freeze({ ...inputs });
}
function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}
function assertPlainRecord(value: unknown, label: string): void {
  if (
    !isRecord(value) || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be an object.`);
  }
}
