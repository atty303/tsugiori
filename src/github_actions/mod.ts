import type { ActionContract, ActionContractInput } from "./action_contract.ts";
export type {
  ActionContract,
  ActionContractInput,
  ActionContractOutput,
} from "./action_contract.ts";
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
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {}, pull_request: {} },
 * });
 * ```
 */
export type WorkflowEvent =
  | "pull_request"
  | "pull_request_target"
  | "push"
  | "workflow_dispatch"
  | "workflow_call";
/** Manual workflow dispatch accepts named inputs and displays them in the run form. choice inputs use a single selection and return a string. GitHub allows at most 10 top-level inputs with a total payload of 65,535 characters.
 * Tsugiori: supports string and choice inputs; other GitHub dispatch input types are not implemented.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
 * @example
 * ```ts
 * const value = {
 *   type: "choice",
 *   description: "Deployment stage",
 *   required: true,
 *   options: ["dev", "prd"],
 *   default: "dev",
 * } satisfies WorkflowDispatchInput;
 * ```
 */
export type WorkflowDispatchInput =
  & Readonly<{
    /** A human-readable explanation of this input, secret or output for workflow authors.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     * @example
     * ```ts
     * const value = {
     *   type: "choice",
     *   description: "Deployment stage",
     *   required: true,
     *   options: ["dev", "prd"],
     *   default: "dev",
     * } satisfies WorkflowDispatchInput;
     * ```
     */
    description?: string;
    /** Whether the caller must supply this value. Defaults to false when omitted.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     * @example
     * ```ts
     * const value = {
     *   type: "choice",
     *   description: "Deployment stage",
     *   required: true,
     *   options: ["dev", "prd"],
     *   default: "dev",
     * } satisfies WorkflowDispatchInput;
     * ```
     */
    required?: boolean;
  }>
  & (
    | Readonly<{
      /** The input value type. choice displays a single-selection list and produces a string; string accepts text.
       * Tsugiori: boolean, number and environment dispatch inputs are not supported.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       * @example
       * ```ts
       * const value = {
       *   type: "string",
       *   default: "dev",
       * } satisfies WorkflowDispatchInput;
       * ```
       */
      type: "string";
      /** The preselected or initial value on the manual-run form when the caller does not supply one. For choice inputs, use one of options.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
       * @example
       * ```ts
       * const value = {
       *   type: "string",
       *   default: "dev",
       * } satisfies WorkflowDispatchInput;
       * ```
       */
      default?: string;
    }>
    | Readonly<{
      /** The input value type. choice displays a single-selection list and produces a string; string accepts text.
       * Tsugiori: boolean, number and environment dispatch inputs are not supported.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       * @example
       * ```ts
       * const value = {
       *   type: "choice",
       *   description: "Deployment stage",
       *   required: true,
       *   options: ["dev", "prd"],
       *   default: "dev",
       * } satisfies WorkflowDispatchInput;
       * ```
       */
      type: "choice";
      /** The choices displayed in the manual-run UI. The selected choice is a string input value.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputsinput_idtype
       * @example
       * ```ts
       * const value = {
       *   type: "choice",
       *   description: "Deployment stage",
       *   required: true,
       *   options: ["dev", "prd"],
       *   default: "dev",
       * } satisfies WorkflowDispatchInput;
       * ```
       */
      options: readonly string[];
      /** The preselected or initial value on the manual-run form when the caller does not supply one. For choice inputs, use one of options.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
       * @example
       * ```ts
       * const value = {
       *   type: "choice",
       *   description: "Deployment stage",
       *   required: true,
       *   options: ["dev", "prd"],
       *   default: "dev",
       * } satisfies WorkflowDispatchInput;
       * ```
       */
      default?: string;
    }>
  );
/** For each GITHUB_TOKEN permission, read grants read-only access, write grants read and write access, and none disables access. Once any permission is specified, unspecified permissions become none.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
 * @example
 * ```ts
 * const value = {
 *   contents: "read",
 *   "id-token": "write",
 *   "pull-requests": "read",
 *   actions: "read",
 * } satisfies WorkflowPermissions;
 * ```
 */
export type PermissionLevel = "none" | "read" | "write";
/** OIDC uses write to allow token requests, or none to disable them; it has no read level.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
 * @example
 * ```ts
 * const value = {
 *   contents: "read",
 *   "id-token": "write",
 *   "pull-requests": "read",
 *   actions: "read",
 * } satisfies WorkflowPermissions;
 * ```
 */
export type OidcPermissionLevel = "none" | "write";
/** GITHUB_TOKEN permission settings for workflows and jobs.
 * @example
 * ```ts
 * const value = { contents: "read" } satisfies WorkflowPermissions;
 * ```
 */
export type WorkflowPermissions = Readonly<{
  /** Controls GITHUB_TOKEN access to repository contents: read allows checkout; write allows content changes and releases.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   * @example
   * ```ts
   * const value = { contents: "read" } satisfies WorkflowPermissions;
   * ```
   */
  contents?: PermissionLevel;
  /** Allows requesting an OpenID Connect token for authentication to an external provider. write permits token requests, not writes to that provider.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   * @example
   * ```ts
   * const value = { "id-token": "write" } satisfies WorkflowPermissions;
   * ```
   */
  "id-token"?: OidcPermissionLevel;
  /** Controls GITHUB_TOKEN access to pull requests, including reading metadata or writing labels and comments.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   * @example
   * ```ts
   * const value = { "pull-requests": "read" } satisfies WorkflowPermissions;
   * ```
   */
  "pull-requests"?: PermissionLevel;
  /** Controls GITHUB_TOKEN access to GitHub Actions, including reading runs or cancelling workflow runs with write.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   * @example
   * ```ts
   * const value = { actions: "read" } satisfies WorkflowPermissions;
   * ```
   */
  actions?: PermissionLevel;
}>;
/** Reusable input defaults are literals; GitHub supplies false, 0 or an empty string when omitted.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
 * @example
 * ```ts
 * const value = {
 *   type: "string",
 *   description: "Release version",
 *   required: true,
 *   default: "latest",
 * } satisfies WorkflowCallInput;
 * ```
 */
export type WorkflowCallInput =
  & Readonly<{
    /** A human-readable explanation of this input, secret or output for workflow authors.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
     * @example
     * ```ts
     * const value = {
     *   type: "string",
     *   description: "Release version",
     *   required: true,
     *   default: "latest",
     * } satisfies WorkflowCallInput;
     * ```
     */
    description?: string;
    /** Whether the caller must supply this value. Defaults to false when omitted.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
     * @example
     * ```ts
     * const value = {
     *   type: "string",
     *   description: "Release version",
     *   required: true,
     *   default: "latest",
     * } satisfies WorkflowCallInput;
     * ```
     */
    required?: boolean;
  }>
  & (
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       * @example
       * ```ts
       * const value = { type: "string", default: "latest" } satisfies WorkflowCallInput;
       * ```
       */
      type: "string";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       * @example
       * ```ts
       * const value = { type: "string", default: "latest" } satisfies WorkflowCallInput;
       * ```
       */
      default?: string;
    }>
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       * @example
       * ```ts
       * const value = { type: "boolean", default: false } satisfies WorkflowCallInput;
       * ```
       */
      type: "boolean";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       * @example
       * ```ts
       * const value = { type: "boolean", default: false } satisfies WorkflowCallInput;
       * ```
       */
      default?: boolean;
    }>
    | Readonly<{
      /** The primitive type required for this reusable input: string, boolean or number. The caller must supply a value of the same type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputsinput_idtype
       * @example
       * ```ts
       * const value = { type: "number", default: 1 } satisfies WorkflowCallInput;
       * ```
       */
      type: "number";
      /** The input value used when none is supplied. Reusable workflows without a default receive an empty string, false or 0 according to the input type.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
       * @example
       * ```ts
       * const value = { type: "number", default: 1 } satisfies WorkflowCallInput;
       * ```
       */
      default?: number;
    }>
  );
/** A reusable workflow declares inputs and secrets accepted from its caller. Required secrets must be supplied; declaring a secret does not grant access to it.
 * Tsugiori: validates explicit local call contracts, but cannot verify repository authorization.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
 * @example
 * ```ts
 * const value = {
 *   type: "string",
 *   description: "Release version",
 *   required: true,
 *   default: "latest",
 * } satisfies WorkflowCallInput;
 * ```
 */
export type WorkflowCall = Readonly<{
  /** Named typed values accepted by this reusable workflow. The caller supplies them with with; undeclared names or mismatched primitive types are invalid.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callinputs
   * @example
   * ```ts
   * const value = {
   *   inputs: { version: { type: "string", required: true } },
   *   secrets: { token: { description: "Release token", required: true } },
   * } satisfies WorkflowCall;
   * ```
   */
  inputs?: Readonly<Record<string, WorkflowCallInput>>;
  /** Named secrets the caller may pass to this reusable workflow. Undeclared explicit secrets cause an error; inherit permits using inherited secrets without a declaration. Environment secrets are selected by a callee job environment rather than passed via workflow_call.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
   * @example
   * ```ts
   * const value = {
   *   inputs: { version: { type: "string", required: true } },
   *   secrets: { token: { description: "Release token", required: true } },
   * } satisfies WorkflowCall;
   * ```
   */
  secrets?: Readonly<
    Record<
      string,
      Readonly<{
        /** A description of the secret expected by this reusable workflow.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecrets
         * @example
         * ```ts
         * const value = {
         *   inputs: { version: { type: "string", required: true } },
         *   secrets: { token: { description: "Release token", required: true } },
         * } satisfies WorkflowCall;
         * ```
         */
        description?: string;
        /** Whether the caller must supply this secret. Defaults to false.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_callsecretssecret_idrequired
         * @example
         * ```ts
         * const value = {
         *   inputs: { version: { type: "string", required: true } },
         *   secrets: { token: { description: "Release token", required: true } },
         * } satisfies WorkflowCall;
         * ```
         */
        required?: boolean;
      }>
    >
  >;
}>;
/** Outputs returned by a reusable workflow are available to downstream jobs in its caller. Each output has an identifier, optional description and value mapped to a job output within the callee.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
 * @example
 * ```ts
 * const reusable = defineWorkflow(".github/workflows/release.yml", {
 *   on: { workflow_call: { inputs: {
 *     version: { type: "string", required: true },
 *   }, outputs: { version: { description: "Built version", value: "${{ jobs.build.outputs.version }}" } } } },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build", name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })));
 * ```
 */
export type WorkflowCallOutputs = Readonly<
  Record<
    string,
    Readonly<{
      /** A human-readable explanation of this input, secret or output for workflow authors.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       * @example
       * ```ts
       * const value = {
       *   inputs: { version: { type: "string", required: true } },
       *   secrets: { token: { description: "Release token", required: true } },
       * } satisfies WorkflowCall;
       * ```
       */
      description?: string;
      /** The expression defining the workflow output, usually a job output such as `${{ jobs.build.outputs.version }}`. The caller reads it through `needs.<caller_job>.outputs`.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       * @example
       * ```ts
       * const reusable = defineWorkflow(".github/workflows/release.yml", {
       *   on: { workflow_call: { inputs: {
       *     version: { type: "string", required: true },
       *   }, outputs: { version: { description: "Built version", value: "${{ jobs.build.outputs.version }}" } } } },
       * }).job("build", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     id: "build", name: "Build",
       *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
       *     outputs: ["version"],
       *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })));
       * ```
       */
      value: string;
    }>
  >
>;
/** Supported native trigger settings; use an object even for an event without settings.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: {
 *     push: { branches: ["main"], tags: ["v*"] },
 *     pull_request: { types: ["opened", "synchronize"] },
 *     pull_request_target: { types: ["labeled"] },
 *   },
 * });
 * ```
 */
export type WorkflowTriggers = Readonly<{
  /** Push trigger settings. Use an empty object for every push.
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * });
   * ```
   */
  push?: Readonly<{
    /** Branch-name patterns that allow push runs, for example main or releases/**. Patterns can contain ! exclusions; order matters. If only branches are configured, tag pushes do not trigger the workflow.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: {
     *     push: { branches: ["main"], tags: ["v*"] },
     *     pull_request: { types: ["opened", "synchronize"] },
     *     pull_request_target: { types: ["labeled"] },
     *   },
     * });
     * ```
     */
    branches?: readonly string[];
    /** Tag-name patterns that allow push runs, for example v*. Patterns can contain glob syntax and ! exclusions; order matters. If only tags are configured, branch pushes do not trigger the workflow.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushbranchestagsbranches-ignoretags-ignore
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: {
     *     push: { branches: ["main"], tags: ["v*"] },
     *     pull_request: { types: ["opened", "synchronize"] },
     *     pull_request_target: { types: ["labeled"] },
     *   },
     * });
     * ```
     */
    tags?: readonly string[];
  }>;
  /** Pull request trigger settings.
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { pull_request: { types: ["opened", "synchronize"] } },
   * });
   * ```
   */
  pull_request?: Readonly<{
    /** Pull request activities that trigger runs, such as opened, synchronize or labeled. When omitted, GitHub uses opened, synchronize and reopened. Code executes in the pull request merge context.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onevent_nametypes
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: {
     *     push: { branches: ["main"], tags: ["v*"] },
     *     pull_request: { types: ["opened", "synchronize"] },
     *     pull_request_target: { types: ["labeled"] },
     *   },
     * });
     * ```
     */
    types?: readonly string[];
  }>;
  /** Pull request trigger in the base-repository context.
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { pull_request_target: { types: ["labeled"] } },
   * });
   * ```
   */
  pull_request_target?: Readonly<{
    /** Pull request activities that trigger runs in the base-repository context. When omitted, GitHub uses opened, synchronize and reopened. This context may expose base-repository secrets and a write token: do not execute untrusted pull request code.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onevent_nametypes
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: {
     *     push: { branches: ["main"], tags: ["v*"] },
     *     pull_request: { types: ["opened", "synchronize"] },
     *     pull_request_target: { types: ["labeled"] },
     *   },
     * });
     * ```
     */
    types?: readonly string[];
  }>;
  /** Manual trigger with typed input declarations.
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: {
   *     workflow_dispatch: {
   *       inputs: { stage: { type: "choice", options: ["dev", "prd"] } },
   *     },
   *   },
   * });
   * ```
   */
  workflow_dispatch?: Readonly<{
    /** Named inputs shown on the manual-run form and accepted by workflow dispatch. Values are available in inputs and github.event.inputs. The workflow must exist on the default branch to receive this event.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: {
     *     workflow_dispatch: {
     *       inputs: {
     *         stage: { type: "choice", options: ["dev", "prd"], default: "dev" },
     *       },
     *     },
     *   },
     * });
     * ```
     */
    inputs?: Readonly<Record<string, WorkflowDispatchInput>>;
  }>;
  /** Reusable workflow trigger and caller contract.
   * @example
   * ```ts
   * const reusable = defineWorkflow(".github/workflows/release.yml", {
   *   on: {
   *     workflow_call: {
   *       inputs: {
   *         version: { type: "string", required: true },
   *       },
   *     },
   *   },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
   * ```
   */
  workflow_call?:
    & WorkflowCall
    & Readonly<{
      /** Workflow outputs returned to the caller. Map each output to a job output from this workflow; the caller reads needs.<caller_job>.outputs.<name>.
       * Tsugiori: workflowOutputs() provides typed job references as an alternative to raw expression strings.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
       * @example
       * ```ts
       * const reusable = defineWorkflow(".github/workflows/release.yml", {
       *   on: {
       *     workflow_call: {
       *       inputs: {
       *         version: { type: "string", required: true },
       *       },
       *     },
       *   },
       * }).job("build", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     id: "build",
       *     name: "Build",
       *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
       *     outputs: ["version"],
       *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
       *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
       * ```
       */
      outputs?: WorkflowCallOutputs;
    }>;
}>;
type ExactTriggers<On extends WorkflowTriggers> = On extends readonly unknown[]
  ? never
  : {
    [E in keyof On]: E extends keyof WorkflowTriggers ?
        & On[E]
        & Record<
          Exclude<keyof On[E], keyof NonNullable<WorkflowTriggers[E]>>,
          never
        >
      : never;
  };
type NonEmptyTriggers = {
  [K in keyof WorkflowTriggers]-?:
    & WorkflowTriggers
    & Required<Pick<WorkflowTriggers, K>>;
}[keyof WorkflowTriggers];
type TriggerInputs<T> = T extends { inputs?: infer I } ? NonNullable<I>
  : Record<never, never>;
type EventInputs<On, E extends keyof On> = TriggerInputs<On[E]>;
type InputNames<On> = { [E in keyof On]-?: keyof EventInputs<On, E> }[keyof On];
type EventInputValue<I, K> = K extends keyof I ? InputValue<I[K]> : "";
/** Missing properties evaluate to an empty string, including on non-input triggers.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#available-contexts
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: {
 *     push: { branches: ["main"], tags: ["v*"] },
 *     pull_request: { types: ["opened", "synchronize"] },
 *     pull_request_target: { types: ["labeled"] },
 *   },
 * });
 * ```
 */
export type WorkflowInputValues<On extends WorkflowTriggers> = {
  readonly [K in InputNames<On>]: {
    [E in keyof On]-?: EventInputValue<EventInputs<On, E>, K>;
  }[keyof On];
};
type CallContractOf<On> = On extends
  { workflow_call: infer C extends WorkflowCall } ? C : Record<never, never>;
type WorkflowOutputNames<On> = On extends
  { workflow_call: { outputs: infer O } } ? keyof O & string : never;

const workflowContract: unique symbol = Symbol("tsugiori.workflow-contract");
/** A completed reusable workflow accepted by call().
 * @example
 * ```ts
 * const reusable = defineWorkflow(".github/workflows/release.yml", {
 *   on: {
 *     workflow_call: {
 *       inputs: {
 *         version: { type: "string", required: true },
 *       },
 *     },
 *   },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
 * const caller = defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "release",
 *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
 * );
 * defineProject({ workflows: [reusable, caller] });
 * ```
 */
export type ReusableWorkflow<
  C extends WorkflowCall = WorkflowCall,
  O extends string = string,
> = TestableWorkflow & {
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
 * @example
 * ```ts
 * const reusable = defineWorkflow(".github/workflows/release.yml", {
 *   on: {
 *     workflow_call: {
 *       inputs: {
 *         version: { type: "string", required: true },
 *       },
 *     },
 *   },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
 * const caller = defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "release",
 *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
 * );
 * defineProject({ workflows: [reusable, caller] });
 * ```
 */
export type WorkflowCallArguments<C extends WorkflowCall> = Readonly<
  & (RequiredKeys<CallInputs<C>> extends never ? {
      /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
       * @example
       * ```ts
       * const reusable = defineWorkflow(".github/workflows/release.yml", {
       *   on: {
       *     workflow_call: {
       *       inputs: {
       *         version: { type: "string", required: true },
       *       },
       *     },
       *   },
       * }).job("build", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     id: "build",
       *     name: "Build",
       *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
       *     outputs: ["version"],
       *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
       *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       * }).job(
       *   "release",
       *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
       * );
       * defineProject({ workflows: [reusable, caller] });
       * ```
       */
      with?: CallValues<C>;
    }
    : {
      /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
       * @example
       * ```ts
       * const reusable = defineWorkflow(".github/workflows/release.yml", {
       *   on: {
       *     workflow_call: {
       *       inputs: {
       *         version: { type: "string", required: true },
       *       },
       *     },
       *   },
       * }).job("build", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     id: "build",
       *     name: "Build",
       *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
       *     outputs: ["version"],
       *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
       *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       * }).job(
       *   "release",
       *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
       * );
       * defineProject({ workflows: [reusable, caller] });
       * ```
       */
      with: CallValues<C>;
    })
  & (RequiredKeys<CallSecrets<C>> extends never ? {
      /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
       * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       * @example
       * ```ts
       * const deploy = defineWorkflow(".github/workflows/deploy.yml", {
       *   on: { workflow_call: { secrets: { token: { required: true } } } },
       * }).job("deploy", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     name: "Deploy",
       *     run: "deploy",
       *     env: { TOKEN: ({ secrets }) => secrets.token },
       *   }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   secrets: ["DEPLOY_TOKEN"],
       * }).job("release", ({ job }) =>
       *   job.reusable().call("./.github/workflows/deploy.yml", deploy, ({ secrets }) => ({
       *     secrets: { token: secrets.DEPLOY_TOKEN },
       *   })));
       * defineProject({ workflows: [deploy, caller] });
       * ```
       */
      secrets?: SecretValues<C> | "inherit";
    }
    : {
      /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
       * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       * @example
       * ```ts
       * const deploy = defineWorkflow(".github/workflows/deploy.yml", {
       *   on: { workflow_call: { secrets: { token: { required: true } } } },
       * }).job("deploy", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     name: "Deploy",
       *     run: "deploy",
       *     env: { TOKEN: ({ secrets }) => secrets.token },
       *   }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   secrets: ["DEPLOY_TOKEN"],
       * }).job("release", ({ job }) =>
       *   job.reusable().call("./.github/workflows/deploy.yml", deploy, ({ secrets }) => ({
       *     secrets: { token: secrets.DEPLOY_TOKEN },
       *   })));
       * defineProject({ workflows: [deploy, caller] });
       * ```
       */
      secrets: SecretValues<C> | "inherit";
    })
>;
/** Job run defaults choose the shell and working directory for run steps. Step-level settings override the job defaults. They do not affect uses steps.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun
 * @example
 * ```ts
 * const value = {
 *   shell: "bash",
 *   workingDirectory: "src",
 * } satisfies RunDefaults;
 * ```
 */
export type RunDefaults = Readonly<
  {
    /** The default command interpreter (for example bash, pwsh or cmd) for run steps in this job. An explicit step value overrides it; this does not configure action steps.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrunshell
     * @example
     * ```ts
     * const value = {
     *   shell: "bash",
     *   workingDirectory: "src",
     * } satisfies RunDefaults;
     * ```
     */
    shell?: string;
    /** The default execution directory, which must exist on the runner for run steps in this job. An explicit step value overrides it; this does not configure action steps.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrunworking-directory
     * @example
     * ```ts
     * const value = {
     *   shell: "bash",
     *   workingDirectory: "src",
     * } satisfies RunDefaults;
     * ```
     */
    workingDirectory?: string;
  }
>;
/** Primitive values in a static matrix.
 * @example
 * ```ts
 * const value = {
 *   os: ["ubuntu-latest", "macos-latest"],
 *   node: [20, 22],
 * } satisfies StaticMatrix;
 * ```
 */
export type MatrixValue = string | number | boolean;
/** Static GitHub matrix axes or include rows.
 * @example
 * ```ts
 * const value = {
 *   include: [{ os: "ubuntu-latest", node: 22 }],
 * } satisfies StaticMatrix;
 * ```
 */
export type StaticMatrix = Readonly<
  Record<
    string,
    | string
    | readonly MatrixValue[]
    | readonly Readonly<Record<string, MatrixValue>>[]
  >
>;
/** A primitive action input or a GitHub runtime expression.
 * @example
 * ```ts
 * const value = { ref: literal("main"), "fetch-depth": "0" } satisfies ActionInputs;
 * ```
 */
export type ActionInput = string | Expression<string>;
type RawCallInputs = Readonly<
  Record<
    string,
    string | number | boolean | Expression<string | number | boolean>
  >
>;
/** An action receives named parameters from the step with map, using the input names declared by the action.
 * Tsugiori: contract names and requiredness are checked without verifying the action implementation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 * @example
 * ```ts
 * const value = { "fetch-depth": "0", ref: literal("main") } satisfies ActionInputs;
 * ```
 */
export type ActionInputs = Readonly<Record<string, ActionInput>>;
/** More-specific job/step values override workflow env; values in one env map cannot refer to each other.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
 * @example
 * ```ts
 * const value = { CI: "true", NODE_ENV: "test" } satisfies EnvironmentVariables;
 * ```
 */
export type EnvironmentVariables = Readonly<Record<string, string>>;
/** Concurrency restricts jobs or workflow runs sharing a group to one running member. By default, a new pending member replaces the existing pending member.
 * Tsugiori: queue max is supported only with cancellation disabled; scenarios do not simulate scheduling.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
 * @example
 * ```ts
 * const value = {
 *   group: "deploy-production",
 *   cancelInProgress: false,
 *   queue: "max",
 * } satisfies Concurrency;
 * ```
 */
export type Concurrency = Readonly<{
  /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   * @example
   * ```ts
   * const value = {
   *   group: "deploy-production",
   *   cancelInProgress: false,
   *   queue: "max",
   * } satisfies Concurrency;
   * ```
   */
  group: string;
  /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   * @example
   * ```ts
   * const value = {
   *   group: "deploy-production",
   *   cancelInProgress: false,
   *   queue: "max",
   * } satisfies Concurrency;
   * ```
   */
  cancelInProgress: boolean;
  /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   * @example
   * ```ts
   * const value = {
   *   group: "deploy-production",
   *   cancelInProgress: false,
   *   queue: "max",
   * } satisfies Concurrency;
   * ```
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
 * @example
 * ```ts
 * const branch = rawExpression("github.ref");
 * ```
 */
export function rawExpression(expression: string): RawExpression {
  if (expression.trim().length === 0) {
    throw new TypeError("GitHub Actions expression must not be empty.");
  }
  return `\${{ ${expression} }}` as RawExpression;
}
/** A tuple with at least one entry.
 * @example
 * ```ts
 * const runners: NonEmptyReadonlyArray<string> = ["self-hosted", "linux"];
 * ```
 */
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
  name?: string;
  /** The reusable workflow invoked by this job: owner/repository/.github/workflows/file@ref or ./.github/workflows/file. A local path uses the caller commit; expressions are not allowed.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   */
  uses: string;
  /** Original action ref, emitted only as a YAML comment. */
  originalRef?: string;
  /** Named input values passed to the action, using the names declared by its metadata.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
   */
  with?: Readonly<Record<string, string>>;
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
     * Tsugiori: retains the local workflow definition for typed validation and scenario interpretation.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    callee?: AuthoringWorkflow;
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
export type AuthoringWorkflow = Readonly<{
  /** The workflow display name in the Actions tab.
   * Tsugiori: omission uses the workflow path rather than GitHub's workflow-file-path fallback.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#name
   */
  name: string;
  /** The workflow YAML file path. GitHub discovers .yml and .yaml files under .github/workflows.
   * Tsugiori: generate writes this path relative to the Deno project directory.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  path: string;
  /** Supported events and their native settings; every configured event can start a separate run.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   */
  on: WorkflowTriggers;
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
export type ProjectConfig = Readonly<{
  kind: "github-actions.project";
  cacheVersion: number;
  workingDirectory: string;
  workflows: readonly AuthoringWorkflow[];
}>;

/** Workflow settings define triggers, names, environment variables and the default token permissions. Reusable workflows exchange inputs, secrets and outputs; workflow environment variables do not cross the call boundary.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 *   permissions: { contents: "read" },
 * });
 * ```
 */
export type WorkflowOptions<
  On extends WorkflowTriggers = NonEmptyTriggers,
  Vars extends readonly string[] | undefined = undefined,
  Secrets extends readonly string[] | undefined = undefined,
> = Readonly<{
  /** The workflow display name in the Actions tab.
   * Tsugiori: omission uses the workflow path rather than GitHub's workflow-file-path fallback.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#name
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   name: "CI",
   * });
   * ```
   */
  name?: string;
  /** Supported event settings. Use {} for an event without settings; shorthand forms are not accepted.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * });
   * ```
   */
  on:
    & On
    & NonEmptyTriggers
    & ExactTriggers<On>
    & Readonly<Record<string, unknown>>;
  /** Repository, organization or environment configuration variables are read through vars.<name>. Unset variables evaluate to an empty string.
   * Tsugiori: this list narrows reference names; it neither creates variables nor changes GitHub configuration.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#vars-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   vars: ["REGION"],
   * });
   * ```
   */
  vars?: Vars;
  /** Repository, organization or environment secrets are read through secrets.<name>. Unset secrets evaluate to an empty string.
   * Tsugiori: this list narrows reference names; it does not create, populate or authorize secrets.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#secrets-context
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   secrets: ["DEPLOY_TOKEN"],
   * });
   * ```
   */
  secrets?: Secrets;
  /** The display name of an individual workflow run. Supports GitHub runtime expressions. When absent or whitespace-only, GitHub uses event-specific information such as a commit message or pull request title.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#run-name
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   runName: "CI for ${{ github.ref_name }}",
   * });
   * ```
   */
  runName?: string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   env: { CI: "true" },
   * });
   * ```
   */
  env?: EnvironmentVariables;
  /** Limits simultaneous workflow runs that share a group in this repository, independently of runner availability. See group, cancelInProgress and queue for replacement/cancellation behavior.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   concurrency: { group: "ci-${{ github.ref }}", cancelInProgress: true },
   * });
   * ```
   */
  concurrency?: Concurrency;
  /** Permissions granted to GITHUB_TOKEN for jobs in this workflow. A job can override this map. Once any permission is specified, unspecified permissions become none; repository and fork policies may further restrict access.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   *   permissions: { contents: "read" },
   * });
   * ```
   */
  permissions?: WorkflowPermissions;
}>;

type LiteralNames<Values extends readonly string[] | undefined> = Values extends
  readonly string[] ? string extends Values[number] ? never
  : Values
  : Values;

type ContractInputs<C extends ActionContract> = C extends
  { inputs: infer I extends Readonly<Record<string, ActionContractInput>> } ? I
  : Record<never, never>;
type ContractOutputs<C extends ActionContract> = C extends
  { outputs: infer O extends object } ? O : Record<never, never>;
type ContractArguments<
  I extends Readonly<Record<string, ActionContractInput>>,
> = keyof I extends never ? Readonly<Record<string, never>> : Readonly<
  & {
    [
      K in keyof I as I[K] extends { required: true }
        ? I[K] extends { default: unknown } ? never : K
        : never
    ]: string | Expression<string>;
  }
  & {
    [
      K in keyof I as I[K] extends { required: true }
        ? I[K] extends { default: unknown } ? K : never
        : K
    ]?: string | Expression<string>;
  }
>;
type ContractOutputNames<O extends object> = readonly (keyof O & string)[] & {
  readonly __actionMetadata: O;
};

/** Declared outputs are available to dependent jobs through needs, not through host-language values.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
 *   id: "checkout", name: "Checkout",
 *   with: ({ github }) => ({ ref: github.sha }),
 * });
 * ```
 */
export type JobReference<
  WorkflowPath extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Test extends object = object,
> = Readonly<
  {
    /** The job identifier used in needs dependencies and needs.<id> output/result references. It is separate from the display name.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job("build", ({ job }) =>
     *   job.runsOn("ubuntu-latest").run({
     *     id: "build",
     *     name: "Build",
     *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
     *     outputs: ["version"],
     *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
     *   .job(
     *     "deploy",
     *     ({ job, jobs }) =>
     *       job.needs(jobs.build).runsOn("ubuntu-latest")
     *         .run({
     *           name: "Deploy",
     *           run: "deploy",
     *           env: {
     *             VERSION: ({ needs }) => needs.build.outputs.version,
     *           },
     *         }),
     *   );
     * ```
     */
    id: JobId;
    workflowPath: WorkflowPath;
    outputNames: Outputs;
    contracts?: Readonly<Record<string, ReferenceBinding>>;
    [testJobShape]?: Test;
  }
>;
const testStepShape: unique symbol = Symbol("tsugiori.test-step-shape");
const testJobShape: unique symbol = Symbol("tsugiori.test-job-shape");
const testWorkflowShape: unique symbol = Symbol("tsugiori.test-workflow-shape");
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
export type TestJobsOf<Workflow> = Workflow extends {
  readonly [testWorkflowShape]?: infer Jobs;
} ? Jobs
  : never;
type JobReferences = Readonly<
  Record<string, JobReference<string, string, readonly string[]>>
>;
/** Native action/run outputs are strings, including JSON serialized by the action itself.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   id: "build",
 *   name: "Build",
 *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *   outputs: ["version"],
 * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
 * ```
 */
export type ActionOutputReference<
  StepId extends string = string,
  OutputName extends string = string,
> = `\${{ steps.${StepId}.outputs.${OutputName} }}`;
/** Earlier step outputs are accessible as steps.<id>.outputs.<name>.
 * Tsugiori: exposes only declared step ids and output names.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   id: "build",
 *   name: "Build",
 *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *   outputs: ["version"],
 * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
 * ```
 */
export type StepReference<
  Id extends string = string,
  Outputs extends readonly string[] = readonly string[],
  Test extends TestStepShape = TestStepShape,
> = Readonly<{
  /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
   * ```
   */
  id: Id;
  /** String output references from an earlier action or run step, read as steps.<id>.outputs.<name>.
   * Tsugiori: this map contains runtime expression references, not values evaluated during generation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
   * ```
   */
  outputs: Readonly<
    Outputs extends { readonly __actionMetadata: infer M }
      ? { [K in keyof M]: ActionOutputReference<Id, K & string> }
      : {
        [OutputName in Outputs[number]]: ActionOutputReference<Id, OutputName>;
      }
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   id: "build",
   * });
   * ```
   */
  id?: string;
  /** The step display name shown in the GitHub Actions run UI. It does not identify outputs; use id for references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsname
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({ name: "Build", run: "deno test" });
   * ```
   */
  name: string;
  /** The condition for executing this step. A success() status check is implicit unless a status-check function is present. Use always(), failure() or cancelled() when the default success gate is inappropriate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   if: ({ github }) => github.ref.eq("refs/heads/main"),
   * });
   * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   continueOnError: true,
   * });
   * ```
   */
  continueOnError?: boolean;
  /** The maximum execution time in whole minutes before GitHub cancels the step. A step has no separate timeout when omitted; the job timeout still applies.
   * Tsugiori: literal values must be integers from 1 to 360; expression results are checked by GitHub. Scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   timeoutMinutes: 10,
   * });
   * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   env: { SHA: ({ github }) => github.sha },
   * });
   * ```
   */
  env?: StepEnv<Needs, Steps, Matrix, Vars, Secrets, InputValues>;
}>;
/** A uses step runs an action with named inputs. GitHub evaluates conditions and input expressions at runtime.
 * Tsugiori: scenarios use fixtures rather than executing actions.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
 *   id: "checkout", name: "Checkout",
 *   with: ({ github }) => ({ ref: github.sha }),
 * });
 * ```
 */
type ObjectUsesStepOptions<
  C extends ActionContract | string = string,
  Id extends string | undefined = undefined,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> =
  & Omit<StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>, "name">
  & Readonly<{ name?: string; id?: Id extends keyof Steps ? never : Id }>
  & (C extends ActionContract ? Readonly<{ uses?: string }>
    : Readonly<{ uses?: never }>)
  & (RequiredContractKeys<C> extends never
    ? Readonly<{ with?: ActionValues<C> }>
    : Readonly<{ with: ActionValues<C> }>);

/** Step settings for a direct action contract or implementation reference. */
export type UsesStepOptions<
  C extends ActionContract | string = string,
  Id extends string | undefined = undefined,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Steps extends StepReferences = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> =
  & Omit<
    ObjectUsesStepOptions<
      C,
      Id,
      Needs,
      Steps,
      Matrix,
      Vars,
      Secrets,
      InputValues
    >,
    "with"
  >
  & (RequiredContractKeys<C> extends never ? Readonly<
      {
        with?:
          | ActionValues<C>
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
          ) => ActionValues<C>);
      }
    >
    : Readonly<
      {
        with:
          | ActionValues<C>
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
          ) => ActionValues<C>);
      }
    >);

type RequiredContractKeys<C extends ActionContract | string> = C extends
  ActionContract ? {
    [K in keyof ContractInputs<C>]-?: ContractInputs<C>[K] extends
      { required: true }
      ? ContractInputs<C>[K] extends { default: unknown } ? never : K
      : never;
  }[keyof ContractInputs<C>]
  : never;
type ActionValues<C extends ActionContract | string> = C extends ActionContract
  ? ContractArguments<ContractInputs<C>>
  : ActionInputs;
type CheckedActionValues<C extends ActionContract | string, R> = C extends
  ActionContract ? R extends Readonly<Record<string, never>> ? unknown
  : Exclude<keyof R, keyof ContractInputs<C>> extends never ? unknown
  : never
  : unknown;
type ActionStepDefinition<
  C extends ActionContract | string,
  Id extends string | undefined,
> = Readonly<{
  id: Id;
  actionOutputNames: C extends ActionContract
    ? ContractOutputNames<ContractOutputs<C>>
    : readonly [];
}>;
/** A run step executes commands in a new shell process. Step shell and working-directory settings override job defaults. Values written to GITHUB_OUTPUT become string outputs.
 * Tsugiori: outputs declares reference names; scenarios do not execute the script.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   id: "build",
 *   name: "Build",
 *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *   outputs: ["version"],
 * });
 * ```
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
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Build",
       *   run: "deno test",
       *   id: "build",
       * });
       * ```
       */
      id?: Id;
      /** Runs command-line programs of at most 21,000 characters using the runner shell. Each run step starts a fresh non-login shell process; multiline commands within one step share that process. Shell state does not persist to the next step.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({ name: "Build", run: "deno test" });
       * ```
       */
      run: string;
      /** Named outputs exposed to subsequent consumers. A run step sets string values by appending `name=value` to the GITHUB_OUTPUT environment file.
       * Tsugiori: this list declares output names for typed references; it does not write values or execute the script.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   id: "build",
       *   name: "Build",
       *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
       *   outputs: ["version"],
       * });
       * ```
       */
      outputs?: Outputs;
      /** The directory in which the run script executes. Overrides job defaults; otherwise uses the default workspace directory. The directory must already exist on the runner.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Build",
       *   run: "deno test",
       *   workingDirectory: "src",
       * });
       * ```
       */
      workingDirectory?: string;
      /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").run({
       *   name: "Build",
       *   run: "deno test",
       *   shell: "bash",
       * });
       * ```
       */
      shell?: string;
    }
  >;
/** A step condition can skip execution, and continue-on-error can prevent a step failure from failing the job.
 * Tsugiori: typed task input/output contracts and the task callback are additional runtime contracts, not GitHub workflow fields.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
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
    /** Unique step ID for typed output references.
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").task({
     *   id: "version",
     *   name: "Read version",
     *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
     *   outputs: { version: { contract: textValue(), required: true } },
     *   run: async ({ inputs, outputs, logger }) => {
     *     logger.info(inputs.sha);
     *     await outputs.set("version", "1.0.0");
     *   },
     * });
     * ```
     */
    id?: Id;
    /** A GitHub step condition; present() can guard optional task inputs.
     * @example
     * ```ts
     * const stages = jsonValue({
     *   parse(value: unknown): readonly string[] {
     *     if (
     *       !Array.isArray(value) || !value.every((item) => typeof item === "string")
     *     ) {
     *       throw new TypeError("Expected stage names");
     *     }
     *     return value;
     *   },
     * });
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job("prepare", ({ job }) =>
     *   job.runsOn("ubuntu-latest").task({
     *     id: "plan",
     *     name: "Plan",
     *     inputs: {},
     *     outputs: { stages: { contract: stages, required: false } },
     *     run: async ({ outputs }) => {
     *       await outputs.set("stages", ["dev", "prd"]);
     *     },
     *   }).outputs(({ steps }) => ({ stages: steps.plan.outputs.stages })))
     *   .job(
     *     "deploy",
     *     ({ job, jobs }) =>
     *       job.needs(jobs.prepare).runsOn("ubuntu-latest")
     *         .when(({ needs }) => present(needs.prepare.outputs.stages))
     *         .strategy(({ needs }) => ({
     *           matrix: { stage: fromJSON(needs.prepare.outputs.stages) },
     *         }))
     *         .task({
     *           name: "Deploy",
     *           inputs: {
     *             stage: {
     *               contract: textValue(),
     *               from: ({ matrix }) => matrix.stage,
     *             },
     *           },
     *           outputs: {},
     *           run: ({ inputs, logger }) => {
     *             logger.info(inputs.stage);
     *           },
     *         }),
     *   );
     * ```
     */
    if?: Condition;
    /** Pairs each input contract with its runtime expression source.
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").task({
     *   id: "version",
     *   name: "Read version",
     *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
     *   outputs: { version: { contract: textValue(), required: true } },
     *   run: async ({ inputs, outputs, logger }) => {
     *     logger.info(inputs.sha);
     *     await outputs.set("version", "1.0.0");
     *   },
     * });
     * ```
     */
    inputs:
      & Inputs
      & Readonly<
        Record<
          string,
          Readonly<{
            /** Use the same contract object as the producing task for direct passthrough.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").task({
             *   id: "version",
             *   name: "Read version",
             *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
             *   outputs: { version: { contract: textValue(), required: true } },
             *   run: async ({ inputs, outputs, logger }) => {
             *     logger.info(inputs.sha);
             *     await outputs.set("version", "1.0.0");
             *   },
             * });
             * ```
             */
            contract: ValueContract<unknown>;
            /** Use a callback to read contexts available at this step.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").task({
             *   id: "version",
             *   name: "Read version",
             *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
             *   outputs: { version: { contract: textValue(), required: true } },
             *   run: async ({ inputs, outputs, logger }) => {
             *     logger.info(inputs.sha);
             *     await outputs.set("version", "1.0.0");
             *   },
             * });
             * ```
             */
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
    /** Declares native output contracts and whether each write is required.
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").task({
     *   id: "version",
     *   name: "Read version",
     *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
     *   outputs: { version: { contract: textValue(), required: true } },
     *   run: async ({ inputs, outputs, logger }) => {
     *     logger.info(inputs.sha);
     *     await outputs.set("version", "1.0.0");
     *   },
     * });
     * ```
     */
    outputs: Outputs;
    /** Runs in the compiled task runtime with native values; await output writes.
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").task({
     *   id: "version",
     *   name: "Read version",
     *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
     *   outputs: { version: { contract: textValue(), required: true } },
     *   run: async ({ inputs, outputs, logger }) => {
     *     logger.info(inputs.sha);
     *     await outputs.set("version", "1.0.0");
     *   },
     * });
     * ```
     */
    run: (
      context: TaskContext<Inputs, Outputs, Proof | ConditionProof<Condition>>,
    ) => void | Promise<void>;
  }>;
const jobDefinition = Symbol("tsugiori.job-definition");
const workflowDefinition = Symbol("tsugiori.workflow-definition");
export interface TestableWorkflow {
  readonly [workflowDefinition]: AuthoringWorkflow;
  readonly [testWorkflowShape]?: Readonly<Record<string, unknown>>;
}
type FinalizedJobDefinition<
  WorkflowPath extends string,
  JobId extends string,
  Outputs extends readonly string[],
> = Readonly<{
  workflowPath: WorkflowPath;
  jobId: JobId;
  owner: symbol;
  job: AuthoringJob;
  outputNames: Outputs;
  contracts: Readonly<Record<string, ReferenceBinding>>;
}>;
export interface FinalizedJobState<
  WorkflowPath extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Steps extends StepReferences = StepReferences,
  Matrix extends object = object,
> {
  readonly [jobDefinition]: FinalizedJobDefinition<
    WorkflowPath,
    JobId,
    Outputs
  >;
  readonly [testJobShape]?: TestJobShape<Steps, Matrix>;
}
type DefinitionStepId<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? Id : never;
type AvailableStepDefinition<Definition, Steps extends StepReferences> =
  [DefinitionStepId<Definition>] extends [never] ? Definition
    : DefinitionStepId<Definition> extends keyof Steps ? never
    : Definition;
type Invocation<Definition> = Definition extends
  { actionOutputNames: infer O extends readonly string[] } ? O : readonly [];
type TaskOutputs<Definition> = Definition extends
  Readonly<{ outputs: infer O extends OutputDefinitions }> ? TypedNames<O>
  : readonly [];
type DefinitionStepReference<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? StepReference<
    Id,
    Definition extends Readonly<{ actionOutputNames: unknown }>
      ? Invocation<Definition>
      : Definition extends
        Readonly<{ run: string; outputs: infer O extends readonly string[] }>
        ? O
      : TaskOutputs<Definition>,
    TestStepShape<
      Record<string, unknown>,
      Record<
        Definition extends Readonly<{ actionOutputNames: unknown }>
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
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest")
 *   .strategy({
 *     matrix: { os: ["ubuntu-latest", "macos-latest"] },
 *     failFast: false,
 *   })
 *   .runsOn(({ matrix }) => matrix.os)
 *   .run({ name: "Test", run: "deno test" });
 * ```
 */
export interface ExecutionJobState<
  WorkflowPath extends string,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn(["self-hosted", "linux", "x64"]);
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").name("Build and test");
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").env({ SHA: ({ github }) => github.sha });
   * ```
   */
  env(
    value: JobEnv<Needs, Matrix, Vars, Secrets, InputValues>,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").defaultsRun({
   *   shell: "bash",
   *   workingDirectory: "src",
   * });
   * ```
   */
  defaultsRun(
    value: Readonly<
      {
        /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").defaultsRun({
         *   shell: "bash",
         *   workingDirectory: "src",
         * });
         * ```
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
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").defaultsRun({
         *   shell: "bash",
         *   workingDirectory: "src",
         * });
         * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").when(({ github }) =>
   *   github.ref.eq("refs/heads/main")
   * );
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest")
   *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } })
   *   .runsOn(({ matrix }) => matrix.os)
   *   .run({ name: "Test", run: "deno test" });
   * ```
   */
  strategy<const Rows extends readonly Readonly<Record<string, MatrixValue>>[]>(
    definition: Readonly<
      {
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
         */
        matrix: Readonly<{
          /** Objects added to the matrix. With no other axes, each object defines one complete job combination; fields become matrix.<field> runtime values.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrixinclude
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest")
           *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } })
           *   .runsOn(({ matrix }) => matrix.os)
           *   .run({ name: "Test", run: "deno test" });
           * ```
           */
          include: Rows;
        }>;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
         */
        failFast?: boolean;
      }
    >,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest")
   *   .strategy(() => ({
   *     matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>(),
   *   }))
   *   .runsOn(({ matrix }) => matrix.os)
   *   .run({ name: "Test", run: "deno test" });
   * ```
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
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest")
       *   .strategy(() => ({ matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>() }))
       *   .runsOn(({ matrix }) => matrix.os)
       *   .run({ name: "Test", run: "deno test" });
       * ```
       */
      matrix: Expression<Shape>;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest")
       *   .strategy(() => ({ matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>() }))
       *   .runsOn(({ matrix }) => matrix.os)
       *   .run({ name: "Test", run: "deno test" });
       * ```
       */
      failFast?: boolean;
    }>,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest")
   *   .strategy(() => ({
   *     matrix: rawExpression('fromJSON(\'{"os":["ubuntu-latest"]}\')'),
   *   }))
   *   .run({ name: "Test", run: "deno test" });
   * ```
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
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest")
       *   .strategy(() => ({ matrix: rawExpression('fromJSON(\'{"os":["ubuntu-latest"]}\')') }))
       *   .run({ name: "Test", run: "deno test" });
       * ```
       */
      matrix: RawExpression;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest")
       *   .strategy(() => ({ matrix: rawExpression('fromJSON(\'{"os":["ubuntu-latest"]}\')') }))
       *   .run({ name: "Test", run: "deno test" });
       * ```
       */
      failFast?: boolean;
    }>,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest")
   *   .strategy({
   *     matrix: { os: ["ubuntu-latest", "macos-latest"] },
   *     failFast: false,
   *   })
   *   .runsOn(({ matrix }) => matrix.os)
   *   .run({ name: "Test", run: "deno test" });
   * ```
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
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
         */
        matrix: Axes;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
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
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
         */
        matrix: Axes;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest")
         *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false })
         *   .runsOn(({ matrix }) => matrix.os)
         *   .run({ name: "Test", run: "deno test" });
         * ```
         */
        failFast?: boolean;
      }>),
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").concurrency({
   *   group: ({ github }) => format("ci-{0}", github.ref),
   *   cancelInProgress: false,
   *   queue: "max",
   * });
   * ```
   */
  concurrency(
    definition: Readonly<
      {
        /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
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
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
         */
        cancelInProgress: boolean;
        /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
         */
        queue?: "max";
      }
    >,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").permissions({ contents: "read" });
   * ```
   */
  permissions(
    value: WorkflowPermissions,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").timeoutMinutes(15);
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").environment("production");
   * ```
   */
  environment(
    value: string,
  ): ExecutionJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
   *   id: "checkout", name: "Checkout",
   *   with: ({ github }) => ({ ref: github.sha }),
   * });
   * ```
   */
  uses<
    const C extends ActionContract | string,
    const Id extends string | undefined = undefined,
    const R extends ActionValues<NoInfer<C>> = ActionValues<NoInfer<C>>,
  >(
    action: C,
    ...options: RequiredContractKeys<NoInfer<C>> extends never ? [
        options?:
          & ObjectUsesStepOptions<
            NoInfer<C>,
            Id,
            Needs,
            Record<never, never>,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{ with?: R }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
      : [
        options:
          & ObjectUsesStepOptions<
            NoInfer<C>,
            Id,
            Needs,
            Record<never, never>,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{ with?: R }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
  ): NonEmptyStepState<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, Record<never, never>>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    readonly [],
    Proof
  >;
  uses<
    const C extends ActionContract | string,
    const Id extends string | undefined = undefined,
    const R extends ActionValues<NoInfer<C>> = ActionValues<NoInfer<C>>,
  >(
    action: C,
    options:
      & Omit<
        ObjectUsesStepOptions<
          NoInfer<C>,
          Id,
          Needs,
          Record<never, never>,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >,
        "with"
      >
      & Readonly<
        {
          with: (
            context: Scope<
              "jobs.<job_id>.steps.with",
              Needs,
              OutputMap<Record<never, never>>,
              Matrix,
              Vars,
              Secrets,
              InputValues
            >,
          ) => R;
        }
      >
      & CheckedActionValues<C, NoInfer<R>>,
  ): NonEmptyStepState<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, Record<never, never>>,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   *   env: { SHA: ({ github }) => github.sha },
   * });
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
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
    WorkflowPath,
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
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").run({
 *   id: "build",
 *   name: "Build",
 *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *   outputs: ["version"],
 * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
 * ```
 */
export interface NonEmptyStepState<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = Record<never, never>,
  Matrix extends object = Record<never, never>,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> extends FinalizedJobState<WorkflowPath, JobId, Outputs, Steps, Matrix> {
  /** References to earlier named steps in this immutable job.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * const built = job.runsOn("ubuntu-latest").run({
   *   id: "build", name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * });
   * built.steps.build.outputs.version;
   * ```
   */
  readonly steps: Steps;
  /** Maps step values to string outputs for dependent jobs; GitHub can suppress outputs containing secrets.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idoutputs
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
   * ```
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
    WorkflowPath,
    JobId,
    JobOutputNames<Names>,
    Steps,
    Matrix
  >;
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori: scenarios represent action behavior with fixtures.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
   *   id: "checkout", name: "Checkout",
   *   with: ({ github }) => ({ ref: github.sha }),
   * });
   * ```
   */
  uses<
    const C extends ActionContract | string,
    const Id extends string | undefined = undefined,
    const R extends ActionValues<NoInfer<C>> = ActionValues<NoInfer<C>>,
  >(
    action: C,
    ...options: RequiredContractKeys<NoInfer<C>> extends never ? [
        options?:
          & ObjectUsesStepOptions<
            NoInfer<C>,
            Id,
            Needs,
            Steps,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{ with?: R }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
      : [
        options:
          & ObjectUsesStepOptions<
            NoInfer<C>,
            Id,
            Needs,
            Steps,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{ with?: R }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
  ): NonEmptyStepState<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, Steps>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Outputs,
    Proof
  >;
  uses<
    const C extends ActionContract | string,
    const Id extends string | undefined = undefined,
    const R extends ActionValues<NoInfer<C>> = ActionValues<NoInfer<C>>,
  >(
    action: C,
    options:
      & Omit<
        ObjectUsesStepOptions<
          NoInfer<C>,
          Id,
          Needs,
          Steps,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >,
        "with"
      >
      & Readonly<
        {
          with: (
            context: Scope<
              "jobs.<job_id>.steps.with",
              Needs,
              OutputMap<Steps>,
              Matrix,
              Vars,
              Secrets,
              InputValues
            >,
          ) => R;
        }
      >
      & CheckedActionValues<C, NoInfer<R>>,
  ): NonEmptyStepState<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, Steps>,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   *   env: { SHA: ({ github }) => github.sha },
   * });
   * ```
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
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * const version = textValue();
   * job.runsOn("ubuntu-latest")
   *   .task({
   *     id: "make",
   *     name: "Make version",
   *     inputs: {},
   *     outputs: { version: { contract: version, required: true } },
   *     run: async ({ outputs }) => {
   *       await outputs.set("version", "1.0.0");
   *     },
   *   })
   *   .task({
   *     name: "Consume version",
   *     inputs: {
   *       version: {
   *         contract: version,
   *         from: ({ steps }) => steps.make.outputs.version,
   *       },
   *     },
   *     outputs: {},
   *     run: ({ inputs, logger }) => {
   *       logger.info(inputs.version);
   *     },
   *   });
   * ```
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
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").run({
           *   id: "build",
           *   name: "Build",
           *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
           *   outputs: ["version"],
           * }).outputs(({ steps }) => ({ version: steps.build.outputs.version }));
           * ```
           */
          outputs: O;
          /** The condition for executing this step. A success() status check is implicit unless a status-check function is present. Use always(), failure() or cancelled() when the default success gate is inappropriate.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsif
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").run({
           *   name: "Build",
           *   run: "deno test",
           *   if: ({ github }) => github.ref.eq("refs/heads/main"),
           * });
           * ```
           */
          if?: C;
          /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").run({
           *   name: "Build",
           *   run: "deno test",
           *   continueOnError: true,
           * });
           * ```
           */
          continueOnError?: F;
          /** A unique step identifier used to reference its outputs, outcome and conclusion through `steps.<id>`. It is separate from the display name.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsid
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").task({
           *   id: "version",
           *   name: "Read version",
           *   inputs: { sha: { contract: textValue(), from: ({ github }) => github.sha } },
           *   outputs: { version: { contract: textValue(), required: true } },
           *   run: async ({ inputs, outputs, logger }) => {
           *     logger.info(inputs.sha);
           *     await outputs.set("version", "1.0.0");
           *   },
           * });
           * ```
           */
          id?: Exclude<Id, keyof Steps>;
        }
      >,
  ): NonEmptyStepState<
    WorkflowPath,
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
 * @example
 * ```ts
 * const reusable = defineWorkflow(".github/workflows/release.yml", {
 *   on: {
 *     workflow_call: {
 *       inputs: {
 *         version: { type: "string", required: true },
 *       },
 *     },
 *   },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
 * const caller = defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "release",
 *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
 * );
 * defineProject({ workflows: [reusable, caller] });
 * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().when(({ github }) => github.ref.eq("refs/heads/main"));
   * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable()
   *   .strategy(() => ({
   *     matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>(),
   *   }));
   * ```
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
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy(() => ({ matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>() }));
       * ```
       */
      matrix: Expression<Shape>;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy(() => ({ matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>() }));
       * ```
       */
      failFast?: boolean;
    }>,
  ): ReusableJobState<P, J, N, Shape, V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().strategy({ matrix: { stage: ["dev", "prd"] } });
   * ```
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
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
       */
      matrix: Axes;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable()
   *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } });
   * ```
   */
  strategy<const Rows extends readonly Readonly<Record<string, MatrixValue>>[]>(
    value: Readonly<
      {
        /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.reusable()
         *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } });
         * ```
         */
        matrix: Readonly<{
          /** Objects added to the matrix. With no other axes, each object defines one complete job combination; fields become matrix.<field> runtime values.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrixinclude
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable()
           *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } });
           * ```
           */
          include: Rows;
        }>;
        /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
         * Tsugiori: scenarios do not simulate cancellation or scheduling.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.reusable()
         *   .strategy({ matrix: { include: [{ os: "ubuntu-latest", version: 22 }] } });
         * ```
         */
        failFast?: boolean;
      }
    >,
  ): ReusableJobState<P, J, N, Rows[number], V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori: supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategy
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().strategy({ matrix: { stage: ["dev", "prd"] } });
   * ```
   */
  strategy<const Axes extends Readonly<Record<string, readonly string[]>>>(
    value: Readonly<{
      /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
       */
      matrix: Axes;
      /** Whether failure of a matrix member cancels the other queued or running members. Defaults to true. This applies to the whole matrix.
       * Tsugiori: scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().name("Build and test");
   * ```
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().permissions({ contents: "read" });
   * ```
   */
  permissions(
    value: WorkflowPermissions,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Allows at most one running member of a group in this repository. A new pending member normally replaces the old pending member; cancelInProgress also cancels the running member.
   * Tsugiori: queue max requires cancellation disabled; scenarios do not schedule.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().concurrency({
   *   group: ({ github }) => format("ci-{0}", github.ref),
   *   cancelInProgress: false,
   *   queue: "max",
   * });
   * ```
   */
  concurrency(
    value: Readonly<
      {
        /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.reusable().concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
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
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.reusable().concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
         */
        cancelInProgress: boolean;
        /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
         * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.reusable().concurrency({
         *   group: ({ github }) => format("ci-{0}", github.ref),
         *   cancelInProgress: false,
         *   queue: "max",
         * });
         * ```
         */
        queue?: "max";
      }
    >,
  ): ReusableJobState<P, J, N, M, V, S, InputValues>;
  /** Runs a reusable workflow as this job. The caller passes declared inputs through with and secrets through a map or inherit; the callee returns workflow outputs through needs.<caller_job>.outputs. Caller workflow env is not forwarded.
   * Tsugiori: requires the callee in the same project and validates its explicit contract; inherit cannot prove GitHub secret availability.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
   * @example
   * ```ts
   * const reusable = defineWorkflow(".github/workflows/release.yml", {
   *   on: {
   *     workflow_call: {
   *       inputs: {
   *         version: { type: "string", required: true },
   *       },
   *     },
   *   },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
   * const caller = defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job(
   *   "release",
   *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
   * );
   * defineProject({ workflows: [reusable, caller] });
   * ```
   */
  call<const C extends WorkflowCall, O extends string>(
    /** A reusable workflow runs as a separate workflow with its own jobs and steps.
     * Tsugiori: retains the local workflow definition for typed validation and scenario interpretation.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     * @example
     * ```ts
     * const reusable = defineWorkflow(".github/workflows/release.yml", {
     *   on: {
     *     workflow_call: {
     *       inputs: {
     *         version: { type: "string", required: true },
     *       },
     *     },
     *   },
     * }).job("build", ({ job }) =>
     *   job.runsOn("ubuntu-latest").run({
     *     id: "build",
     *     name: "Build",
     *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
     *     outputs: ["version"],
     *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
     *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
     * const caller = defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job(
     *   "release",
     *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
     * );
     * defineProject({ workflows: [reusable, caller] });
     * ```
     */
    /** GitHub-native reference; the caller owns its correspondence to callee. */
    uses: string,
    callee: ReusableWorkflow<C, O>,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
   *   with: { version: "1.0.0" },
   *   secrets: "inherit",
   * });
   * ```
   */
  rawCall(
    /** The reusable workflow to invoke: owner/repository/.github/workflows/file@ref or ./.github/workflows/file. Local paths use the caller commit; a SHA pins an external version. Expressions are not allowed.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     * @example In a `defineWorkflow().job()` callback with `{ job }`.
     * ```ts
     * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", {
     *   id: "checkout", name: "Checkout",
     *   with: ({ github }) => ({ ref: github.sha }),
     * });
     * ```
     */
    uses: string,
    args?:
      | Readonly<
        {
          /** Named input values passed to the action or reusable workflow. Reusable workflow names must match its workflow_call declaration and values must match the declared types.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idwith
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
           *   with: { version: "1.0.0" },
           *   secrets: "inherit",
           * });
           * ```
           */
          with?: RawCallInputs;
          /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
           * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
           *   with: { version: "1.0.0" },
           *   secrets: "inherit",
           * });
           * ```
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
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
           *   with: { version: "1.0.0" },
           *   secrets: "inherit",
           * });
           * ```
           */
          with?: RawCallInputs;
          /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
           * Tsugiori: inherit cannot statically prove secret availability or GitHub authorization.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
           *   with: { version: "1.0.0" },
           *   secrets: "inherit",
           * });
           * ```
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
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "test",
 *   ({ job }) =>
 *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
 * );
 * ```
 */
export interface IndependentJobState<
  WorkflowPath extends string,
  JobId extends string,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Selects a native caller job; inputs and secrets travel one hop and caller workflow env does not propagate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   * @example
   * ```ts
   * const reusable = defineWorkflow(".github/workflows/release.yml", {
   *   on: {
   *     workflow_call: {
   *       inputs: {
   *         version: { type: "string", required: true },
   *       },
   *     },
   *   },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
   * const caller = defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job(
   *   "release",
   *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
   * );
   * defineProject({ workflows: [reusable, caller] });
   * ```
   */
  reusable(): ReusableJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn(["self-hosted", "linux", "x64"]);
   * ```
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecutionJobState<
    WorkflowPath,
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
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "test",
 *   ({ job }) =>
 *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
 * );
 * ```
 */
export interface DependentJobState<
  WorkflowPath extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]>,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Selects a native caller job; inputs and secrets travel one hop and caller workflow env does not propagate.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
   * @example
   * ```ts
   * const reusable = defineWorkflow(".github/workflows/release.yml", {
   *   on: {
   *     workflow_call: {
   *       inputs: {
   *         version: { type: "string", required: true },
   *       },
   *     },
   *   },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
   * const caller = defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job(
   *   "release",
   *   ({ job }) => job.reusable().call("./.github/workflows/release.yml", reusable, { with: { version: "1.0.0" } }),
   * );
   * defineProject({ workflows: [reusable, caller] });
   * ```
   */
  reusable(): ReusableJobState<
    WorkflowPath,
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
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn(["self-hosted", "linux", "x64"]);
   * ```
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecutionJobState<
    WorkflowPath,
    JobId,
    Needs,
    Record<never, never>,
    Vars,
    Secrets,
    InputValues
  >;
}
export interface JobStartState<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> extends IndependentJobState<WorkflowPath, JobId, Vars, Secrets, InputValues> {
  /** Names declared dependencies; unsuccessful dependencies skip execution unless an explicit status condition admits the job.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .job(
   *     "deploy",
   *     ({ job, jobs }) =>
   *       job.needs(jobs.build).runsOn("ubuntu-latest")
   *         .run({
   *           name: "Deploy",
   *           run: "deploy",
   *           env: {
   *             VERSION: ({ needs }) => needs.build.outputs.version,
   *           },
   *         }),
   *   );
   * ```
   */
  needs<
    const Dependencies extends readonly [
      Jobs[keyof Jobs],
      ...Jobs[keyof Jobs][],
    ],
  >(
    ...dependencies: Dependencies
  ): DependentJobState<
    WorkflowPath,
    JobId,
    NeedsMap<Dependencies>,
    Vars,
    Secrets,
    InputValues
  >;
}
/** The callback job exposes needs() only after earlier jobs exist.
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .job(
 *     "deploy",
 *     ({ job, jobs }) =>
 *       job.needs(jobs.build).runsOn("ubuntu-latest")
 *         .run({
 *           name: "Deploy",
 *           run: "deploy",
 *           env: {
 *             VERSION: ({ needs }) => needs.build.outputs.version,
 *           },
 *         }),
 *   );
 * ```
 */
export type AvailableJobState<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = keyof Jobs extends never
  ? IndependentJobState<WorkflowPath, JobId, Vars, Secrets, InputValues>
  : JobStartState<WorkflowPath, JobId, Jobs, Vars, Secrets, InputValues>;
/** The job callback receives the new job and references to earlier jobs.
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .job(
 *     "deploy",
 *     ({ job, jobs }) =>
 *       job.needs(jobs.build).runsOn("ubuntu-latest")
 *         .run({
 *           name: "Deploy",
 *           run: "deploy",
 *           env: {
 *             VERSION: ({ needs }) => needs.build.outputs.version,
 *           },
 *         }),
 *   );
 * ```
 */
export type JobDefinitionScope<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Readonly<
  {
    /** Start the new job with runsOn() or reusable().
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job(
     *   "test",
     *   ({ job }) =>
     *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
     * );
     * ```
     */
    job: AvailableJobState<
      WorkflowPath,
      JobId,
      Jobs,
      Vars,
      Secrets,
      InputValues
    >;
    /** Earlier jobs available for explicit needs() dependencies.
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job("build", ({ job }) =>
     *   job.runsOn("ubuntu-latest").run({
     *     id: "build",
     *     name: "Build",
     *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
     *     outputs: ["version"],
     *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
     *   .job(
     *     "deploy",
     *     ({ job, jobs }) =>
     *       job.needs(jobs.build).runsOn("ubuntu-latest")
     *         .run({
     *           name: "Deploy",
     *           run: "deploy",
     *           env: {
     *             VERSION: ({ needs }) => needs.build.outputs.version,
     *           },
     *         }),
     *   );
     * ```
     */
    jobs: Jobs;
  }
>;
type AddJobReference<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Result extends FinalizedJobState<string, string, readonly string[]>,
> = Readonly<
  & Jobs
  & Record<
    JobId,
    JobReference<
      WorkflowPath,
      JobId,
      Result[typeof jobDefinition]["outputNames"],
      NonNullable<Result[typeof testJobShape]>
    >
  >
>;
type AvailableJobId<JobId extends string, Jobs extends JobReferences> =
  JobId extends keyof Jobs ? never : JobId;
/** Add a completed job before passing the workflow to defineProject().
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "test",
 *   ({ job }) =>
 *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
 * );
 * ```
 */
export interface EmptyWorkflowState<
  WorkflowPath extends string,
  Vars extends string = string,
  Secrets extends string = string,
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Typed input references; GitHub supplies values and defaults at runtime.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context
   * @example
   * ```ts
   * const flow = defineWorkflow(".github/workflows/ci.yml", {
   *   on: {
   *     workflow_dispatch: {
   *       inputs: { stage: { type: "string", default: "dev" } },
   *     },
   *   },
   * });
   * flow.inputs.stage;
   * ```
   */
  readonly inputs: import("./expression.ts").Ref<
    InputValues,
    "inputs"
  >;
  /** Jobs run independently unless needs declares dependencies. A job id identifies it in dependency and output references; name controls its display label.
   * Tsugiori: adds jobs in declaration order and exposes declared outputs for later definitions.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job(
   *   "test",
   *   ({ job }) =>
   *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
   * );
   * ```
   */
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      WorkflowPath,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    /** The job identifier used for needs dependencies and output references. It must start with a letter or underscore and contain only letters, digits, hyphens or underscores.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job(
     *   "test",
     *   ({ job }) =>
     *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
     * );
     * ```
     */
    id: JobId,
    define: (
      scope: JobDefinitionScope<
        WorkflowPath,
        JobId,
        Record<never, never>,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): NonEmptyWorkflowState<
    WorkflowPath,
    AddJobReference<WorkflowPath, JobId, Record<never, never>, Result>,
    Vars,
    Secrets,
    C,
    O,
    InputValues
  >;
}
/** An immutable workflow with at least one completed job.
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job("build", ({ job }) =>
 *   job.runsOn("ubuntu-latest").run({
 *     id: "build",
 *     name: "Build",
 *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
 *     outputs: ["version"],
 *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
 *   .job(
 *     "deploy",
 *     ({ job, jobs }) =>
 *       job.needs(jobs.build).runsOn("ubuntu-latest")
 *         .run({
 *           name: "Deploy",
 *           run: "deploy",
 *           env: {
 *             VERSION: ({ needs }) => needs.build.outputs.version,
 *           },
 *         }),
 *   );
 * ```
 */
export interface NonEmptyWorkflowState<
  WorkflowPath extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> {
  /** Typed input references; GitHub supplies values and defaults at runtime.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#inputs-context
   * @example
   * ```ts
   * const flow = defineWorkflow(".github/workflows/ci.yml", {
   *   on: {
   *     workflow_dispatch: {
   *       inputs: { stage: { type: "string", default: "dev" } },
   *     },
   *   },
   * });
   * flow.inputs.stage;
   * ```
   */
  readonly inputs: import("./expression.ts").Ref<
    InputValues,
    "inputs"
  >;
  readonly [workflowContract]: Readonly<{ call: C; outputs: readonly O[] }>;
  /** Defines reusable workflow outputs mapped to outputs of jobs within the callee. Callers read them as needs.<caller_job>.outputs.<name>.
   * Tsugiori: exposes typed callee job references and only allows this on reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_calloutputs
   * @example
   * ```ts
   * const reusable = defineWorkflow(".github/workflows/release.yml", {
   *   on: {
   *     workflow_call: {
   *       inputs: {
   *         version: { type: "string", required: true },
   *       },
   *     },
   *   },
   * }).job("build", ({ job }) =>
   *   job.runsOn("ubuntu-latest").run({
   *     id: "build",
   *     name: "Build",
   *     run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *     outputs: ["version"],
   *   }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))
   *   .workflowOutputs(({ jobs }) => ({ version: jobs.build.outputs.version }));
   * ```
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
  ): NonEmptyWorkflowState<
    WorkflowPath,
    Jobs,
    Vars,
    Secrets,
    C,
    keyof Values & string,
    InputValues
  >;
  readonly [workflowDefinition]: AuthoringWorkflow;
  readonly [testWorkflowShape]?: Jobs;
  /** Jobs run independently unless needs declares dependencies. A job id identifies it in dependency and output references; name controls its display label.
   * Tsugiori: adds jobs in declaration order and exposes declared outputs for later definitions.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   * @example
   * ```ts
   * defineWorkflow(".github/workflows/ci.yml", {
   *   on: { push: {} },
   * }).job(
   *   "test",
   *   ({ job }) =>
   *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
   * );
   * ```
   */
  job<
    const JobId extends string,
    Result extends FinalizedJobState<
      WorkflowPath,
      NoInfer<JobId>,
      readonly string[]
    >,
  >(
    /** The unique job identifier used in needs dependencies and output/result references. It must start with a letter or underscore and contain only letters, digits, hyphens or underscores.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
     * @example
     * ```ts
     * defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * }).job(
     *   "test",
     *   ({ job }) =>
     *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
     * );
     * ```
     */
    id: AvailableJobId<JobId, Jobs>,
    define: (
      scope: JobDefinitionScope<
        WorkflowPath,
        JobId,
        Jobs,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): NonEmptyWorkflowState<
    WorkflowPath,
    AddJobReference<WorkflowPath, JobId, Jobs, Result>,
    Vars,
    Secrets,
    C,
    O,
    InputValues
  >;
}

type WorkflowDraft = Readonly<{
  path: string;
  name: string;
  on: WorkflowTriggers;
  runName?: string;
  env?: EnvironmentVariables;
  concurrency?: Concurrency;
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
  references: JobReferences;
  owner: symbol;
}>;
type JobDraft = Readonly<{
  workflowPath: string;
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

/** A workflow defines event triggers and jobs. Its project-relative YAML path is its sole identity.
 * Tsugiori: callers own GitHub workflow placement; generation imposes no output directory.
 * Tsugiori: constructs immutable authoring state; expressions and step bodies are not executed during generation.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on
 * @example
 * ```ts
 * defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "test",
 *   ({ job }) =>
 *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
 * );
 * ```
 */
export function defineWorkflow<
  const WorkflowPath extends string,
  const On extends WorkflowTriggers,
  const Vars extends readonly string[] | undefined = undefined,
  const Secrets extends readonly string[] | undefined = undefined,
>(
  /** Output path relative to the invocation’s Deno project directory. */
  path: WorkflowPath,
  options:
    & WorkflowOptions<On, Vars, Secrets>
    & Readonly<{
      /** Declared names available in expression callbacks.
       * @example
       * ```ts
       * defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   vars: ["REGION"],
       * });
       * ```
       */
      vars?: LiteralNames<Vars>;
      /** Declared names available in expression callbacks.
       * @example
       * ```ts
       * defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   secrets: ["DEPLOY_TOKEN"],
       * });
       * ```
       */
      secrets?: LiteralNames<Secrets>;
    }>,
): EmptyWorkflowState<
  WorkflowPath,
  Names<Vars>,
  Names<Secrets>,
  CallContractOf<On>,
  WorkflowOutputNames<On>,
  WorkflowInputValues<On>
> {
  if (
    !isRecord(options.on) || Array.isArray(options.on) ||
    Object.keys(options.on).length === 0
  ) {
    throw new TypeError(
      "Workflow on must be a nonempty event settings object.",
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
        `Unsupported workflow option ${field}. Use on event settings.`,
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
  const draft: WorkflowDraft = Object.freeze({
    path,
    name: options.name ?? path,
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
    owner: Symbol(`tsugiori.workflow.${path}`),
  });
  return createWorkflowFacade(draft, false) as EmptyWorkflowState<
    WorkflowPath,
    Names<Vars>,
    Names<Secrets>,
    CallContractOf<On>,
    WorkflowOutputNames<On>,
    WorkflowInputValues<On>
  >;
}

/** Materializes completed workflow definitions; generation validates caller/callee configuration membership.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobs
 * @example
 * ```ts
 * const ci = defineWorkflow(".github/workflows/ci.yml", {
 *   on: { push: {} },
 * }).job(
 *   "test",
 *   ({ job }) =>
 *     job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
 * );
 * defineProject({ cacheVersion: 1, workflows: [ci] });
 * ```
 */
export function defineProject<
  const Workflows extends NonEmptyReadonlyArray<
    Readonly<{ [workflowDefinition]: AuthoringWorkflow }>
  >,
>(
  input: Readonly<{
    /** Increase when inputs outside the tracked source graph change the task binary.
     * @example
     * ```ts
     * const ci = defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * })
     *   .job(
     *     "test",
     *     ({ job }) =>
     *       job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
     *   );
     * defineProject({ cacheVersion: 2, workflows: [ci] });
     * ```
     */
    cacheVersion?: number;
    /** Native Actions working-directory for artifact preparation only. */
    workingDirectory?: string;
    /** Completed workflows to generate together, including local reusable callees.
     * @example
     * ```ts
     * const ci = defineWorkflow(".github/workflows/ci.yml", {
     *   on: { push: {} },
     * })
     *   .job(
     *     "test",
     *     ({ job }) =>
     *       job.runsOn("ubuntu-latest").run({ name: "Test", run: "deno test" }),
     *   );
     * defineProject({ workflows: [ci] });
     * ```
     */
    workflows: Workflows;
  }>,
): ProjectConfig {
  const cacheVersion = input.cacheVersion ?? 1;
  if (!Number.isSafeInteger(cacheVersion) || cacheVersion <= 0) {
    throw new TypeError("Cache version must be a positive safe integer.");
  }
  return Object.freeze({
    kind: "github-actions.project",
    cacheVersion,
    workingDirectory: input.workingDirectory ?? ".",
    workflows: Object.freeze(
      input.workflows.map((value) => value[workflowDefinition]),
    ),
  });
}

function createWorkflowFacade(
  draft: WorkflowDraft,
  finalized: boolean,
): EmptyWorkflowState<string> | NonEmptyWorkflowState<string, JobReferences> {
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
      return createWorkflowFacade(
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
          workflowPath: draft.path,
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
        completed.owner !== draft.owner ||
        completed.workflowPath !== draft.path ||
        completed.jobId !== id
      ) {
        throw new TypeError(
          `Job ${JSON.stringify(id)} returned a definition for another job.`,
        );
      }
      return createWorkflowFacade(
        Object.freeze({
          ...draft,
          jobs: Object.freeze([...draft.jobs, completed.job]),
          references: Object.freeze({
            ...draft.references,
            [id]: Object.freeze({
              id,
              workflowPath: draft.path,
              outputNames: completed.outputNames,
              contracts: completed.contracts,
            }),
          }),
        }),
        true,
      );
    },
    ...(finalized ? { [workflowDefinition]: materializeWorkflow(draft) } : {}),
  };
  return Object.freeze(facade) as
    | EmptyWorkflowState<string>
    | NonEmptyWorkflowState<string, JobReferences>;
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
    callee?: AuthoringWorkflow,
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
      with: value.with && copyCallInputs(value.with),
      callSecrets: value.secrets === "inherit"
        ? "inherit"
        : evaluateEnv(value.secrets),
      callee,
      steps: Object.freeze([]),
    });
    return Object.freeze({
      [jobDefinition]: Object.freeze({
        workflowPath: draft.workflowPath,
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
    call: (uses: string, callee: ReusableWorkflow, args: unknown) => {
      const workflow = callee[workflowDefinition];
      if (!workflow.on.workflow_call) {
        throw new TypeError("Called workflow must declare workflow_call.");
      }
      return invoke(
        uses,
        args,
        workflow,
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
    uses: (
      action: ActionContract | string,
      options:
        & Omit<
          ObjectUsesStepOptions<ActionContract | string, string | undefined>,
          "with"
        >
        & {
          with?:
            | ActionInputs
            | ((context: Scope<"jobs.<job_id>.steps.with">) => ActionInputs);
        } = {},
    ) => {
      assertPlainRecord(options, "Action step options");
      const contract = typeof action === "string" ? undefined : action;
      if (contract !== undefined) {
        assertPlainRecord(contract, "Action contract");
        if (
          typeof contract.name !== "string" ||
          typeof contract.description !== "string"
        ) {
          throw new TypeError("Action contract requires name and description.");
        }
      } else if (Object.hasOwn(options, "uses")) {
        throw new TypeError(
          "A string action reference cannot be overridden in options.",
        );
      }
      if (options.uses !== undefined && typeof options.uses !== "string") {
        throw new TypeError("Action uses override must be a string.");
      }
      const uses = options.uses ??
        (contract === undefined ? action : contract.uses);
      if (typeof uses !== "string" || uses.trim() === "") {
        throw new TypeError("Action uses must be a nonempty string.");
      }
      const inputs = typeof options.with === "function"
        ? options.with(scope("jobs.<job_id>.steps.with"))
        : options.with;
      if (inputs !== undefined) validateActionInputs(inputs);
      if (contract !== undefined) {
        const definitions = contract.inputs ?? {};
        assertPlainRecord(definitions, "Action contract inputs");
        for (const key of Object.keys(inputs ?? {})) {
          if (!Object.hasOwn(definitions, key)) {
            throw new TypeError(
              `Action input ${JSON.stringify(key)} is not declared.`,
            );
          }
        }
        for (const [key, input] of Object.entries(definitions)) {
          assertPlainRecord(input, "Action input metadata");
          if (
            input.required === true && !Object.hasOwn(input, "default") &&
            !Object.hasOwn(inputs ?? {}, key)
          ) {
            throw new TypeError(
              `Required action input ${JSON.stringify(key)} is missing.`,
            );
          }
        }
        assertPlainRecord(contract.outputs ?? {}, "Action contract outputs");
      }
      if (
        contract?.originalRef !== undefined &&
        typeof contract.originalRef !== "string"
      ) {
        throw new TypeError("Action original ref must be a string.");
      }
      const outputs = Object.keys(contract?.outputs ?? {});
      validateActionOutputs(outputs);
      return appendStep(
        draft,
        usesStep(
          options,
          uses,
          inputs,
          uses === contract?.uses ? contract.originalRef : undefined,
        ),
        outputs,
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
      workflowPath: draft.workflowPath,
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
  definition:
    & Parameters<typeof stepFields>[0]
    & Readonly<{ id?: string; name?: string }>,
  uses: string,
  inputs: ActionInputs | undefined,
  originalRef?: string,
): AuthoringUsesStep {
  return Object.freeze({
    type: "uses",
    ...(definition.id === undefined ? {} : { id: definition.id }),
    ...(definition.name === undefined ? {} : { name: definition.name }),
    uses,
    ...(originalRef === undefined ? {} : { originalRef }),
    ...stepFields(definition),
    ...(inputs === undefined ? {} : { with: copyActionInputs(inputs) }),
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
function materializeWorkflow(draft: WorkflowDraft): AuthoringWorkflow {
  return Object.freeze({
    path: draft.path,
    name: draft.name,
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
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value !== "string" && !(value instanceof Expression)) {
      throw new TypeError(
        `Action input ${
          JSON.stringify(key)
        } must be a string or string expression.`,
      );
    }
    if (value instanceof Expression && nonStringExpression(value.node)) {
      throw new TypeError(
        `Action input ${
          JSON.stringify(key)
        } must be a string or string expression.`,
      );
    }
  }
}
// Raw nodes and caller assertions carry no runtime value type. Track known non-string results
// separately from opaque references, including values selected by && and ||.
type ExpressionResults = Readonly<{
  falsy: boolean;
  truthy: boolean;
  falsyNonString: boolean;
  truthyNonString: boolean;
}>;
function nonStringExpression(node: Expression["node"]): boolean {
  const result = expressionResults(node);
  return result.falsyNonString || result.truthyNonString;
}
function expressionResults(node: Expression["node"]): ExpressionResults {
  const unknownResult = {
    falsy: true,
    truthy: true,
    falsyNonString: false,
    truthyNonString: false,
  };
  const booleanResult = {
    falsy: true,
    truthy: true,
    falsyNonString: true,
    truthyNonString: true,
  };
  switch (node.kind) {
    case "literal": {
      const truthy = Boolean(node.value);
      const nonString = typeof node.value !== "string";
      return {
        falsy: !truthy,
        truthy,
        falsyNonString: !truthy && nonString,
        truthyNonString: truthy && nonString,
      };
    }
    case "unary":
      return booleanResult;
    case "binary": {
      if (!["&&", "||"].includes(node.operator)) return booleanResult;
      const left = expressionResults(node.left);
      const right = expressionResults(node.right);
      return node.operator === "&&"
        ? {
          falsy: left.falsy || (left.truthy && right.falsy),
          truthy: left.truthy && right.truthy,
          falsyNonString: left.falsyNonString ||
            (left.truthy && right.falsyNonString),
          truthyNonString: left.truthy && right.truthyNonString,
        }
        : {
          falsy: left.falsy && right.falsy,
          truthy: left.truthy || (left.falsy && right.truthy),
          falsyNonString: left.falsy && right.falsyNonString,
          truthyNonString: left.truthyNonString ||
            (left.falsy && right.truthyNonString),
        };
    }
    case "call":
      return [
          "contains",
          "startsWith",
          "endsWith",
          "success",
          "failure",
          "always",
          "cancelled",
        ].includes(node.name)
        ? booleanResult
        : unknownResult;
    default:
      return unknownResult;
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
function copyActionInputs(
  inputs: ActionInputs,
): Readonly<Record<string, string>> {
  validateActionInputs(inputs);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(inputs).map((
        [key, value],
      ) => [key, value instanceof Expression ? emitExpression(value) : value]),
    ),
  );
}
function copyCallInputs(
  inputs: RawCallInputs,
): Readonly<Record<string, string | number | boolean>> {
  assertPlainRecord(inputs, "Workflow call inputs");
  for (const value of Object.values(inputs)) {
    if (
      typeof value !== "string" && typeof value !== "boolean" &&
      !(value instanceof Expression) &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      throw new TypeError(
        "Workflow call input must be a string, boolean, or finite number.",
      );
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(inputs).map((
        [key, value],
      ) => [key, value instanceof Expression ? emitExpression(value) : value]),
    ),
  );
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

function validateCallExpressionInputs(values: RawCallInputs | undefined): void {
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
