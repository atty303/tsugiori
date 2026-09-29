import type { DefinedTask, TaskFunction } from "../task/mod.ts";
export { defineTask } from "../task/mod.ts";
import {
  emitExpression,
  Expression,
  type ExpressionInput,
  type RawExpression,
  type Scope,
  scope,
} from "./expression.ts";
export {
  always,
  cancelled,
  case,
  caseOf,
  contains,
  endsWith,
  failure,
  format,
  fromJSON,
  hashFiles,
  join,
  literal,
  rawNode,
  startsWith,
  success,
  toJSON,
} from "./expression.ts";
export type { Expression, RawExpression, Scope } from "./expression.ts";

export type PipelineEvent = "pull_request" | "push" | "workflow_dispatch";
export type WorkflowDispatchInput = Readonly<{
  description?: string;
  required?: boolean;
  type: "string";
  default?: string;
}>;
export type PermissionLevel = "none" | "read" | "write";
export type OidcPermissionLevel = "none" | "write";
export type WorkflowPermissions = Readonly<{
  contents?: PermissionLevel;
  "id-token"?: OidcPermissionLevel;
}>;
export type ActionInput =
  | string
  | number
  | boolean
  | Expression<string | number | boolean>;
export type ActionInputs = Readonly<Record<string, ActionInput>>;
export type EnvironmentVariables = Readonly<Record<string, string>>;
export type Concurrency = Readonly<{
  group: string;
  cancelInProgress: boolean;
  queue?: "max";
}>;
type JobOptions = Readonly<{
  if?: string;
  permissions?: WorkflowPermissions;
  timeoutMinutes?: number;
  environment?: string;
  outputs?: Readonly<Record<string, string>>;
  strategy?: Readonly<{
    failFast?: boolean;
    matrix: string | Readonly<Record<string, string | readonly string[]>>;
  }>;
  concurrency?: Concurrency;
}>;

/** Emits an explicit GitHub Actions runtime expression. No interpolation is evaluated by Tsugiori. */
export function rawExpression(expression: string): RawExpression {
  if (expression.trim().length === 0) {
    throw new TypeError("GitHub Actions expression must not be empty.");
  }
  return `\${{ ${expression} }}` as RawExpression;
}
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type AuthoringUsesStep = Readonly<{
  type: "uses";
  id?: string;
  name: string;
  uses: string;
  with?: Readonly<Record<string, string | number | boolean>>;
  if?: string;
  continueOnError?: boolean;
  env?: EnvironmentVariables;
}>;
export type AuthoringRunStep = Readonly<{
  type: "run";
  id?: string;
  name: string;
  run: string;
  if?: string;
  continueOnError?: boolean;
  env?: EnvironmentVariables;
  workingDirectory?: string;
}>;
export type AuthoringTaskStep = Readonly<{
  type: "task";
  id?: string;
  name: string;
  task: TaskFunction<string>;
  if?: string;
  continueOnError?: boolean;
  env?: EnvironmentVariables;
}>;
export type AuthoringStep =
  | AuthoringUsesStep
  | AuthoringRunStep
  | AuthoringTaskStep;
export type AuthoringJob =
  & Readonly<{
    id: string;
    runsOn: string;
    needs: readonly string[];
    steps: readonly AuthoringStep[];
  }>
  & JobOptions;
export type AuthoringPipeline = Readonly<{
  id: string;
  name: string;
  output: string;
  events: readonly PipelineEvent[];
  pushBranches?: readonly string[];
  workflowDispatchInputs?: Readonly<Record<string, WorkflowDispatchInput>>;
  concurrency?: Concurrency;
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
}>;
export type TsugioriConfig = Readonly<{
  kind: "tsugiori.config";
  cacheVersion: number;
  pipelines: readonly AuthoringPipeline[];
}>;

export type PipelineOptions<
  Events extends NonEmptyReadonlyArray<PipelineEvent> = NonEmptyReadonlyArray<
    PipelineEvent
  >,
  Vars extends readonly string[] | undefined = undefined,
  Secrets extends readonly string[] | undefined = undefined,
> = Readonly<{
  name?: string;
  output: string;
  events: Events;
  vars?: Vars;
  secrets?: Secrets;
  pushBranches?: readonly string[];
  workflowDispatchInputs?: Readonly<Record<string, WorkflowDispatchInput>>;
  concurrency?: Concurrency;
  permissions?: WorkflowPermissions;
}>;

type LiteralNames<Values extends readonly string[] | undefined> = Values extends
  readonly string[] ? string extends Values[number] ? never
  : Values
  : Values;

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
> ? Value | Expression<Value>
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

export type JobReference<
  PipelineId extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
> = Readonly<{ id: JobId; pipelineId: PipelineId; outputNames: Outputs }>;
type JobReferences = Readonly<
  Record<string, JobReference<string, string, readonly string[]>>
>;
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
    { [OutputName in Outputs[number]]: ActionOutputReference<Id, OutputName> }
  >;
  outputNames: Outputs;
}>;
type StepReferences = Readonly<Record<string, StepReference>>;
type OutputMap<
  References extends Readonly<
    Record<string, { outputNames: readonly string[] }>
  >,
> = { readonly [K in keyof References]: References[K]["outputNames"] };
type NeedsMap<
  Dependencies extends readonly JobReference<
    string,
    string,
    readonly string[]
  >[],
> = { readonly [D in Dependencies[number] as D["id"]]: D["outputNames"] };
type Names<Values extends readonly string[] | undefined> = Values extends
  readonly string[] ? Values[number] : string;
type Field<
  S extends import("./expression_scope.ts").GitHubExpressionScopeKey,
  Needs extends Record<string, readonly string[]>,
  Steps extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
> =
  | ExpressionInput
  | ((
    context: Scope<S, Needs, Steps, Matrix, Vars, Secrets>,
  ) => ExpressionInput);
type StepField<
  S extends import("./expression_scope.ts").GitHubExpressionScopeKey,
  Needs extends Record<string, readonly string[]>,
  Steps extends StepReferences,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
> = Field<S, Needs, OutputMap<Steps>, Matrix, Vars, Secrets>;
type StepEnv<
  Needs extends Record<string, readonly string[]>,
  Steps extends StepReferences,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
> = Readonly<
  Record<
    string,
    | string
    | Expression<string>
    | ((
      context: Scope<
        "jobs.<job_id>.steps.env",
        Needs,
        OutputMap<Steps>,
        Matrix,
        Vars,
        Secrets
      >,
    ) => Expression<unknown>)
  >
>;
type StepCommon<
  Needs extends Record<string, readonly string[]>,
  Steps extends StepReferences,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
> = Readonly<{
  id?: string;
  name: string;
  if?: StepField<"jobs.<job_id>.steps.if", Needs, Steps, Matrix, Vars, Secrets>;
  continueOnError?: boolean;
  env?: StepEnv<Needs, Steps, Matrix, Vars, Secrets>;
}>;
export type UsesStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly string[],
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
> =
  & StepCommon<Needs, Steps, Matrix, Vars, Secrets>
  & Readonly<
    {
      id?: Id;
      uses:
        | ActionInvocation<Outputs>
        | ((
          context: Scope<
            "jobs.<job_id>.steps.with",
            Needs,
            OutputMap<Steps>,
            Matrix,
            Vars,
            Secrets
          >,
        ) => ActionInvocation<Outputs>);
    }
  >;
export type RunStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly [],
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
> =
  & StepCommon<Needs, Steps, Matrix, Vars, Secrets>
  & Readonly<
    { id?: Id; run: string; outputs?: Outputs; workingDirectory?: string }
  >;
export type TaskStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends string = never,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
> =
  & StepCommon<Needs, Steps, Matrix, Vars, Secrets>
  & Readonly<{ id?: Id; task: TaskFunction<Outputs> }>;
const jobDefinition = Symbol("tsugiori.job-definition");
const pipelineDefinition = Symbol("tsugiori.pipeline-definition");
type FinalizedJobDefinition<
  PipelineId extends string,
  JobId extends string,
  Outputs extends readonly string[],
> = Readonly<{
  pipelineId: PipelineId;
  jobId: JobId;
  owner: symbol;
  job: AuthoringJob;
  outputNames: Outputs;
}>;
export interface FinalizedJobState<
  PipelineId extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
> {
  readonly [jobDefinition]: FinalizedJobDefinition<PipelineId, JobId, Outputs>;
}
type DefinitionStepId<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? Id : never;
type AvailableStepDefinition<Definition, Steps extends StepReferences> =
  [DefinitionStepId<Definition>] extends [never] ? Definition
    : DefinitionStepId<Definition> extends keyof Steps ? never
    : Definition;
type Invocation<Definition> = Definition extends Readonly<{ uses: infer Value }>
  ? Value extends ActionInvocation<infer O> ? O
  : Value extends (...args: never[]) => ActionInvocation<infer O> ? O
  : readonly []
  : readonly [];
type TaskOutputs<Definition> = Definition extends
  Readonly<{ task: DefinedTask<infer O> }> ? readonly O[] : readonly [];
type DefinitionStepReference<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? StepReference<
    Id,
    Definition extends Readonly<{ uses: unknown }> ? Invocation<Definition>
      : Definition extends
        Readonly<{ outputs: infer O extends readonly string[] }> ? O
      : TaskOutputs<Definition>
  >
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
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
> {
  when(
    condition: Field<
      "jobs.<job_id>.if",
      Needs,
      Record<never, never>,
      Record<never, never>,
      Vars,
      Secrets
    >,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets>;
  strategy<const Shape extends object>(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets
      >,
    ) => Readonly<{ matrix: Expression<Shape>; failFast?: boolean }>,
  ): ExecutionJobState<PipelineId, JobId, Needs, Shape, Vars, Secrets>;
  strategy(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets
      >,
    ) => Readonly<{ matrix: RawExpression; failFast?: boolean }>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets
  >;
  strategy<
    const Axes extends Readonly<
      Record<
        string,
        readonly string[] | Expression<readonly string[]> | RawExpression
      >
    >,
  >(
    definition:
      | Readonly<{ matrix: Axes; failFast?: boolean }>
      | ((
        context: Scope<
          "jobs.<job_id>.strategy",
          Needs,
          Record<never, never>,
          Record<never, never>,
          Vars,
          Secrets
        >,
      ) => Readonly<{ matrix: Axes; failFast?: boolean }>),
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    {
      readonly [K in keyof Axes]: Axes[K] extends readonly (infer V)[] ? V
        : string;
    },
    Vars,
    Secrets
  >;
  concurrency(
    definition: Readonly<
      {
        group: Field<
          "jobs.<job_id>.concurrency",
          Needs,
          Record<never, never>,
          Matrix,
          Vars,
          Secrets
        >;
        cancelInProgress: boolean;
        queue?: "max";
      }
    >,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets>;
  permissions(
    value: WorkflowPermissions,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets>;
  timeoutMinutes(
    value: number,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets>;
  environment(
    value: string,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets>;
  uses<
    const D extends UsesStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: D,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets
  >;
  run<
    const D extends RunStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: D,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets
  >;
  task<
    const D extends TaskStepDefinition<
      string | undefined,
      never,
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: D,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets
  >;
  task<
    const O extends string,
    const D extends TaskStepDefinition<
      string | undefined,
      O,
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: D & Readonly<{ task: DefinedTask<O> }>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets
  >;
}
export interface NonEmptyStepState<
  PipelineId extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  Outputs extends readonly string[] = readonly [],
> extends FinalizedJobState<PipelineId, JobId, Outputs> {
  readonly steps: Steps;
  outputs<
    const Names extends Readonly<
      Record<
        string,
        Field<
          "jobs.<job_id>.outputs.<output_id>",
          Needs,
          OutputMap<Steps>,
          Matrix,
          Vars,
          Secrets
        >
      >
    >,
  >(
    define: (
      context: Scope<
        "jobs.<job_id>.outputs.<output_id>",
        Needs,
        OutputMap<Steps>,
        Matrix,
        Vars,
        Secrets
      >,
    ) => Names,
  ): FinalizedJobState<PipelineId, JobId, readonly (keyof Names & string)[]>;
  uses<
    const D extends UsesStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: AvailableStepDefinition<D, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    Outputs
  >;
  run<
    const D extends RunStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: AvailableStepDefinition<D, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    Outputs
  >;
  task<
    const D extends TaskStepDefinition<
      string | undefined,
      never,
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition: AvailableStepDefinition<D, Steps>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    Outputs
  >;
  task<
    const O extends string,
    const D extends TaskStepDefinition<
      string | undefined,
      O,
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets
    >,
  >(
    definition:
      & AvailableStepDefinition<D, Steps>
      & Readonly<{ task: DefinedTask<O> }>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddStepReference<D, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    Outputs
  >;
}
export interface IndependentJobState<
  PipelineId extends string,
  JobId extends string,
  Vars extends string = string,
  Secrets extends string = string,
> {
  runsOn(
    runner: string,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Record<never, never>,
    Record<never, never>,
    Vars,
    Secrets
  >;
}
export interface DependentJobState<
  PipelineId extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]>,
  Vars extends string,
  Secrets extends string,
> {
  runsOn(
    runner: string,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets
  >;
}
export interface JobStartState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
> extends IndependentJobState<PipelineId, JobId, Vars, Secrets> {
  needs<
    const Dependencies extends readonly [
      Jobs[keyof Jobs],
      ...Jobs[keyof Jobs][],
    ],
  >(
    ...dependencies: Dependencies
  ): DependentJobState<
    PipelineId,
    JobId,
    NeedsMap<Dependencies>,
    Vars,
    Secrets
  >;
}
export type AvailableJobState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
> = keyof Jobs extends never
  ? IndependentJobState<PipelineId, JobId, Vars, Secrets>
  : JobStartState<PipelineId, JobId, Jobs, Vars, Secrets>;
export type JobDefinitionScope<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
> = Readonly<
  { job: AvailableJobState<PipelineId, JobId, Jobs, Vars, Secrets>; jobs: Jobs }
>;
type AddJobReference<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Result extends FinalizedJobState<string, string, readonly string[]>,
> = Readonly<
  & Jobs
  & Record<
    JobId,
    JobReference<PipelineId, JobId, Result[typeof jobDefinition]["outputNames"]>
  >
>;
type AvailableJobId<JobId extends string, Jobs extends JobReferences> =
  JobId extends keyof Jobs ? never : JobId;
export interface EmptyPipelineState<
  PipelineId extends string,
  Vars extends string = string,
  Secrets extends string = string,
> {
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      PipelineId,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    id: JobId,
    define: (
      scope: JobDefinitionScope<
        PipelineId,
        JobId,
        Record<never, never>,
        Vars,
        Secrets
      >,
    ) => Result,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Record<never, never>, Result>,
    Vars,
    Secrets
  >;
}
export interface NonEmptyPipelineState<
  PipelineId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
> {
  readonly [pipelineDefinition]: AuthoringPipeline;
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      PipelineId,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    id: AvailableJobId<JobId, Jobs>,
    define: (
      scope: JobDefinitionScope<PipelineId, JobId, Jobs, Vars, Secrets>,
    ) => Result,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Jobs, Result>,
    Vars,
    Secrets
  >;
}

type PipelineDraft = Readonly<{
  id: string;
  name: string;
  output: string;
  events: readonly PipelineEvent[];
  pushBranches?: readonly string[];
  workflowDispatchInputs?: Readonly<Record<string, WorkflowDispatchInput>>;
  concurrency?: Concurrency;
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
  options?: JobOptions;
  needs: readonly string[];
  steps: readonly AuthoringStep[];
  references: StepReferences;
}>;

export function pipeline<
  const PipelineId extends string,
  const Events extends NonEmptyReadonlyArray<PipelineEvent>,
  const Vars extends readonly string[] | undefined = undefined,
  const Secrets extends readonly string[] | undefined = undefined,
>(
  id: PipelineId,
  options:
    & PipelineOptions<Events, Vars, Secrets>
    & Readonly<{
      vars?: LiteralNames<Vars>;
      secrets?: LiteralNames<Secrets>;
    }>,
): EmptyPipelineState<PipelineId, Names<Vars>, Names<Secrets>> {
  for (
    const [label, names] of [["vars", options.vars], [
      "secrets",
      options.secrets,
    ]] as const
  ) {
    if (names !== undefined) validateActionOutputs(names);
    void label;
  }
  const draft: PipelineDraft = Object.freeze({
    id,
    name: options.name ?? id,
    output: options.output,
    events: Object.freeze([...options.events]),
    ...(options.pushBranches === undefined ? {} : {
      pushBranches: Object.freeze([...options.pushBranches]),
    }),
    ...(options.workflowDispatchInputs === undefined ? {} : {
      workflowDispatchInputs: Object.freeze(Object.fromEntries(
        Object.entries(options.workflowDispatchInputs).map(([name, input]) => [
          name,
          Object.freeze({ ...input }),
        ]),
      )),
    }),
    ...(options.concurrency === undefined ? {} : {
      concurrency: Object.freeze({ ...options.concurrency }),
    }),
    ...(options.permissions === undefined
      ? {}
      : { permissions: copyPermissions(options.permissions) }),
    jobs: Object.freeze([]),
    references: Object.freeze({}),
    owner: Symbol(`tsugiori.pipeline.${id}`),
  });
  return createPipelineFacade(draft, false) as EmptyPipelineState<
    PipelineId,
    Names<Vars>,
    Names<Secrets>
  >;
}

export function defineTsugiori<
  const Pipelines extends NonEmptyReadonlyArray<
    Readonly<{ [pipelineDefinition]: AuthoringPipeline }>
  >,
>(
  input: Readonly<{ cacheVersion?: number; pipelines: Pipelines }>,
): TsugioriConfig {
  const cacheVersion = input.cacheVersion ?? 1;
  if (!Number.isSafeInteger(cacheVersion) || cacheVersion <= 0) {
    throw new TypeError("Cache version must be a positive safe integer.");
  }
  return Object.freeze({
    kind: "tsugiori.config",
    cacheVersion,
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
        scope: JobDefinitionScope<
          string,
          string,
          JobReferences,
          string,
          string
        >,
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
      }) as JobDefinitionScope<string, string, JobReferences, string, string>);
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
            [id]: Object.freeze({
              id,
              pipelineId: draft.id,
              outputNames: completed.outputNames,
            }),
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

function evaluateField(
  key: import("./expression_scope.ts").GitHubExpressionScopeKey,
  value: unknown,
): string {
  const result = typeof value === "function"
    ? (value as (context: unknown) => Expression<unknown>)(scope(key))
    : value;
  return emitExpression(result as ExpressionInput);
}
function evaluateEnv(
  value: Readonly<Record<string, unknown>> | undefined,
): EnvironmentVariables | undefined {
  if (value === undefined) return undefined;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map((
        [key, entry],
      ) => [
        key,
        typeof entry === "function"
          ? evaluateField("jobs.<job_id>.steps.env", entry)
          : entry instanceof Expression
          ? emitExpression(entry)
          : entry,
      ]),
    ),
  ) as EnvironmentVariables;
}
function createJobStartFacade(
  draft: JobDraft,
  dependenciesAvailable: boolean,
):
  | IndependentJobState<string, string>
  | JobStartState<string, string, JobReferences, string, string> {
  const runsOn = (runner: string) =>
    createExecutionJobFacade(Object.freeze({ ...draft, runsOn: runner }));
  return Object.freeze({
    runsOn,
    ...(dependenciesAvailable
      ? {
        needs: (...dependencies: readonly JobReference[]) =>
          Object.freeze({
            runsOn: (runner: string) =>
              createExecutionJobFacade(
                Object.freeze({
                  ...draft,
                  needs: Object.freeze(
                    dependencies.map((dependency) => dependency.id),
                  ),
                  runsOn: runner,
                }),
              ),
          }),
      }
      : {}),
  }) as
    | IndependentJobState<string, string>
    | JobStartState<string, string, JobReferences, string, string>;
}
function createExecutionJobFacade(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): ExecutionJobState<string, string> {
  return Object.freeze({
    when: (value: unknown) =>
      createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: {
            ...draft.options,
            if: evaluateField("jobs.<job_id>.if", value),
          },
        }),
      ),
    strategy: (value: unknown) => {
      const definition = typeof value === "function"
        ? (value as (
          context: unknown,
        ) => { matrix: Record<string, unknown>; failFast?: boolean })(
          scope("jobs.<job_id>.strategy"),
        )
        : value as { matrix: Record<string, unknown>; failFast?: boolean };
      const matrix = definition.matrix instanceof Expression
        ? emitExpression(definition.matrix)
        : typeof definition.matrix === "string"
        ? definition.matrix
        : Object.fromEntries(
          Object.entries(definition.matrix).map((
            [key, axis],
          ) => [key, axis instanceof Expression ? emitExpression(axis) : axis]),
        ) as Record<string, string | readonly string[]>;
      return createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: {
            ...draft.options,
            strategy: {
              matrix,
              ...(definition.failFast === undefined
                ? {}
                : { failFast: definition.failFast }),
            },
          },
        }),
      );
    },
    concurrency: (
      value: { group: unknown; cancelInProgress: boolean; queue?: "max" },
    ) =>
      createExecutionJobFacade(Object.freeze({
        ...draft,
        options: {
          ...draft.options,
          concurrency: {
            group: evaluateField("jobs.<job_id>.concurrency", value.group),
            cancelInProgress: value.cancelInProgress,
            ...(value.queue === undefined ? {} : { queue: value.queue }),
          },
        },
      })),
    permissions: (value: WorkflowPermissions) =>
      createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: { ...draft.options, permissions: copyPermissions(value) },
        }),
      ),
    timeoutMinutes: (value: number) =>
      createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: { ...draft.options, timeoutMinutes: value },
        }),
      ),
    environment: (value: string) =>
      createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: { ...draft.options, environment: value },
        }),
      ),
    uses: (definition: UsesStepDefinition<string | undefined>) => {
      const invocation = typeof definition.uses === "function"
        ? definition.uses(scope("jobs.<job_id>.steps.with"))
        : definition.uses;
      return appendStep(
        draft,
        usesStep({ ...definition, uses: invocation }),
        invocation[actionOutputs],
      );
    },
    run: (
      definition: RunStepDefinition<string | undefined, readonly string[]>,
    ) => {
      if (definition.outputs !== undefined) {
        validateActionOutputs(definition.outputs);
      }
      return appendStep(draft, runStep(definition), definition.outputs ?? []);
    },
    task: (definition: TaskStepDefinition<string | undefined>) =>
      appendStep(
        draft,
        taskStep(definition),
        definition.task.outputNames ?? [],
      ),
  }) as ExecutionJobState<string, string>;
}
function createStepFacade(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): NonEmptyStepState<string, string, StepReferences> {
  const base = createExecutionJobFacade(draft);
  return Object.freeze({
    [jobDefinition]: Object.freeze({
      pipelineId: draft.pipelineId,
      jobId: draft.id,
      owner: draft.owner,
      job: materializeJob(draft),
      outputNames: Object.freeze(Object.keys(draft.options?.outputs ?? {})),
    }),
    steps: draft.references,
    outputs: (define: (context: unknown) => Record<string, unknown>) => {
      const values = define(scope("jobs.<job_id>.outputs.<output_id>"));
      assertPlainRecord(values, "Job outputs");
      validateActionOutputs(Object.keys(values));
      const outputs = Object.freeze(
        Object.fromEntries(
          Object.entries(values).map((
            [name, value],
          ) => [
            name,
            evaluateField("jobs.<job_id>.outputs.<output_id>", value),
          ]),
        ),
      );
      return createStepFacade(
        Object.freeze({ ...draft, options: { ...draft.options, outputs } }),
      );
    },
    uses: base.uses,
    run: base.run,
    task: base.task,
  }) as unknown as NonEmptyStepState<string, string, StepReferences>;
}
function appendStep(
  draft: JobDraft & Readonly<{ runsOn: string }>,
  step: AuthoringStep,
  outputNames: readonly string[] = Object.freeze([]),
): NonEmptyStepState<string, string, StepReferences> {
  if (
    step.id !== undefined &&
    draft.steps.some((candidate) => candidate.id === step.id)
  ) throw new TypeError(`Step ID ${JSON.stringify(step.id)} is duplicated.`);
  return createStepFacade(Object.freeze({
    ...draft,
    steps: Object.freeze([...draft.steps, step]),
    references: step.id === undefined ? draft.references : Object.freeze({
      ...draft.references,
      [step.id]: stepReference(step.id, outputNames),
    }),
  }));
}
function stepFields(
  definition: {
    if?: unknown;
    env?: Readonly<Record<string, unknown>>;
    continueOnError?: boolean;
  },
): { if?: string; env?: EnvironmentVariables; continueOnError?: boolean } {
  return {
    ...(definition.if === undefined
      ? {}
      : { if: evaluateField("jobs.<job_id>.steps.if", definition.if) }),
    ...(definition.env === undefined
      ? {}
      : { env: evaluateEnv(definition.env) }),
    ...(definition.continueOnError === undefined
      ? {}
      : { continueOnError: definition.continueOnError }),
  };
}
function usesStep(
  definition: UsesStepDefinition<string | undefined> & {
    uses: ActionInvocation;
  },
): AuthoringUsesStep {
  return Object.freeze({
    type: "uses",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    uses: definition.uses.uses,
    ...stepFields(definition),
    ...(definition.uses.with === undefined
      ? {}
      : { with: copyActionInputs(definition.uses.with) }),
  });
}
function runStep(
  definition: RunStepDefinition<string | undefined, readonly string[]>,
): AuthoringRunStep {
  return Object.freeze({
    type: "run",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    run: definition.run,
    ...stepFields(definition),
    ...(definition.workingDirectory === undefined
      ? {}
      : { workingDirectory: definition.workingDirectory }),
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
    ...stepFields(definition),
  });
}
function materializeJob(
  draft: JobDraft & Readonly<{ runsOn: string }>,
): AuthoringJob {
  return Object.freeze({
    id: draft.id,
    runsOn: draft.runsOn,
    needs: draft.needs,
    ...draft.options,
    ...(draft.options?.permissions === undefined ? {} : {
      permissions: copyPermissions(draft.options.permissions),
    }),
    steps: draft.steps,
  });
}
function materializePipeline(draft: PipelineDraft): AuthoringPipeline {
  return Object.freeze({
    id: draft.id,
    name: draft.name,
    output: draft.output,
    events: draft.events,
    ...(draft.pushBranches === undefined
      ? {}
      : { pushBranches: draft.pushBranches }),
    ...(draft.workflowDispatchInputs === undefined
      ? {}
      : { workflowDispatchInputs: draft.workflowDispatchInputs }),
    ...(draft.concurrency === undefined
      ? {}
      : { concurrency: draft.concurrency }),
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
    outputNames: Object.freeze([...outputNames]),
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
    if (key !== "contents" && key !== "id-token") {
      throw new TypeError(
        `Workflow permission ${JSON.stringify(key)} is not supported.`,
      );
    }
    if (key === "id-token") {
      if (value !== "none" && value !== "write") {
        throw new TypeError("OIDC permission must be none or write.");
      }
    } else if (value !== "none" && value !== "read" && value !== "write") {
      throw new TypeError("Workflow permission must be none, read, or write.");
    }
  }
  return Object.freeze({ ...permissions });
}
function validateActionInputs(inputs: ActionInputs): void {
  assertPlainRecord(inputs, "Action inputs");
  for (const value of Object.values(inputs)) {
    if (
      typeof value !== "string" && !(value instanceof Expression) &&
      typeof value !== "boolean" &&
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
  if (value instanceof Expression) return true;
  switch (type) {
    case "string":
      return typeof value === "string" || value instanceof Expression;
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
  }
}
function copyActionInputs(
  inputs: ActionInputs,
): Readonly<Record<string, string | number | boolean>> {
  validateActionInputs(inputs);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(inputs).map((
        [key, value],
      ) => [key, value instanceof Expression ? emitExpression(value) : value]),
    ),
  ) as Readonly<Record<string, string | number | boolean>>;
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
