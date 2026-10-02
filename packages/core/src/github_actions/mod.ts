import type {
  InputDefinitions,
  InputValues,
  OutputDefinitions,
  OutputValues,
  TaskContext,
  ValueContract,
} from "../task/mod.ts";
export { jsonValue, textValue } from "../task/mod.ts";
import {
  emitExpression,
  Expression,
  type ExpressionInput,
  expressionProofs,
  type RawExpression,
  type ReferenceBinding,
  referenceBinding,
  referencePath,
  type Scope,
  scope,
  type TypedMarker,
  type TypedReference,
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
  present,
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
  inputs: Readonly<
    Record<
      string,
      Readonly<
        { contract: ValueContract<unknown>; from: string; optional: boolean }
      >
    >
  >;
  outputs: OutputDefinitions;
  run: (
    context: TaskContext<InputDefinitions, OutputDefinitions>,
  ) => void | Promise<void>;
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

export const actionInput: Readonly<{
  string: ActionInputFactory<string>;
  number: ActionInputFactory<number>;
  boolean: ActionInputFactory<boolean>;
}> = Object.freeze({
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
  Test extends object = object,
> = Readonly<
  {
    id: JobId;
    pipelineId: PipelineId;
    outputNames: Outputs;
    contracts?: Readonly<Record<string, ReferenceBinding>>;
    [testJobShape]?: Test;
  }
>;
const testStepShape: unique symbol = Symbol("tsugiori.test-step-shape");
const testJobShape: unique symbol = Symbol("tsugiori.test-job-shape");
const testPipelineShape: unique symbol = Symbol("tsugiori.test-pipeline-shape");
export type TestStepShape<
  Inputs = Record<string, unknown>,
  Outputs = Record<string, unknown>,
> = Readonly<{ inputs: Inputs; outputs: Outputs }>;
export type TestJobShape<
  Steps extends StepReferences = StepReferences,
  Matrix extends object = object,
> = Readonly<{ steps: Steps; matrix: Matrix }>;
export type TestStepsOf<Job> = Job extends { readonly [testJobShape]?: infer T }
  ? T extends TestJobShape<infer Steps, object> ? Steps : never
  : never;
export type TestMatrixOf<Job> = Job extends
  { readonly [testJobShape]?: infer T }
  ? T extends TestJobShape<StepReferences, infer Matrix> ? Matrix : never
  : never;
export type TestStepOf<Step> = Step extends {
  readonly [testStepShape]?: infer T;
} ? T
  : never;
export type TestJobsOf<Pipeline> = Pipeline extends {
  readonly [testPipelineShape]?: infer Jobs;
} ? Jobs
  : never;
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
  Test extends TestStepShape = TestStepShape,
> = Readonly<{
  id: Id;
  outputs: Readonly<
    { [OutputName in Outputs[number]]: ActionOutputReference<Id, OutputName> }
  >;
  outputNames: Outputs;
  contracts?: Readonly<Record<string, ReferenceBinding>>;
  [testStepShape]?: Test;
}>;
type StepReferences = Readonly<Record<string, StepReference>>;
type TypedNames<O extends OutputDefinitions> =
  & readonly (keyof O & string)[]
  & Readonly<{
    __typed: {
      [K in keyof O]: TypedMarker<
        O[K] extends { contract: ValueContract<infer T> } ? T : never,
        O[K]["contract"],
        O[K]["required"]
      >;
    };
  }>;
type JobOutputNames<O extends Readonly<Record<string, unknown>>> =
  & readonly (keyof O & string)[]
  & Readonly<{
    __typed: {
      [K in keyof O]: O[K] extends
        TypedReference<infer T, infer C, string, infer R> ? TypedMarker<T, C, R>
        : string;
    };
  }>;
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
type ConditionProof<C> = C extends Expression<boolean, infer P> ? P
  : C extends (...args: never[]) => Expression<boolean, infer P> ? P
  : never;
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
  Inputs extends InputDefinitions = Record<never, never>,
  Outputs extends OutputDefinitions = Record<never, never>,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  Proof extends string = never,
  Condition extends
    | StepField<"jobs.<job_id>.steps.if", Needs, Steps, Matrix, Vars, Secrets>
    | undefined = undefined,
> =
  & Omit<StepCommon<Needs, Steps, Matrix, Vars, Secrets>, "if">
  & Readonly<{
    id?: Id;
    if?: Condition;
    inputs:
      & Inputs
      & Readonly<
        Record<
          string,
          Readonly<{
            contract: ValueContract<unknown>;
            from:
              | ExpressionInput
              | ((
                context: Scope<
                  "jobs.<job_id>.steps.env",
                  Needs,
                  OutputMap<Steps>,
                  Matrix,
                  Vars,
                  Secrets,
                  Proof | ConditionProof<Condition>
                >,
              ) => ExpressionInput);
          }>
        >
      >;
    outputs: Outputs;
    run: (
      context: TaskContext<Inputs, Outputs, Proof | ConditionProof<Condition>>,
    ) => void | Promise<void>;
  }>;
const jobDefinition = Symbol("tsugiori.job-definition");
const pipelineDefinition = Symbol("tsugiori.pipeline-definition");
export interface TestablePipeline {
  readonly [pipelineDefinition]: AuthoringPipeline;
  readonly [testPipelineShape]?: Readonly<Record<string, unknown>>;
}
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
  contracts: Readonly<Record<string, ReferenceBinding>>;
}>;
export interface FinalizedJobState<
  PipelineId extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Steps extends StepReferences = StepReferences,
  Matrix extends object = object,
> {
  readonly [jobDefinition]: FinalizedJobDefinition<PipelineId, JobId, Outputs>;
  readonly [testJobShape]?: TestJobShape<Steps, Matrix>;
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
  Readonly<{ outputs: infer O extends OutputDefinitions }> ? TypedNames<O>
  : readonly [];
type DefinitionStepReference<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? StepReference<
    Id,
    Definition extends Readonly<{ uses: unknown }> ? Invocation<Definition>
      : Definition extends
        Readonly<{ run: string; outputs: infer O extends readonly string[] }>
        ? O
      : TaskOutputs<Definition>,
    TestStepShape<
      Record<string, unknown>,
      Record<
        Definition extends Readonly<{ uses: unknown }>
          ? Invocation<Definition>[number]
          : Definition extends
            Readonly<{ outputs: infer O extends readonly string[] }> ? O[number]
          : never,
        string
      >
    >
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
type AddTaskReference<
  Id extends string | undefined,
  I extends InputDefinitions,
  O extends OutputDefinitions,
  Steps extends StepReferences,
> = Id extends string ? Readonly<
    & Steps
    & Record<
      Id,
      StepReference<
        Id,
        TypedNames<O>,
        TestStepShape<InputValues<I>, OutputValues<O>>
      >
    >
  >
  : Steps;
type SkippableOutputs<O extends OutputDefinitions> = {
  readonly [K in keyof O]: Readonly<
    { contract: O[K]["contract"]; required: false }
  >;
};
type EffectiveOutputs<
  O extends OutputDefinitions,
  C,
  F extends boolean | undefined,
> = [C] extends [undefined] ? true extends F ? SkippableOutputs<O> : O
  : SkippableOutputs<O>;
export interface ExecutionJobState<
  PipelineId extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  Proof extends string = never,
> {
  when<
    const C extends Field<
      "jobs.<job_id>.if",
      Needs,
      Record<never, never>,
      Record<never, never>,
      Vars,
      Secrets
    >,
  >(
    condition: C,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    ConditionProof<C>
  >;
  strategy<const Shape extends object>(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets,
        Proof
      >,
    ) => Readonly<{ matrix: Expression<Shape>; failFast?: boolean }>,
  ): ExecutionJobState<PipelineId, JobId, Needs, Shape, Vars, Secrets, Proof>;
  strategy(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets,
        Proof
      >,
    ) => Readonly<{ matrix: RawExpression; failFast?: boolean }>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets,
    Proof
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
          Secrets,
          Proof
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
    Secrets,
    Proof
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
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets, Proof>;
  permissions(
    value: WorkflowPermissions,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets, Proof>;
  timeoutMinutes(
    value: number,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets, Proof>;
  environment(
    value: string,
  ): ExecutionJobState<PipelineId, JobId, Needs, Matrix, Vars, Secrets, Proof>;
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
    Secrets,
    readonly [],
    Proof
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
    Secrets,
    readonly [],
    Proof
  >;
  task<
    const Id extends string | undefined,
    const I extends InputDefinitions,
    const O extends OutputDefinitions,
    const C extends
      | StepField<
        "jobs.<job_id>.steps.if",
        Needs,
        Record<never, never>,
        Matrix,
        Vars,
        Secrets
      >
      | undefined,
    const F extends boolean | undefined = undefined,
  >(
    definition:
      & TaskStepDefinition<
        Id,
        I,
        O,
        Needs,
        Record<never, never>,
        Matrix,
        Vars,
        Secrets,
        Proof,
        C
      >
      & Readonly<{ inputs: I; outputs: O; if?: C; continueOnError?: F }>,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddTaskReference<Id, I, EffectiveOutputs<O, C, F>, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    readonly [],
    Proof
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
  Proof extends string = never,
> extends FinalizedJobState<PipelineId, JobId, Outputs, Steps, Matrix> {
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
        Secrets,
        Proof
      >,
    ) => Names,
  ): FinalizedJobState<
    PipelineId,
    JobId,
    JobOutputNames<Names>,
    Steps,
    Matrix
  >;
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
    Outputs,
    Proof
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
    Outputs,
    Proof
  >;
  task<
    const Id extends string | undefined,
    const I extends InputDefinitions,
    const O extends OutputDefinitions,
    const C extends
      | StepField<"jobs.<job_id>.steps.if", Needs, Steps, Matrix, Vars, Secrets>
      | undefined,
    const F extends boolean | undefined = undefined,
  >(
    definition:
      & TaskStepDefinition<
        Id,
        I,
        O,
        Needs,
        Steps,
        Matrix,
        Vars,
        Secrets,
        Proof,
        C
      >
      & Readonly<
        {
          inputs: I;
          outputs: O;
          if?: C;
          continueOnError?: F;
          id?: Exclude<Id, keyof Steps>;
        }
      >,
  ): NonEmptyStepState<
    PipelineId,
    JobId,
    AddTaskReference<Id, I, EffectiveOutputs<O, C, F>, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    Outputs,
    Proof
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
    JobReference<
      PipelineId,
      JobId,
      Result[typeof jobDefinition]["outputNames"],
      NonNullable<Result[typeof testJobShape]>
    >
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
  readonly [testPipelineShape]?: Jobs;
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
  contracts: ReadonlyMap<string, ReferenceBinding>;
  proofPaths: ReadonlySet<string>;
  outputContracts?: Readonly<Record<string, ReferenceBinding>>;
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
          contracts: new Map(),
          proofPaths: new Set<string>(),
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
              contracts: completed.contracts,
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
function evaluateCondition(
  key: "jobs.<job_id>.if" | "jobs.<job_id>.steps.if",
  value: unknown,
): Readonly<{ rendered: string; proofPaths: ReadonlySet<string> }> {
  const result = typeof value === "function"
    ? (value as (context: unknown) => ExpressionInput)(scope(key))
    : value;
  return {
    rendered: emitExpression(result as ExpressionInput),
    proofPaths: expressionProofs(result),
  };
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
                  contracts: new Map(dependencies.flatMap((dependency) =>
                    Object.entries(dependency.contracts ?? {}).map((
                      [name, contract],
                    ) =>
                      [
                        referencePath(
                          referencePath(
                            referencePath("needs", dependency.id),
                            "outputs",
                          ),
                          name,
                        ),
                        contract,
                      ] as const
                    )
                  )),
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
    when: (value: unknown) => {
      const condition = evaluateCondition("jobs.<job_id>.if", value);
      return createExecutionJobFacade(Object.freeze({
        ...draft,
        proofPaths: condition.proofPaths,
        options: { ...draft.options, if: condition.rendered },
      }));
    },
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
    task: (
      definition: TaskStepDefinition<
        string | undefined,
        InputDefinitions,
        OutputDefinitions
      >,
    ) =>
      appendStep(
        draft,
        taskStep(definition, draft.contracts, draft.proofPaths),
        Object.keys(definition.outputs ?? {}),
        Object.fromEntries(
          Object.entries(definition.outputs).map(([name, output]) => [
            name,
            {
              contract: output.contract,
              required: output.required && definition.if === undefined &&
                definition.continueOnError !== true,
            },
          ]),
        ),
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
      contracts: draft.outputContracts ?? Object.freeze({}),
    }),
    steps: draft.references,
    outputs: (define: (context: unknown) => Record<string, unknown>) => {
      const values = define(
        scope("jobs.<job_id>.outputs.<output_id>", draft.contracts),
      );
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
      const outputContracts = Object.freeze(Object.fromEntries(
        Object.entries(values).flatMap(([name, value]) => {
          const binding = referenceBinding(value);
          return binding === undefined ? [] : [[name, binding]];
        }),
      ));
      return createStepFacade(
        Object.freeze({
          ...draft,
          outputContracts,
          options: { ...draft.options, outputs },
        }),
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
  contracts?: Readonly<Record<string, ReferenceBinding>>,
): NonEmptyStepState<string, string, StepReferences> {
  if (
    step.id !== undefined &&
    draft.steps.some((candidate) => candidate.id === step.id)
  ) throw new TypeError(`Step ID ${JSON.stringify(step.id)} is duplicated.`);
  return createStepFacade(Object.freeze({
    ...draft,
    steps: Object.freeze([...draft.steps, step]),
    contracts: step.id === undefined || contracts === undefined
      ? draft.contracts
      : new Map([
        ...draft.contracts,
        ...Object.entries(contracts).map(([name, contract]) =>
          [
            referencePath(
              referencePath(referencePath("steps", step.id!), "outputs"),
              name,
            ),
            contract,
          ] as const
        ),
      ]),
    references: step.id === undefined ? draft.references : Object.freeze({
      ...draft.references,
      [step.id]: stepReference(step.id, outputNames, contracts),
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
  definition: TaskStepDefinition<
    string | undefined,
    InputDefinitions,
    OutputDefinitions
  >,
  contracts: ReadonlyMap<string, ReferenceBinding>,
  jobProofPaths: ReadonlySet<string>,
): AuthoringTaskStep {
  const fields = stepFields({
    env: definition.env,
    continueOnError: definition.continueOnError,
  });
  const condition = definition.if === undefined
    ? undefined
    : evaluateCondition("jobs.<job_id>.steps.if", definition.if);
  const proofPaths = new Set([
    ...jobProofPaths,
    ...condition?.proofPaths ?? [],
  ]);
  const env: Record<string, string> = { ...fields.env };
  const inputs: Record<
    string,
    { contract: ValueContract<unknown>; from: string; optional: boolean }
  > = {};
  for (const [name, input] of Object.entries(definition.inputs ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new TypeError(
        `Task input ${JSON.stringify(name)} is not a valid environment name.`,
      );
    }
    if (typeof input.contract?.parse !== "function") {
      throw new TypeError(
        `Task input ${JSON.stringify(name)} requires a contract.`,
      );
    }
    const envName = `TSUGIORI_INPUT_${name.toUpperCase()}`;
    if (envName in env) {
      throw new TypeError(
        `Task input environment variable ${envName} conflicts with env.`,
      );
    }
    const source = typeof input.from === "function"
      ? (input.from as (context: unknown) => unknown)(
        scope("jobs.<job_id>.steps.env", contracts),
      )
      : input.from;
    const binding = referenceBinding(source);
    const sourceContract = binding?.contract;
    if (sourceContract !== undefined && sourceContract !== input.contract) {
      throw new TypeError(
        `Task input ${JSON.stringify(name)} uses a different contract object.`,
      );
    }
    env[envName] = source instanceof Expression
      ? emitExpression(source)
      : typeof source === "string" && source.startsWith("${{ ")
      ? source
      : (() => {
        throw new TypeError(
          `Task input ${JSON.stringify(name)} must be an expression.`,
        );
      })();
    inputs[name] = {
      contract: input.contract,
      from: envName,
      optional: binding?.required === false &&
        !(source instanceof Expression && source.node.kind === "path" &&
          proofPaths.has(source.node.value)),
    };
  }
  validateActionOutputs(Object.keys(definition.outputs ?? {}));
  for (const [name, output] of Object.entries(definition.outputs ?? {})) {
    if (
      typeof output.required !== "boolean" ||
      typeof output.contract?.parse !== "function"
    ) {
      throw new TypeError(
        `Task output ${
          JSON.stringify(name)
        } requires a contract and required flag.`,
      );
    }
  }
  return Object.freeze({
    type: "task",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    name: definition.name,
    inputs,
    outputs: definition.outputs ?? {},
    run: definition.run,
    ...fields,
    ...(condition === undefined ? {} : { if: condition.rendered }),
    ...(Object.keys(env).length === 0 ? {} : { env: Object.freeze(env) }),
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
  contracts?: Readonly<Record<string, ReferenceBinding>>,
): StepReference {
  return Object.freeze({
    id,
    outputNames: Object.freeze([...outputNames]),
    ...(contracts === undefined ? {} : { contracts }),
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
