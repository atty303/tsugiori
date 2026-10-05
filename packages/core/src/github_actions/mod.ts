// GitHub specification descriptions are copied or adapted from GitHub Docs (CC BY 4.0).
// Attribution, modifications and fixed source basis: docs/GITHUB_ACTIONS_SPEC.md.
export { githubActionsSpec } from "./github_spec.ts";
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

/** Events determine when a workflow runs. Multiple events are alternatives; each matching event can start a separate run.
 * Tsugiori: the supported event names are limited to this union; see githubActionsSpec for the fixed specification basis.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
 */
export type PipelineEvent =
  | "pull_request"
  | "pull_request_target"
  | "push"
  | "workflow_dispatch"
  | "workflow_call";
/** Manual workflow dispatch accepts named inputs and displays them in the run form. choice inputs use a single selection and return a string. GitHub allows at most 10 top-level inputs with a total payload of 65,535 characters.
 * Tsugiori: supports string and choice inputs; other GitHub dispatch input types are not implemented.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
 */
export type WorkflowDispatchInput =
  & Readonly<{
    /** A human-readable explanation of this input, secret or output for workflow authors.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     */
    description?: string;
    /** Whether the caller must supply this value. Defaults to false when omitted.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     */
    required?: boolean;
  }>
  & (
    | Readonly<{
      /** The input value type. choice displays a single-selection list and produces a string; string accepts text.
       * Tsugiori: boolean, number and environment dispatch inputs are not supported.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       */
      type: "string";
      /** The preselected or initial value on the manual-run form when the caller does not supply one. For choice inputs, use one of options.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
       */
      default?: string;
    }>
    | Readonly<{
      /** The input value type. choice displays a single-selection list and produces a string; string accepts text.
       * Tsugiori: boolean, number and environment dispatch inputs are not supported.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       */
      type: "choice";
      /** The choices displayed in the manual-run UI. The selected choice is a string input value.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       */
      options: readonly string[];
      /** The preselected or initial value on the manual-run form when the caller does not supply one. For choice inputs, use one of options.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
       */
      default?: string;
    }>
  );
/** For each GITHUB_TOKEN permission, read grants read-only access, write grants read and write access, and none disables access. Once any permission is specified, unspecified permissions become none.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
 */
export type PermissionLevel = "none" | "read" | "write";
/** OIDC uses write to allow token requests, or none to disable them; it has no read level.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
 */
export type OidcPermissionLevel = "none" | "write";
export type WorkflowPermissions = Readonly<{
  /** Controls GITHUB_TOKEN access to repository contents: read allows checkout; write allows content changes and releases.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  contents?: PermissionLevel;
  /** Allows requesting an OpenID Connect token for authentication to an external provider. write permits token requests, not writes to that provider.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  "id-token"?: OidcPermissionLevel;
  /** Controls GITHUB_TOKEN access to pull requests, including reading metadata or writing labels and comments.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  "pull-requests"?: PermissionLevel;
  /** Controls GITHUB_TOKEN access to GitHub Actions, including reading runs or cancelling workflow runs with write.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  actions?: PermissionLevel;
}>;
/** Reusable input defaults are literals; GitHub supplies false, 0 or an empty string when omitted.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
 */
export type WorkflowCallInput =
  & Readonly<{
    /** A human-readable explanation of this input, secret or output for workflow authors.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
     */
    description?: string;
    /** Whether the caller must supply this value. Defaults to false when omitted.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
     */
    required?: boolean;
  }>
  & (
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       */
      type: "string";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       */
      default?: string;
    }>
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       */
      type: "boolean";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       */
      default?: boolean;
    }>
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       */
      type: "number";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       */
      default?: number;
    }>
  );
/** A reusable workflow declares inputs and secrets accepted from its caller. Required secrets must be supplied; declaring a secret does not grant access to it.
 * Tsugiori: validates explicit local call contracts, but cannot verify repository authorization.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
 */
export type WorkflowCall = Readonly<{
  /** Named typed values accepted by this reusable workflow. The caller supplies them with with; undeclared names or mismatched primitive types are invalid.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
   */
  inputs?: Readonly<Record<string, WorkflowCallInput>>;
  /** Named secrets the caller may pass to this reusable workflow. Undeclared explicit secrets cause an error; inherit permits using inherited secrets without a declaration. Environment secrets are selected by a callee job environment rather than passed via workflow_call.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
   */
  secrets?: Readonly<
    Record<
      string,
      Readonly<{
        /** A description of the secret expected by this reusable workflow.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
         */
        description?: string;
        /** Whether the caller must supply this secret. Defaults to false.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecretssecret_idrequired
         */
        required?: boolean;
      }>
    >
  >;
}>;
/** Outputs returned by a reusable workflow are available to downstream jobs in its caller. Each output has an identifier, optional description and value mapped to a job output within the callee.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
 */
export type WorkflowCallOutputs = Readonly<
  Record<
    string,
    Readonly<{
      /** A human-readable explanation of this input, secret or output for workflow authors.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       */
      description?: string;
      /** The expression defining the workflow output, usually a job output such as `${{ jobs.build.outputs.version }}`. The caller reads it through `needs.<caller_job>.outputs`.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       */
      value: string;
    }>
  >
>;
/** Supported native trigger settings; use an object even for an event without settings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 */
export type PipelineTriggers = Readonly<{
  push?: Readonly<{
    /** Branch-name patterns that allow push runs, for example main or releases/**. Patterns can contain ! exclusions; order matters. If only branches are configured, tag pushes do not trigger the workflow.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore
     */
    branches?: readonly string[];
    /** Tag-name patterns that allow push runs, for example v*. Patterns can contain glob syntax and ! exclusions; order matters. If only tags are configured, branch pushes do not trigger the workflow.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore
     */
    tags?: readonly string[];
  }>;
  pull_request?: Readonly<{
    /** Pull request activities that trigger runs, such as opened, synchronize or labeled. When omitted, GitHub uses opened, synchronize and reopened. Code executes in the pull request merge context.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onevent_nametypes
     */
    types?: readonly string[];
  }>;
  pull_request_target?: Readonly<{
    /** Pull request activities that trigger runs in the base-repository context. When omitted, GitHub uses opened, synchronize and reopened. This context may expose base-repository secrets and a write token: do not execute untrusted pull request code.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onevent_nametypes
     */
    types?: readonly string[];
  }>;
  workflow_dispatch?: Readonly<{
    /** Named inputs shown on the manual-run form and accepted by workflow dispatch. Values are available in inputs and github.event.inputs. The workflow must exist on the default branch to receive this event.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     */
    inputs?: Readonly<Record<string, WorkflowDispatchInput>>;
  }>;
  workflow_call?:
    & WorkflowCall
    & Readonly<{
      /** Workflow outputs returned to the caller. Map each output to a job output from this workflow; the caller reads needs.<caller_job>.outputs.<name>.
       * Tsugiori: workflowOutputs() provides typed job references as an alternative to raw expression strings.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       */
      outputs?: WorkflowCallOutputs;
    }>;
}>;
type ExactTriggers<On extends PipelineTriggers> = On extends readonly unknown[]
  ? never
  : {
    [E in keyof On]: E extends keyof PipelineTriggers ?
        & On[E]
        & Record<
          Exclude<keyof On[E], keyof NonNullable<PipelineTriggers[E]>>,
          never
        >
      : never;
  };
type NonEmptyTriggers = {
  [K in keyof PipelineTriggers]-?:
    & PipelineTriggers
    & Required<Pick<PipelineTriggers, K>>;
}[keyof PipelineTriggers];
type TriggerInputs<T> = T extends { inputs?: infer I } ? NonNullable<I>
  : Record<never, never>;
type EventInputs<On, E extends keyof On> = TriggerInputs<On[E]>;
type InputNames<On> = { [E in keyof On]-?: keyof EventInputs<On, E> }[keyof On];
type EventInputValue<I, K> = K extends keyof I ? InputValue<I[K]> : "";
/** Missing properties evaluate to an empty string, including on non-input triggers.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#available-contexts
 */
export type PipelineInputValues<On extends PipelineTriggers> = {
  readonly [K in InputNames<On>]: {
    [E in keyof On]-?: EventInputValue<EventInputs<On, E>, K>;
  }[keyof On];
};
type PipelineCall<On> = On extends
  { workflow_call: infer C extends WorkflowCall } ? C : Record<never, never>;
type PipelineOutputNames<On> = On extends
  { workflow_call: { outputs: infer O } } ? keyof O & string : never;

const workflowContract: unique symbol = Symbol("tsugiori.workflow-contract");
export type ReusablePipeline<
  C extends WorkflowCall = WorkflowCall,
  O extends string = string,
> = TestablePipeline & {
  readonly [workflowContract]: Readonly<{ call: C; outputs: readonly O[] }>;
};
type CallInputs<C extends WorkflowCall> = NonNullable<C["inputs"]>;
type CallSecrets<C extends WorkflowCall> = NonNullable<C["secrets"]>;
type RequiredKeys<T> = {
  [K in keyof T]-?: T[K] extends { required: true } ? K : never;
}[keyof T];
type InputValue<D> = D extends { type: "boolean" } ? boolean
  : D extends { type: "number" } ? number
  : string;
type CallValues<C extends WorkflowCall> = Readonly<
  & {
    [K in RequiredKeys<CallInputs<C>>]:
      | InputValue<CallInputs<C>[K]>
      | Expression<InputValue<CallInputs<C>[K]>>;
  }
  & {
    [K in Exclude<keyof CallInputs<C>, RequiredKeys<CallInputs<C>>>]?:
      | InputValue<CallInputs<C>[K]>
      | Expression<InputValue<CallInputs<C>[K]>>;
  }
>;
type SecretValues<C extends WorkflowCall> = Readonly<
  & { [K in RequiredKeys<CallSecrets<C>>]: string | Expression<string> }
  & {
    [K in Exclude<keyof CallSecrets<C>, RequiredKeys<CallSecrets<C>>>]?:
      | string
      | Expression<string>;
  }
>;
/** Inherit is forwarded one hop; availability and organization/enterprise eligibility need GitHub validation.
 * @see https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows#passing-secrets-to-nested-workflows
 */
export type WorkflowCallArguments<C extends WorkflowCall> = Readonly<
  & (RequiredKeys<CallInputs<C>> extends never ? {
      /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
       */
      with?: CallValues<C>;
    }
    : {
      /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
       */
      with: CallValues<C>;
    })
  & (RequiredKeys<CallSecrets<C>> extends never ? {
      /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
       * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       */
      secrets?: SecretValues<C> | "inherit";
    }
    : {
      /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
       * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       */
      secrets: SecretValues<C> | "inherit";
    })
>;
/** Job run defaults choose the shell and working directory for run steps. Step-level settings override the job defaults. They do not affect uses steps.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun
 */
export type RunDefaults = Readonly<
  {
    /** The default command interpreter (for example bash, pwsh or cmd) for run steps in this job. An explicit step value overrides it; this does not configure action steps.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrunshell
     */
    shell?: string;
    /** The default execution directory, which must exist on the runner for run steps in this job. An explicit step value overrides it; this does not configure action steps.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrunworking-directory
     */
    workingDirectory?: string;
  }
>;
export type MatrixValue = string | number | boolean;
export type StaticMatrix = Readonly<
  Record<
    string,
    | string
    | readonly MatrixValue[]
    | readonly Readonly<Record<string, MatrixValue>>[]
  >
>;
export type ActionInput =
  | string
  | number
  | boolean
  | Expression<string | number | boolean>;
/** An action receives named parameters from the step with map, using the input names declared by the action.
 * Tsugiori: registered primitive input types are author assertions, not verification of action metadata.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 */
export type ActionInputs = Readonly<Record<string, ActionInput>>;
/** More-specific job/step values override workflow env; values in one env map cannot refer to each other.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
 */
export type EnvironmentVariables = Readonly<Record<string, string>>;
/** Concurrency restricts jobs or workflow runs sharing a group to one running member. By default, a new pending member replaces the existing pending member.
 * Tsugiori: queue max is supported only with cancellation disabled; scenarios do not simulate scheduling.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
 */
export type Concurrency = Readonly<{
  /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   */
  group: string;
  /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   */
  cancelInProgress: boolean;
  /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   */
  queue?: "max";
}>;
type JobOptions = Readonly<{
  /** The condition for running this job, evaluated before matrix expansion. success() is implicit unless a status-check function occurs in the condition.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  if?: string;
  /** Permissions granted to GITHUB_TOKEN for jobs in this workflow. A job can override this map. Once any permission is specified, unspecified permissions become none; repository and fork policies may further restrict access.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  permissions?: WorkflowPermissions;
  /** The maximum job runtime in whole minutes before cancellation. GitHub defaults to 360 minutes; runner and token limits can further constrain execution.
   * Tsugiori: literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** The deployment environment whose protection rules, approvals and secrets apply to this job. Protection rules must pass before the job is sent to a runner.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment
   */
  environment?: string;
  /** The job display name in the run UI. If omitted, GitHub uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name?: string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
  /** Default shell and working directory for all run steps in the job. Explicit step settings take precedence; defaults do not affect uses steps.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun
   */
  defaults?: RunDefaults;
  /** Maps output names to expressions evaluated at the end of the job. Dependent jobs read needs.<job_id>.outputs.<name>. GitHub omits outputs that may contain secrets. Matrix output names should be unique: execution order is not guaranteed. Output size limits are 1 MB per job and 50 MB per workflow run, approximated using UTF-16 encoding.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
   */
  outputs?: Readonly<Record<string, string>>;
  /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
   */
  strategy?: Readonly<{
    /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
     * Tsugiori: scenarios do not simulate cancellation or scheduling.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
     */
    failFast?: boolean;
    /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
     */
    matrix: string | StaticMatrix;
  }>;
  concurrency?: Concurrency;
}>;

/** GitHub evaluates expressions enclosed by `${{ }}` in workflow fields using contexts, operators and functions.
 * Tsugiori: inserts caller-asserted syntax without checking context availability or evaluating it during generation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/expressions
 */
export function rawExpression(expression: string): RawExpression {
  if (expression.trim().length === 0) {
    throw new TypeError("GitHub Actions expression must not be empty.");
  }
  return `\${{ ${expression} }}` as RawExpression;
}
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

/** A uses step executes an action with its declared inputs and exposes its outputs to later steps.
 * Tsugiori: this lowered representation is not executed during generation or scenarios.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
 */
export type AuthoringUsesStep = Readonly<{
  type: "uses";
  /** A unique job identifier used by needs and output/result references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  id?: string;
  /** The job display name in the run UI. If omitted, GitHub uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name: string;
  /** The reusable workflow invoked by this job: owner/repository/.github/workflows/file@ref or ./.github/workflows/file. A local path uses the caller commit; expressions are not allowed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   */
  uses: string;
  /** Named input values passed to the action, using the names declared by its metadata.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
   */
  with?: Readonly<Record<string, string | number | boolean>>;
  /** The condition for running this job, evaluated before matrix expansion. success() is implicit unless a status-check function occurs in the condition.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  if?: string;
  /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
   */
  continueOnError?: boolean;
  /** The maximum job runtime in whole minutes before cancellation. GitHub defaults to 360 minutes; runner and token limits can further constrain execution.
   * Tsugiori: literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
}>;
/** A run step executes commands in a new shell process on the runner.
 * Tsugiori: script values remain unchanged through YAML literal-block emission.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
 */
export type AuthoringRunStep = Readonly<{
  type: "run";
  /** A unique job identifier used by needs and output/result references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  id?: string;
  /** The job display name in the run UI. If omitted, GitHub uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name: string;
  /** Runs command-line programs of at most 21,000 characters using the runner shell. Each run step starts a fresh non-login shell process; multiline commands within one step share that process. Shell state does not persist to the next step.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   */
  run: string;
  /** The condition for running this job, evaluated before matrix expansion. success() is implicit unless a status-check function occurs in the condition.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  if?: string;
  /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
   */
  continueOnError?: boolean;
  /** The maximum job runtime in whole minutes before cancellation. GitHub defaults to 360 minutes; runner and token limits can further constrain execution.
   * Tsugiori: literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
  /** The directory in which the run script executes. Overrides job defaults; otherwise uses the default workspace directory. The directory must already exist on the runner.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory
   */
  workingDirectory?: string;
  /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
   */
  shell?: string;
}>;
/** GitHub runs steps sequentially on the selected runner.
 * Tsugiori: the task body remains outside YAML and is invoked through a normal Actions step.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
 */
export type AuthoringTaskStep = Readonly<{
  type: "task";
  /** A unique job identifier used by needs and output/result references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  id?: string;
  /** The job display name in the run UI. If omitted, GitHub uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name: string;
  inputs: Readonly<
    Record<
      string,
      Readonly<
        { contract: ValueContract<unknown>; from: string; optional: boolean }
      >
    >
  >;
  /** Maps output names to expressions evaluated at the end of the job. Dependent jobs read needs.<job_id>.outputs.<name>. GitHub omits outputs that may contain secrets. Matrix output names should be unique: execution order is not guaranteed. Output size limits are 1 MB per job and 50 MB per workflow run, approximated using UTF-16 encoding.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
   */
  outputs: OutputDefinitions;
  /** Runs command-line programs of at most 21,000 characters using the runner shell. Each run step starts a fresh non-login shell process; multiline commands within one step share that process. Shell state does not persist to the next step.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   */
  run: (
    context: TaskContext<InputDefinitions, OutputDefinitions>,
  ) => void | Promise<void>;
  /** The condition for running this job, evaluated before matrix expansion. success() is implicit unless a status-check function occurs in the condition.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  if?: string;
  /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
   */
  continueOnError?: boolean;
  /** The maximum job runtime in whole minutes before cancellation. GitHub defaults to 360 minutes; runner and token limits can further constrain execution.
   * Tsugiori: literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
}>;
export type AuthoringStep =
  | AuthoringUsesStep
  | AuthoringRunStep
  | AuthoringTaskStep;
/** Native regular or reusable caller job; caller jobs must omit runner/step execution fields.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
 */
export type AuthoringJob =
  & Readonly<{
    /** A unique job identifier used by needs and output/result references.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     */
    id: string;
    /** The runner executing this job. An array requires every listed label; a single label may select a GitHub-hosted image. Caller jobs use a reusable workflow instead of selecting a runner.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
     */
    runsOn?: string | NonEmptyReadonlyArray<string>;
    /** Jobs that must finish successfully before this job starts. A failed or skipped dependency skips dependent jobs unless the job condition explicitly admits another status.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
     */
    needs: readonly string[];
    /** The reusable workflow invoked by this job: owner/repository/.github/workflows/file@ref or ./.github/workflows/file. A local path uses the caller commit; expressions are not allowed.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    uses?: string;
    /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
     */
    with?: Readonly<Record<string, string | number | boolean>>;
    /** Named secrets passed to a reusable workflow, or inherit to forward available secrets within the same organization or enterprise. Forwarding is only to the direct callee.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
     */
    callSecrets?: "inherit" | EnvironmentVariables;
    /** A reusable workflow runs as a separate workflow with its own jobs and steps.
     * Tsugiori: retains the local pipeline definition for typed validation and scenario interpretation.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    callee?: AuthoringPipeline;
    /** Steps executed in sequence on this job's runner; they share a workspace but run scripts use separate shell processes.
     * Tsugiori: reusable caller jobs keep this array empty and emit no steps field.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
     */
    steps: readonly AuthoringStep[];
  }>
  & JobOptions;
/** A generated native workflow file; only declared supported fields are lowered.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 */
export type AuthoringPipeline = Readonly<{
  /** The workflow identifier used by Tsugiori for local references and the default display name.
   * Tsugiori: this is not a GitHub workflow syntax field.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  id: string;
  /** The workflow display name in the Actions tab.
   * Tsugiori: omission uses the pipeline id rather than GitHub's workflow-file-path fallback.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#name
   */
  name: string;
  /** The workflow YAML file path. GitHub discovers .yml and .yaml files under .github/workflows.
   * Tsugiori: generate writes this path relative to the configuration root.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  output: string;
  /** Supported events and their native settings; every configured event can start a separate run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  on: PipelineTriggers;
  /** The display name of an individual workflow run. Supports GitHub runtime expressions. When absent or whitespace-only, GitHub uses event-specific information such as a commit message or pull request title.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name
   */
  runName?: string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
  /** Limits simultaneous workflow runs that share a group in this repository, independently of runner availability. See group, cancelInProgress and queue for replacement/cancellation behavior.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   */
  concurrency?: Concurrency;
  /** Permissions granted to GITHUB_TOKEN for jobs in this workflow. A job can override this map. Once any permission is specified, unspecified permissions become none; repository and fork policies may further restrict access.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
}>;
export type TsugioriConfig = Readonly<{
  kind: "tsugiori.config";
  cacheVersion: number;
  pipelines: readonly AuthoringPipeline[];
}>;

/** Workflow settings define triggers, names, environment variables and the default token permissions. Reusable workflows exchange inputs, secrets and outputs; workflow environment variables do not cross the call boundary.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 */
export type PipelineOptions<
  On extends PipelineTriggers = NonEmptyTriggers,
  Vars extends readonly string[] | undefined = undefined,
  Secrets extends readonly string[] | undefined = undefined,
> = Readonly<{
  /** The workflow display name in the Actions tab.
   * Tsugiori: omission uses the pipeline id rather than GitHub's workflow-file-path fallback.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#name
   */
  name?: string;
  /** The workflow YAML file path. GitHub discovers .yml and .yaml files under .github/workflows.
   * Tsugiori: generate writes this path relative to the configuration root.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  output: string;
  /** Supported event settings. Use {} for an event without settings; shorthand forms are not accepted.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  on:
    & On
    & NonEmptyTriggers
    & ExactTriggers<On>
    & Readonly<Record<string, unknown>>;
  /** Repository, organization or environment configuration variables are read through vars.<name>. Unset variables evaluate to an empty string.
   * Tsugiori: this list narrows reference names; it neither creates variables nor changes GitHub configuration.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#vars-context
   */
  vars?: Vars;
  /** Repository, organization or environment secrets are read through secrets.<name>. Unset secrets evaluate to an empty string.
   * Tsugiori: this list narrows reference names; it does not create, populate or authorize secrets.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#secrets-context
   */
  secrets?: Secrets;
  /** The display name of an individual workflow run. Supports GitHub runtime expressions. When absent or whitespace-only, GitHub uses event-specific information such as a commit message or pull request title.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name
   */
  runName?: string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
  /** Limits simultaneous workflow runs that share a group in this repository, independently of runner availability. See group, cancelInProgress and queue for replacement/cancellation behavior.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   */
  concurrency?: Concurrency;
  /** Permissions granted to GITHUB_TOKEN for jobs in this workflow. A job can override this map. Once any permission is specified, unspecified permissions become none; repository and fork policies may further restrict access.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   */
  permissions?: WorkflowPermissions;
}>;

type LiteralNames<Values extends readonly string[] | undefined> = Values extends
  readonly string[] ? string extends Values[number] ? never
  : Values
  : Values;

const actionOutputs = Symbol("tsugiori.action-outputs");

/** Action outputs are string values supplied by the action, accessible through steps.<id>.outputs.<name>.
 * Tsugiori: the invocation retains declared output names for typed references; generation does not run the action.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 */
export type ActionInvocation<
  Outputs extends readonly string[] = readonly string[],
> = Readonly<{
  /** The action to execute: owner/repository[/path]@ref, a repository-local ./path or a docker:// image. A commit SHA pins the action implementation. Local actions require the repository to be checked out first.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   */
  uses: string;
  /** Named input values passed to the action, using the names declared by its metadata.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
   */
  with?: ActionInputs;
  [actionOutputs]: Outputs;
}>;

const actionInputDefinition = Symbol("tsugiori.action-input-definition");

/** Actions declare input names, descriptions, defaults and required flags in action metadata; input values are passed through with.
 * Tsugiori: this declaration adds primitive type checking to the author's contract without inspecting action metadata.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 */
export type ActionInputDefinition<
  Value extends ActionInput,
  Required extends boolean = false,
> = Readonly<{
  type: "string" | "number" | "boolean";
  /** Whether an action invocation must supply this input.
   * Tsugiori: validates this declared contract before generation; it does not inspect the action metadata.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
   */
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
  /** The choices displayed in the manual-run UI. The selected choice is a string input value.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
   */
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

/** Actions accept named inputs and expose named string outputs. A commit SHA in uses pins the action implementation.
 * Tsugiori: declares input/output contracts for local type checking without verifying external action metadata or behavior.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 */
export function defineAction<
  const Definitions extends ActionInputDefinitions,
  const Outputs extends readonly string[],
>(
  definition: Readonly<{
    /** The action to execute: owner/repository[/path]@ref, a repository-local ./path or a docker:// image. A commit SHA pins the action implementation. Local actions require the repository to be checked out first.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
     */
    uses: string;
    /** Inputs accepted by this action. Names follow the action metadata.
     * Tsugiori: primitive contracts are author assertions and validated locally; they do not verify the external action.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
     */
    inputs: Definitions;
    /** Named string outputs produced by this action, read by later steps as steps.<id>.outputs.<name>.
     * Tsugiori: this list declares output names for typed references; it does not write values or execute the script.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
     */
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

/** Runs an action selected by its uses reference with named input values. GitHub resolves and executes the referenced action.
 * Tsugiori: bypasses registered input/output contracts and exposes no declared output names.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
 */
export function rawAction(
  /** The action to execute: owner/repository[/path]@ref, a repository-local ./path or a docker:// image. A commit SHA pins the action implementation. Local actions require the repository to be checked out first.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   */
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

/** Declared outputs are available to dependent jobs through needs, not through host-language values.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
 */
export type JobReference<
  PipelineId extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Test extends object = object,
> = Readonly<
  {
    /** The job identifier used in needs dependencies and needs.<id> output/result references. It is separate from the display name.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     */
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
/** Native action/run outputs are strings, including JSON serialized by the action itself.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
 */
export type ActionOutputReference<
  StepId extends string = string,
  OutputName extends string = string,
> = `\${{ steps.${StepId}.outputs.${OutputName} }}`;
/** Earlier step outputs are accessible as steps.<id>.outputs.<name>.
 * Tsugiori: exposes only declared step ids and output names.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
 */
export type StepReference<
  Id extends string = string,
  Outputs extends readonly string[] = readonly string[],
  Test extends TestStepShape = TestStepShape,
> = Readonly<{
  /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
   */
  id: Id;
  /** String output references from an earlier action or run step, read as steps.<id>.outputs.<name>.
   * Tsugiori: this map contains runtime expression references, not values evaluated during generation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
   */
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
  InputValues extends object = Readonly<Record<string, string>>,
> =
  | ExpressionInput
  | ((
    context: Scope<S, Needs, Steps, Matrix, Vars, Secrets, InputValues>,
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
  InputValues extends object = Readonly<Record<string, string>>,
> = Field<S, Needs, OutputMap<Steps>, Matrix, Vars, Secrets, InputValues>;
type StepEnv<
  Needs extends Record<string, readonly string[]>,
  Steps extends StepReferences,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
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
        Secrets,
        InputValues
      >,
    ) => Expression<unknown>)
  >
>;
type JobEnv<
  Needs extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Readonly<
  Record<
    string,
    | string
    | Expression<string>
    | ((
      context: Scope<
        "jobs.<job_id>.env",
        Needs,
        Record<never, never>,
        Matrix,
        Vars,
        Secrets,
        InputValues
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
  InputValues extends object = Readonly<Record<string, string>>,
> = Readonly<{
  /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
   */
  id?: string;
  /** The step display name shown in the GitHub Actions run UI. It does not identify outputs; use id for references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsname
   */
  name: string;
  /** The condition for executing this step. A success() status check is implicit unless a status-check function is present. Use always(), failure() or cancelled() when the default success gate is inappropriate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif
   */
  if?: StepField<
    "jobs.<job_id>.steps.if",
    Needs,
    Steps,
    Matrix,
    Vars,
    Secrets,
    InputValues
  >;
  /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
   */
  continueOnError?: boolean;
  /** The maximum execution time in whole minutes before GitHub cancels the step. A step has no separate timeout when omitted; the job timeout still applies.
   * Tsugiori: literal values must be integers from 1 to 360; expression results are checked by GitHub. Scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes
   */
  timeoutMinutes?:
    | number
    | StepField<
      "jobs.<job_id>.steps.timeout-minutes",
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets,
      InputValues
    >;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: StepEnv<Needs, Steps, Matrix, Vars, Secrets, InputValues>;
}>;
/** A uses step runs an action with named inputs. GitHub evaluates conditions and input expressions at runtime.
 * Tsugiori: scenarios use fixtures rather than executing actions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
 */
export type UsesStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly string[],
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> =
  & StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>
  & Readonly<
    {
      /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
       */
      id?: Id;
      /** The action to execute: owner/repository[/path]@ref, a repository-local ./path or a docker:// image. A commit SHA pins the action implementation. Local actions require the repository to be checked out first.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
       */
      uses:
        | ActionInvocation<Outputs>
        | ((
          context: Scope<
            "jobs.<job_id>.steps.with",
            Needs,
            OutputMap<Steps>,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >,
        ) => ActionInvocation<Outputs>);
    }
  >;
/** A run step executes commands in a new shell process. Step shell and working-directory settings override job defaults. Values written to GITHUB_OUTPUT become string outputs.
 * Tsugiori: outputs declares reference names; scenarios do not execute the script.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
 */
export type RunStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly [],
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> =
  & StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>
  & Readonly<
    {
      /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
       */
      id?: Id;
      /** Runs command-line programs of at most 21,000 characters using the runner shell. Each run step starts a fresh non-login shell process; multiline commands within one step share that process. Shell state does not persist to the next step.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
       */
      run: string;
      /** Named outputs exposed to subsequent consumers. A run step sets string values by appending `name=value` to the GITHUB_OUTPUT environment file.
       * Tsugiori: this list declares output names for typed references; it does not write values or execute the script.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
       */
      outputs?: Outputs;
      /** The directory in which the run script executes. Overrides job defaults; otherwise uses the default workspace directory. The directory must already exist on the runner.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory
       */
      workingDirectory?: string;
      /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
       */
      shell?: string;
    }
  >;
/** A step condition can skip execution, and continue-on-error can prevent a step failure from failing the job.
 * Tsugiori: typed task input/output contracts and the task callback are additional runtime contracts, not GitHub workflow fields.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
 */
export type TaskStepDefinition<
  Id extends string | undefined = undefined,
  Inputs extends InputDefinitions = Record<never, never>,
  Outputs extends OutputDefinitions = Record<never, never>,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
  Condition extends
    | StepField<
      "jobs.<job_id>.steps.if",
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets,
      InputValues
    >
    | undefined = undefined,
> =
  & Omit<StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>, "if">
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
                  InputValues,
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
/** A job selects a runner and executes steps. Matrix expansion creates job variants with their own runtime matrix values.
 * Tsugiori: configure strategy before fields that reference its inferred matrix.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
 */
export interface ExecutionJobState<
  PipelineId extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
> {
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Tsugiori: configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
   */
  runsOn(
    runner:
      | string
      | NonEmptyReadonlyArray<string>
      | ((
        context: Scope<
          "jobs.<job_id>.runs-on",
          Needs,
          Record<never, never>,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >,
      ) => Expression<string> | string | NonEmptyReadonlyArray<string>),
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Sets the job display name shown in the run UI. Expressions can distinguish matrix members; omission uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name(
    value:
      | string
      | Field<
        "jobs.<job_id>.name",
        Needs,
        Record<never, never>,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Job env overrides workflow env; values within one map cannot depend on one another.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenv
   */
  env(
    value: JobEnv<Needs, Matrix, Vars, Secrets, InputValues>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Run defaults apply to run steps; explicit step shell/directory wins.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun
   */
  defaultsRun(
    value: Readonly<
      {
        /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
         */
        shell?:
          | string
          | Field<
            "jobs.<job_id>.defaults.run",
            Needs,
            Record<never, never>,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >;
        /** The directory in which the run script executes. Overrides job defaults; otherwise uses the default workspace directory. The directory must already exist on the runner.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory
         */
        workingDirectory?:
          | string
          | Field<
            "jobs.<job_id>.defaults.run",
            Needs,
            Record<never, never>,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >;
      }
    >,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Sets the condition deciding whether this job runs. GitHub evaluates it before matrix expansion. A success() check is implicit unless the expression contains a status-check function.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  when<
    const C extends Field<
      "jobs.<job_id>.if",
      Needs,
      Record<never, never>,
      Record<never, never>,
      Vars,
      Secrets,
      InputValues
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
    InputValues,
    ConditionProof<C>
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<const Rows extends readonly Readonly<Record<string, MatrixValue>>[]>(
    definition: Readonly<
      {
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         */
        matrix: Readonly<{
          /** Objects added to the matrix. With no other axes, each object defines one complete job combination; fields become matrix.<field> runtime values.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrixinclude
           */
          include: Rows;
        }>;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         */
        failFast?: boolean;
      }
    >,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Rows[number],
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<const Shape extends object>(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets,
        InputValues,
        Proof
      >,
    ) => Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       */
      matrix: Expression<Shape>;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       */
      failFast?: boolean;
    }>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Shape,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy(
    definition: (
      context: Scope<
        "jobs.<job_id>.strategy",
        Needs,
        Record<never, never>,
        Record<never, never>,
        Vars,
        Secrets,
        InputValues,
        Proof
      >,
    ) => Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       */
      matrix: RawExpression;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       */
      failFast?: boolean;
    }>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<
    const Axes extends Readonly<
      Record<
        string,
        | readonly MatrixValue[]
        | Expression<readonly MatrixValue[]>
        | RawExpression
      >
    >,
  >(
    definition:
      | Readonly<{
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         */
        matrix: Axes;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         */
        failFast?: boolean;
      }>
      | ((
        context: Scope<
          "jobs.<job_id>.strategy",
          Needs,
          Record<never, never>,
          Record<never, never>,
          Vars,
          Secrets,
          InputValues,
          Proof
        >,
      ) => Readonly<{
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         */
        matrix: Axes;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         */
        failFast?: boolean;
      }>),
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    {
      readonly [K in keyof Axes]: Axes[K] extends readonly (infer V)[] ? V
        : Axes[K] extends Expression<infer Values>
          ? Values extends readonly (infer V)[] ? V : string
        : string;
    },
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Allows at most one running member of a group in this repository. A new pending member normally replaces the old pending member; cancelInProgress also cancels the running member.
   * Tsugiori: queue max requires cancellation disabled; scenarios do not schedule.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency
   */
  concurrency(
    definition: Readonly<
      {
        /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        group: Field<
          "jobs.<job_id>.concurrency",
          Needs,
          Record<never, never>,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >;
        /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        cancelInProgress: boolean;
        /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        queue?: "max";
      }
    >,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Sets this job's GITHUB_TOKEN permissions, overriding the workflow map. Once any permission is specified, all unspecified permissions become none. Repository, organization and fork policies can reduce effective access.
   * Tsugiori: supports contents, id-token, actions and pull-requests; scenarios do not verify authorization.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
   */
  permissions(
    value: WorkflowPermissions,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Sets the maximum job execution time in whole minutes before GitHub cancels it. The default is 360 minutes; runner limits and token lifetime can impose additional limits.
   * Tsugiori: literal values retain a 1–360 integer limit; expression values pass through. Scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes(
    value:
      | number
      | Field<
        "jobs.<job_id>.timeout-minutes",
        Needs,
        Record<never, never>,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Names the deployment environment used by this job. GitHub applies its protection rules and required approvals before sending the job to a runner; environment secrets become available after protection rules pass.
   * Tsugiori: supports the name only, not the structured name/url form; scenarios do not enforce protections.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment
   */
  environment(
    value: string,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori: scenarios represent action behavior with fixtures.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   */
  uses<
    const D extends UsesStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets,
      InputValues
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
    InputValues,
    readonly [],
    Proof
  >;
  /** Executes commands in a new runner shell process. Explicit shell and working directory override job defaults; shell state does not persist between run steps.
   * Tsugiori: preserves the script through YAML emission; scenarios do not execute it.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   */
  run<
    const D extends RunStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Record<never, never>,
      Matrix,
      Vars,
      Secrets,
      InputValues
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
    InputValues,
    readonly [],
    Proof
  >;
  /** Steps run sequentially within a job. Their conditions, environment, timeouts and continue-on-error policy determine execution and failure handling.
   * Tsugiori: creates a step invoking the task runtime; the task body remains outside YAML and uses typed task I/O.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
   */
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
        Secrets,
        InputValues
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
        InputValues,
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
    InputValues,
    readonly [],
    Proof
  >;
}
/** Outputs become the needs surface of dependent jobs; GitHub can suppress outputs containing secrets.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
 */
export interface NonEmptyStepState<
  PipelineId extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> extends FinalizedJobState<PipelineId, JobId, Outputs, Steps, Matrix> {
  readonly steps: Steps;
  /** Maps step values to string outputs for dependent jobs; GitHub can suppress outputs containing secrets.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
   */
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
          Secrets,
          InputValues
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
        InputValues,
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
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori: scenarios represent action behavior with fixtures.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   */
  uses<
    const D extends UsesStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets,
      InputValues
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
    InputValues,
    Outputs,
    Proof
  >;
  /** Executes commands in a new runner shell process. Explicit shell and working directory override job defaults; shell state does not persist between run steps.
   * Tsugiori: preserves the script through YAML emission; scenarios do not execute it.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   */
  run<
    const D extends RunStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets,
      InputValues
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
    InputValues,
    Outputs,
    Proof
  >;
  /** Steps run sequentially within a job. Their conditions, environment, timeouts and continue-on-error policy determine execution and failure handling.
   * Tsugiori: creates a step invoking the task runtime; the task body remains outside YAML and uses typed task I/O.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
   */
  task<
    const Id extends string | undefined,
    const I extends InputDefinitions,
    const O extends OutputDefinitions,
    const C extends
      | StepField<
        "jobs.<job_id>.steps.if",
        Needs,
        Steps,
        Matrix,
        Vars,
        Secrets,
        InputValues
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
        Steps,
        Matrix,
        Vars,
        Secrets,
        InputValues,
        Proof,
        C
      >
      & Readonly<
        {
          inputs: I;
          /** Named outputs exposed to subsequent consumers. A run step sets string values by appending `name=value` to the GITHUB_OUTPUT environment file.
           * Tsugiori: this list declares output names for typed references; it does not write values or execute the script.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
           */
          outputs: O;
          /** The condition for executing this step. A success() status check is implicit unless a status-check function is present. Use always(), failure() or cancelled() when the default success gate is inappropriate.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif
           */
          if?: C;
          /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
           */
          continueOnError?: F;
          /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
           */
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
    InputValues,
    Outputs,
    Proof
  >;
}
/** Native caller jobs contain uses/with/secrets, never runs-on or steps.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#supported-keywords-for-jobs-that-call-a-reusable-workflow
 */
export type ReusableJobState<
  P extends string,
  J extends string,
  N extends Record<string, readonly string[]> = Record<never, never>,
  M extends object = Record<never, never>,
  V extends string = string,
  S extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = {
  /** Sets the condition deciding whether this job runs. GitHub evaluates it before matrix expansion. A success() check is implicit unless the expression contains a status-check function.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  when(
    value: Field<
      "jobs.<job_id>.if",
      N,
      Record<never, never>,
      Record<never, never>,
      V,
      S,
      InputValues
    >,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<const Shape extends object>(
    value: (
      context: Scope<
        "jobs.<job_id>.strategy",
        N,
        Record<never, never>,
        Record<never, never>,
        V,
        S,
        InputValues
      >,
    ) => Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       */
      matrix: Expression<Shape>;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       */
      failFast?: boolean;
    }>,
  ): ReusableJobState<P, J, N, Shape, V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<
    const Axes extends Readonly<
      Record<
        string,
        readonly string[] | Expression<readonly string[]> | RawExpression
      >
    >,
  >(
    value: (
      context: Scope<
        "jobs.<job_id>.strategy",
        N,
        Record<never, never>,
        Record<never, never>,
        V,
        S,
        InputValues
      >,
    ) => Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       */
      matrix: Axes;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       */
      failFast?: boolean;
    }>,
  ): ReusableJobState<
    P,
    J,
    N,
    {
      readonly [K in keyof Axes]: Axes[K] extends readonly (infer X)[] ? X
        : Axes[K] extends Expression<infer A>
          ? A extends readonly (infer X)[] ? X : string
        : string;
    },
    V,
    S,
    InputValues
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<const Rows extends readonly Readonly<Record<string, MatrixValue>>[]>(
    value: Readonly<
      {
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         */
        matrix: Readonly<{
          /** Objects added to the matrix. With no other axes, each object defines one complete job combination; fields become matrix.<field> runtime values.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrixinclude
           */
          include: Rows;
        }>;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         */
        failFast?: boolean;
      }
    >,
  ): ReusableJobState<P, J, N, Rows[number], V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   */
  strategy<const Axes extends Readonly<Record<string, readonly string[]>>>(
    value: Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       */
      matrix: Axes;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       */
      failFast?: boolean;
    }>,
  ): ReusableJobState<
    P,
    J,
    N,
    { readonly [K in keyof Axes]: Axes[K][number] },
    V,
    S,
    InputValues
  >;
  /** Sets the job display name shown in the run UI. Expressions can distinguish matrix members; omission uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name(
    value:
      | string
      | Field<
        "jobs.<job_id>.name",
        N,
        Record<never, never>,
        M,
        V,
        S,
        InputValues
      >,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Sets this job's GITHUB_TOKEN permissions, overriding the workflow map. Once any permission is specified, all unspecified permissions become none. Repository, organization and fork policies can reduce effective access.
   * Tsugiori: supports contents, id-token, actions and pull-requests; scenarios do not verify authorization.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
   */
  permissions(
    value: WorkflowPermissions,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Allows at most one running member of a group in this repository. A new pending member normally replaces the old pending member; cancelInProgress also cancels the running member.
   * Tsugiori: queue max requires cancellation disabled; scenarios do not schedule.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency
   */
  concurrency(
    value: Readonly<
      {
        /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        group: Field<
          "jobs.<job_id>.concurrency",
          N,
          Record<never, never>,
          M,
          V,
          S,
          InputValues
        >;
        /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        cancelInProgress: boolean;
        /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         */
        queue?: "max";
      }
    >,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Runs a reusable workflow as this job. The caller passes declared inputs through with and secrets through a map or inherit; the callee returns workflow outputs through needs.<caller_job>.outputs. Caller workflow env is not forwarded.
   * Tsugiori: requires the callee in the same config and validates its explicit contract; inherit cannot prove GitHub secret availability.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
   */
  call<const C extends WorkflowCall, O extends string>(
    /** A reusable workflow runs as a separate workflow with its own jobs and steps.
     * Tsugiori: retains the local pipeline definition for typed validation and scenario interpretation.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    callee: ReusablePipeline<C, O>,
    args:
      | WorkflowCallArguments<C>
      | ((
        context:
          & Scope<
            "jobs.<job_id>.with.<with_id>",
            N,
            Record<never, never>,
            M,
            V,
            S,
            InputValues
          >
          & Pick<
            Scope<
              "jobs.<job_id>.secrets.<secrets_id>",
              N,
              Record<never, never>,
              M,
              V,
              S,
              InputValues
            >,
            "secrets"
          >,
      ) => WorkflowCallArguments<C>),
  ): FinalizedJobState<P, J, readonly O[], Record<never, never>, M>;
  /** Runs a reusable workflow referenced by owner/repository/.github/workflows/file@ref or ./.github/workflows/file. Local paths use the caller commit; external references select a SHA, tag or branch and cannot use expressions.
   * Tsugiori: input/output contracts are caller assertions; scenarios require a call fixture.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   */
  rawCall(
    /** The reusable workflow to invoke: owner/repository/.github/workflows/file@ref or ./.github/workflows/file. Local paths use the caller commit; a SHA pins an external version. Expressions are not allowed.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    uses: string,
    args?:
      | Readonly<
        {
          /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
           */
          with?: ActionInputs;
          /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
           * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
           */
          secrets?:
            | "inherit"
            | Readonly<Record<string, string | Expression<string>>>;
        }
      >
      | ((
        context:
          & Scope<
            "jobs.<job_id>.with.<with_id>",
            N,
            Record<never, never>,
            M,
            V,
            S,
            InputValues
          >
          & Pick<
            Scope<
              "jobs.<job_id>.secrets.<secrets_id>",
              N,
              Record<never, never>,
              M,
              V,
              S,
              InputValues
            >,
            "secrets"
          >,
      ) => Readonly<
        {
          /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
           */
          with?: ActionInputs;
          /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
           * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
           */
          secrets?:
            | "inherit"
            | Readonly<Record<string, string | Expression<string>>>;
        }
      >),
  ): FinalizedJobState<P, J, readonly string[], Record<never, never>, M>;
};
/** Choose regular runner execution or a native reusable caller job.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
 */
export interface IndependentJobState<
  PipelineId extends string,
  JobId extends string,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Selects a native caller job; inputs and secrets travel one hop and caller workflow env does not propagate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   */
  reusable(): ReusableJobState<
    PipelineId,
    JobId,
    Record<never, never>,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues
  >;
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Tsugiori: configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Record<never, never>,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues
  >;
}
/** needs supplies status and declared outputs; failed dependencies skip jobs unless a status condition admits them.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
 */
export interface DependentJobState<
  PipelineId extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]>,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Selects a native caller job; inputs and secrets travel one hop and caller workflow env does not propagate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   */
  reusable(): ReusableJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues
  >;
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Tsugiori: configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecutionJobState<
    PipelineId,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues
  >;
}
export interface JobStartState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> extends IndependentJobState<PipelineId, JobId, Vars, Secrets, InputValues> {
  /** Names declared dependencies; unsuccessful dependencies skip execution unless an explicit status condition admits the job.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
   */
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
    Secrets,
    InputValues
  >;
}
export type AvailableJobState<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = keyof Jobs extends never
  ? IndependentJobState<PipelineId, JobId, Vars, Secrets, InputValues>
  : JobStartState<PipelineId, JobId, Jobs, Vars, Secrets, InputValues>;
export type JobDefinitionScope<
  PipelineId extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Readonly<
  {
    job: AvailableJobState<PipelineId, JobId, Jobs, Vars, Secrets, InputValues>;
    jobs: Jobs;
  }
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
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Typed input references; GitHub supplies values and defaults at runtime.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context
   */
  readonly inputs: import("./expression.ts").Ref<
    InputValues,
    "inputs"
  >;
  /** Jobs run independently unless needs declares dependencies. A job id identifies it in dependency and output references; name controls its display label.
   * Tsugiori: adds jobs in declaration order and exposes declared outputs for later definitions.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      PipelineId,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    /** The job identifier used for needs dependencies and output references. It must start with a letter or underscore and contain only letters, digits, hyphens or underscores.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     */
    id: JobId,
    define: (
      scope: JobDefinitionScope<
        PipelineId,
        JobId,
        Record<never, never>,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Record<never, never>, Result>,
    Vars,
    Secrets,
    C,
    O,
    InputValues
  >;
}
export interface NonEmptyPipelineState<
  PipelineId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Typed input references; GitHub supplies values and defaults at runtime.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context
   */
  readonly inputs: import("./expression.ts").Ref<
    InputValues,
    "inputs"
  >;
  readonly [workflowContract]: Readonly<{ call: C; outputs: readonly O[] }>;
  /** Defines reusable workflow outputs mapped to outputs of jobs within the callee. Callers read them as needs.<caller_job>.outputs.<name>.
   * Tsugiori: exposes typed callee job references and only allows this on reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
   */
  workflowOutputs<
    const Values extends Readonly<Record<string, ExpressionInput>>,
  >(
    define: (
      context: Readonly<
        {
          jobs: {
            readonly [K in keyof Jobs]: import("./expression.ts").Ref<
              import("./expression.ts").JobContext<
                Jobs[K]["outputNames"],
                never,
                `jobs.${K & string}`
              >,
              `jobs.${K & string}`
            >;
          };
        }
      >,
    ) => Values,
  ): NonEmptyPipelineState<
    PipelineId,
    Jobs,
    Vars,
    Secrets,
    C,
    keyof Values & string,
    InputValues
  >;
  readonly [pipelineDefinition]: AuthoringPipeline;
  readonly [testPipelineShape]?: Jobs;
  /** Jobs run independently unless needs declares dependencies. A job id identifies it in dependency and output references; name controls its display label.
   * Tsugiori: adds jobs in declaration order and exposes declared outputs for later definitions.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      PipelineId,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    /** The unique job identifier used in needs dependencies and output/result references. It must start with a letter or underscore and contain only letters, digits, hyphens or underscores.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     */
    id: AvailableJobId<JobId, Jobs>,
    define: (
      scope: JobDefinitionScope<
        PipelineId,
        JobId,
        Jobs,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): NonEmptyPipelineState<
    PipelineId,
    AddJobReference<PipelineId, JobId, Jobs, Result>,
    Vars,
    Secrets,
    C,
    O,
    InputValues
  >;
}

type PipelineDraft = Readonly<{
  id: string;
  name: string;
  output: string;
  on: PipelineTriggers;
  runName?: string;
  env?: EnvironmentVariables;
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
  runsOn?: string | NonEmptyReadonlyArray<string>;
  options?: JobOptions;
  needs: readonly string[];
  steps: readonly AuthoringStep[];
  references: StepReferences;
  contracts: ReadonlyMap<string, ReferenceBinding>;
  proofPaths: ReadonlySet<string>;
  outputContracts?: Readonly<Record<string, ReferenceBinding>>;
}>;

/** A workflow defines event triggers and jobs in a YAML file under .github/workflows.
 * Tsugiori: constructs immutable authoring state; expressions and step bodies are not executed during generation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 */
export function definePipeline<
  const PipelineId extends string,
  const On extends PipelineTriggers,
  const Vars extends readonly string[] | undefined = undefined,
  const Secrets extends readonly string[] | undefined = undefined,
>(
  id: PipelineId,
  options:
    & PipelineOptions<On, Vars, Secrets>
    & Readonly<{
      vars?: LiteralNames<Vars>;
      secrets?: LiteralNames<Secrets>;
    }>,
): EmptyPipelineState<
  PipelineId,
  Names<Vars>,
  Names<Secrets>,
  PipelineCall<On>,
  PipelineOutputNames<On>,
  PipelineInputValues<On>
> {
  if (
    !isRecord(options.on) || Array.isArray(options.on) ||
    Object.keys(options.on).length === 0
  ) {
    throw new TypeError(
      "Pipeline on must be a nonempty event settings object.",
    );
  }
  for (
    const field of [
      "events",
      "pushBranches",
      "pushTags",
      "pullRequestTypes",
      "pullRequestTargetTypes",
      "workflowDispatchInputs",
      "workflowCall",
      "workflowCallOutputs",
    ]
  ) {
    if (Object.hasOwn(options, field)) {
      throw new TypeError(
        `Unsupported pipeline option ${field}. Use on event settings.`,
      );
    }
  }
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
    on: copyNative(options.on),
    runName: options.runName,
    env: options.env && Object.freeze({ ...options.env }),
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
    Names<Secrets>,
    PipelineCall<On>,
    PipelineOutputNames<On>,
    PipelineInputValues<On>
  >;
}

/** Materializes completed pipeline definitions; generation validates caller/callee configuration membership.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobs
 */
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
    inputs: scope("jobs.<job_id>.with.<with_id>").inputs,
    [workflowContract]: Object.freeze({
      call: draft.on.workflow_call ?? {},
      outputs: Object.freeze(
        Object.keys(draft.on.workflow_call?.outputs ?? {}),
      ),
    }),
    workflowOutputs(
      define: (context: unknown) => Record<string, ExpressionInput>,
    ) {
      if (!draft.on.workflow_call) {
        throw new TypeError("Workflow outputs require workflow_call.");
      }
      const values = define(
        scope("on.workflow_call.outputs.<output_id>.value"),
      );
      validateActionOutputs(Object.keys(values));
      return createPipelineFacade(
        Object.freeze({
          ...draft,
          on: Object.freeze({
            ...draft.on,
            workflow_call: Object.freeze({
              ...draft.on.workflow_call,
              outputs: Object.freeze(
                Object.fromEntries(
                  Object.entries(values).map((
                    [k, v],
                  ) => [k, Object.freeze({ value: emitExpression(v) })]),
                ),
              ),
            }),
          }),
        }),
        true,
      );
    },
    job(
      id: string,
      define: (
        scope: JobDefinitionScope<
          string,
          string,
          JobReferences,
          string,
          string,
          Readonly<Record<string, string>>
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
      }) as JobDefinitionScope<
        string,
        string,
        JobReferences,
        string,
        string,
        Readonly<Record<string, string>>
      >);
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
function evaluateScalar(
  key: import("./expression_scope.ts").GitHubExpressionScopeKey,
  value: unknown,
): string {
  return typeof value === "string" ? value : evaluateField(key, value);
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
  key: import("./expression_scope.ts").GitHubExpressionScopeKey =
    "jobs.<job_id>.steps.env",
): EnvironmentVariables | undefined {
  if (value === undefined) return undefined;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map((
        [name, entry],
      ) => [
        name,
        typeof entry === "function"
          ? evaluateField(key, entry)
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
  | JobStartState<
    string,
    string,
    JobReferences,
    string,
    string,
    Readonly<Record<string, string>>
  > {
  const start = (value: JobDraft) => ({
    runsOn: (runner: string | NonEmptyReadonlyArray<string>) =>
      createExecutionJobFacade(Object.freeze({ ...value, runsOn: runner })),
    reusable: () => createReusableJobFacade(value),
  });
  return Object.freeze({
    ...start(draft),
    ...(dependenciesAvailable
      ? {
        needs: (...dependencies: readonly JobReference[]) =>
          Object.freeze(start(Object.freeze({
            ...draft,
            needs: Object.freeze(dependencies.map((d) => d.id)),
            contracts: new Map(dependencies.flatMap((d) =>
              Object.entries(d.contracts ?? {}).map(([name, contract]) =>
                [
                  referencePath(
                    referencePath(referencePath("needs", d.id), "outputs"),
                    name,
                  ),
                  contract,
                ] as const
              )
            )),
          }))),
      }
      : {}),
  }) as JobStartState<
    string,
    string,
    JobReferences,
    string,
    string,
    Readonly<Record<string, string>>
  >;
}
function createReusableJobFacade(
  draft: JobDraft,
): ReusableJobState<string, string> {
  const update = (key: keyof JobOptions, value: unknown) =>
    createReusableJobFacade(
      Object.freeze({ ...draft, options: { ...draft.options, [key]: value } }),
    );
  const invoke = (
    uses: string,
    args: unknown,
    callee?: AuthoringPipeline,
    names: readonly string[] = [],
  ): FinalizedJobState<string, string, readonly string[]> => {
    const value = typeof args === "function"
      ? args({
        ...scope("jobs.<job_id>.with.<with_id>"),
        ...scope("jobs.<job_id>.secrets.<secrets_id>"),
      })
      : args ?? {};
    validateCallExpressionInputs(value.with);
    const job: AuthoringJob = Object.freeze({
      id: draft.id,
      needs: draft.needs,
      ...draft.options,
      uses,
      with: value.with && copyActionInputs(value.with),
      callSecrets: value.secrets === "inherit"
        ? "inherit"
        : evaluateEnv(value.secrets),
      callee,
      steps: Object.freeze([]),
    });
    return Object.freeze({
      [jobDefinition]: Object.freeze({
        pipelineId: draft.pipelineId,
        jobId: draft.id,
        owner: draft.owner,
        job,
        outputNames: Object.freeze([...names]),
        contracts: Object.freeze({}),
      }),
    });
  };
  return Object.freeze({
    when: (v: unknown) => update("if", evaluateField("jobs.<job_id>.if", v)),
    strategy: (v: unknown) => update("strategy", renderStrategy(v)),
    name: (v: unknown) =>
      update("name", evaluateScalar("jobs.<job_id>.name", v)),
    permissions: (v: WorkflowPermissions) =>
      update("permissions", copyPermissions(v)),
    concurrency: (
      v: { group: unknown; cancelInProgress: boolean; queue?: "max" },
    ) =>
      update("concurrency", {
        ...v,
        group: evaluateField("jobs.<job_id>.concurrency", v.group),
      }),
    call: (callee: ReusablePipeline, args: unknown) => {
      const pipeline = callee[pipelineDefinition];
      if (!pipeline.on.workflow_call) {
        throw new TypeError("Called pipeline must declare workflow_call.");
      }
      return invoke(
        `./${pipeline.output}`,
        args,
        pipeline,
        callee[workflowContract].outputs,
      );
    },
    rawCall: (uses: string, args: unknown) => invoke(uses, args),
  }) as ReusableJobState<string, string>;
}
function renderStrategy(value: unknown): NonNullable<JobOptions["strategy"]> {
  const definition = typeof value === "function"
    ? value(scope("jobs.<job_id>.strategy"))
    : value;
  const matrix = definition.matrix instanceof Expression
    ? emitExpression(definition.matrix)
    : typeof definition.matrix === "string"
    ? definition.matrix
    : Object.fromEntries(
      Object.entries(definition.matrix).map((
        [key, axis],
      ) => [key, axis instanceof Expression ? emitExpression(axis) : axis]),
    );
  return Object.freeze({
    matrix: typeof matrix === "string"
      ? matrix
      : copyNative(matrix as StaticMatrix),
    ...(definition.failFast === undefined
      ? {}
      : { failFast: definition.failFast }),
  });
}
function createExecutionJobFacade(
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
): ExecutionJobState<string, string> {
  return Object.freeze({
    runsOn: (v: unknown) => {
      const runner = typeof v === "function"
        ? v(scope("jobs.<job_id>.runs-on"))
        : v;
      return createExecutionJobFacade({
        ...draft,
        runsOn: runner instanceof Expression
          ? emitExpression(runner)
          : runner as string | NonEmptyReadonlyArray<string>,
      });
    },
    name: (v: unknown) =>
      createExecutionJobFacade({
        ...draft,
        options: {
          ...draft.options,
          name: evaluateScalar("jobs.<job_id>.name", v),
        },
      }),
    env: (
      v: StepEnv<
        Record<never, never>,
        Record<never, never>,
        Record<never, never>,
        string,
        string,
        Readonly<Record<string, string>>
      >,
    ) =>
      createExecutionJobFacade({
        ...draft,
        options: { ...draft.options, env: evaluateEnv(v, "jobs.<job_id>.env") },
      }),
    defaultsRun: (v: { shell?: unknown; workingDirectory?: unknown }) =>
      createExecutionJobFacade({
        ...draft,
        options: {
          ...draft.options,
          defaults: Object.freeze(
            Object.fromEntries(
              Object.entries(v).map((
                [k, x],
              ) => [k, evaluateScalar("jobs.<job_id>.defaults.run", x)]),
            ),
          ),
        },
      }),
    when: (value: unknown) => {
      const condition = evaluateCondition("jobs.<job_id>.if", value);
      return createExecutionJobFacade(Object.freeze({
        ...draft,
        proofPaths: condition.proofPaths,
        options: { ...draft.options, if: condition.rendered },
      }));
    },
    strategy: (value: unknown) =>
      createExecutionJobFacade({
        ...draft,
        options: { ...draft.options, strategy: renderStrategy(value) },
      }),
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
    timeoutMinutes: (value: number | ExpressionInput) =>
      createExecutionJobFacade(
        Object.freeze({
          ...draft,
          options: {
            ...draft.options,
            timeoutMinutes: typeof value === "number"
              ? value
              : evaluateField("jobs.<job_id>.timeout-minutes", value),
          },
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
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
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
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
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
    timeoutMinutes?: unknown;
  },
): {
  if?: string;
  env?: EnvironmentVariables;
  continueOnError?: boolean;
  timeoutMinutes?: number | string;
} {
  return {
    ...(definition.timeoutMinutes === undefined ? {} : {
      timeoutMinutes: typeof definition.timeoutMinutes === "number"
        ? definition.timeoutMinutes
        : evaluateField(
          "jobs.<job_id>.steps.timeout-minutes",
          definition.timeoutMinutes,
        ),
    }),
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
    ...(definition.shell === undefined ? {} : { shell: definition.shell }),
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
    timeoutMinutes: definition.timeoutMinutes,
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
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
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
    on: draft.on,
    runName: draft.runName,
    env: draft.env,
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
    if (!["contents", "id-token", "pull-requests", "actions"].includes(key)) {
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

function copyNative<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(copyNative)) as T;
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, copyNative(v)]),
      ),
    ) as T;
  }
  return value;
}

function validateCallExpressionInputs(values: ActionInputs | undefined): void {
  const allowed = new Set([
    "github",
    "needs",
    "strategy",
    "matrix",
    "inputs",
    "vars",
  ]);
  const visit = (node: Expression<unknown>["node"]): void => {
    if (node.kind === "path" && !allowed.has(node.value.split(/[.\[]/, 1)[0])) {
      throw new TypeError(
        "Reusable workflow input expression uses a context unavailable at jobs.with.",
      );
    }
    if (node.kind === "binary") {
      visit(node.left);
      visit(node.right);
    }
    if (node.kind === "unary") visit(node.value);
    if (node.kind === "call") node.args.forEach(visit);
  };
  for (const value of Object.values(values ?? {})) {
    if (value instanceof Expression) visit(value.node);
  }
}
