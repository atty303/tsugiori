/**
 * Author GitHub Actions definitions with immutable TypeScript builders.
 *
 * ## Authoring order and evaluation
 *
 * Start with {@link defineWorkflow} and its nonempty on object. Define jobs in
 * dependency order. Inside a job callback, declare needs before consuming needs
 * references, configure strategy before fields that consume matrix, select a runner,
 * and append at least one step. Return the final state from that same callback.
 * Finish output mappings after the producing steps. Each method returns a new
 * state; retaining an earlier state does not include later changes.
 *
 * Configuration callbacks execute while building the definition. Their context
 * contains expression references, not values fetched from GitHub. Return an AST,
 * input map or configuration as required by the field. GitHub evaluates emitted
 * expressions during workflow execution. Host if statements and template strings
 * cannot inspect those values; use expression operators, format() or field callbacks.
 * Settings sharing a field scope accept either a static object or one callback
 * returning the complete object: step/job env, job defaultsRun/concurrency, and
 * task inputs. Values inside those objects are literals or expression references,
 * never callbacks. Each callback executes once when its builder method is called.
 * Reusable call args are objects with separate with and secrets map callbacks:
 * with excludes secrets, while secrets includes them. Do not combine their scopes.
 * Task run callbacks execute separately on the prepared runtime with native values.
 *
 * See {@link Exec}, {@link Step.outputs},
 *  {@link CompositeDraft.steps}, {@link CStep.outputs},
 *  {@link TaskStepDefinition}, and {@link ActionContract} for local usage.
 *  [Scenario API](https://jsr.io/@atty303/tsugiori/doc/github-actions/testing) verifies
 * modeled wiring with fixtures; it does not execute a runner.
 *
 * ## Inferred state types
 *
 * Builders infer their states without consumer annotations. {@link WorkflowStart}
 * and {@link Workflow} retain workflow identity and earlier jobs. {@link JobInit},
 * {@link Job}, {@link DepJob}, {@link Exec} and {@link CallJob} retain only the
 * operations admitted at that job stage. {@link Step} and {@link CStep} retain
 * earlier steps; {@link CompositeDraft} and {@link Composite} delimit composite
 * definition. Output mappings return {@link JobDone}.
 *
 * State aliases carry optional context in one final {@link StateEnv} parameter:
 * needs, matrix, variable/secret names, inputs, outputs and presence proofs.
 * Absent fields use the state's defaults; inferred states omit defaults from the
 * displayed context. No explicit annotation is needed to obtain that display.
 * {@link JR}, {@link NS} and {@link TR} retain reference identities and contracts;
 * {@link TS} and {@link TJ} retain native scenario fixture shapes. Short names
 * do not replace the operation contracts documented on each builder method.
 *
 * ## Expressions and task values
 *
 * Job fields are set in definition order. Configure a matrix before concurrency,
 * and define steps before job outputs. Each expression callback receives the
 * contexts available at its GitHub Actions field. Step callbacks see only earlier
 * step IDs; dependent jobs see only declared outputs from their dependencies.
 *
 * Operators are methods (`.eq()`, `.and()`, `.not()`, and so on); GitHub built-in
 * functions are exported separately. Host TypeScript strings, including template
 * strings, are accepted as literal operands to AST methods. An expression field
 * requires an AST or `rawExpression()` and never interprets an ordinary string
 * as an expression. Task inputs declare a contract and source together; Tsugiori
 * generates their step environment variables and parses them before `run`.
 * `jsonValue()` accepts any parser with `parse(value: unknown): T`, including a
 * Zod schema supplied by the consumer project, and requires it to preserve the
 * JSON shape. `textValue()` handles non-empty text. Each output declares whether
 * it is required. An omitted output is logically `null` and has an empty wire
 * value; a task cannot write top-level `null` or an empty text value. JSON arrays
 * and nested `null` remain ordinary values. The producer validates before writing
 * and the consumer validates before `run`.
 * `required` is enforced when the task runs. A task skipped by `if`, or a task
 * with `continueOnError`, exposes its outputs as optional to later steps.
 *
 * Direct task-output references and direct job-output passthroughs retain their
 * contract. A computed job-output expression does not. `present(ref)` renders a
 * GitHub empty-string check and proves an optional typed reference is present in
 * `when` or task `if` conditions; `and` preserves that proof. `or`, negation, and
 * raw expressions do not. `fromJSON(typedRef)` infers the JSON value type when
 * the reference is required or presence has been proved, and emits an ordinary
 * `fromJSON(ref)` call. For untyped references, `.as<T>()` remains a caller
 * assertion without runtime validation. `.and()` retains the falsy branch of its left operand in the result type,
 * while `.or()` retains the truthy branch; GitHub Actions performs the actual
 * comparison, truthiness, and logical operator evaluation.
 *
 * ## Reusable workflows and supported fields
 *
 * Tsugiori emits native reusable workflow files and caller jobs. Include each
 * local callee in the same project. Calling a local workflow checks input names,
 * primitive types and required values, explicit secrets and declared output
 * references. `secrets: "inherit"` forwards one hop; it cannot prove repository
 * secret availability or organization/enterprise eligibility.
 *
 * `defineWorkflow()` takes a nonempty `on` object with supported event keys;
 * use `{}` for an event without settings. String and array trigger shorthands
 * are not accepted. Dispatch inputs belong in `on.workflow_dispatch.inputs`;
 * call inputs, secrets and outputs belong in `on.workflow_call`.
 *
 * Reusable calls use `job.reusable().call(uses, callee, args)`. The GitHub-native
 * `uses` reference is explicit; authors keep it consistent with the callee
 * definition used for typed inputs, secrets, outputs and scenarios.
 *
 * `definition.inputs` and field callback `inputs` infer declared input names
 * and value types from both dispatch and call definitions. Dispatch `choice`
 * values are strings. When events declare different types, references use their
 * union; an event without that input contributes `""`, matching GitHub's
 * [missing property evaluation](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#available-contexts).
 * Event conditions do not narrow this union. Reusable call arguments and secrets
 * are checked against only the `workflow_call` contract. `.workflowOutputs()`
 * replaces the complete `on.workflow_call.outputs` map after jobs are defined. Workflow outputs use the callee's `jobs` context. Caller outputs become
 * the ordinary `needs.<job>.outputs` surface. Expressions/raw nodes are evaluated
 * by GitHub; runtime expression values cannot all be statically guaranteed.
 *
 * Use
 * `job.reusable().rawCall("owner/repo/.github/workflows/build.yml@<ref>", args)`
 * for an external workflow. Its input/secret/output contracts are caller
 * assertions. Caller jobs support conditions, needs, matrix strategy, name,
 * permissions and concurrency; they do not contain runner execution fields.
 *
 * A static platform matrix can use `strategy({ matrix: { include: rows } })`. Row
 * fields supply typed matrix references. Configure strategy before
 * `.runsOn(({ matrix }) => matrix.runner)` or other matrix-dependent fields.
 * `.runsOn(["self-hosted", "linux"])` emits conjunctive runner labels. `.env()`
 * defines job env; workflow env belongs in workflow options. Job `.defaultsRun()`
 * emits native defaults, and a run step's `shell` and `workingDirectory` override
 * them. Step `timeoutMinutes` accepts an integer or an expression callback.
 * PR/PR-target `types`, push tags, dispatch choice/options, `runName`, job
 * `.name()` and `actions`/`pull-requests` permissions are supported.
 *
 * {@link githubActionsSpec} exposes the frozen specification basis and capability coverage. Generation, validation and scenarios do not fetch specifications. Coverage does not prove hosted GitHub execution or authorization.
 * @module
 */
import { posix } from "node:path";
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
 * Use one of the supported event names in this union; see githubActionsSpec for the fixed specification basis.
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
 * Tsugiori supports string and choice inputs; other GitHub dispatch input types are not implemented.
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
       * Tsugiori does not support boolean, number or environment dispatch inputs.
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
       * Tsugiori does not support boolean, number or environment dispatch inputs.
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
 * Tsugiori validates explicit local call contracts, but cannot verify repository authorization.
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
       * workflowOutputs() provides typed job references as an alternative to raw expression strings.
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
  : E;
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
type WorkflowInputs<On extends WorkflowTriggers> =
  keyof WorkflowInputValues<On> extends never ? E
    : [On] extends [unknown] ? {
        readonly [K in keyof WorkflowInputValues<On>]: WorkflowInputValues<
          On
        >[K];
      }
    : never;
type CallContractOf<On> = On extends
  { workflow_call: infer C extends WorkflowCall } ? C : E;
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
  /** Retained workflow_call contract used to validate calls independently of the union of all trigger inputs.
   */
  readonly [workflowContract]: Readonly<{
    /** Declared reusable workflow input and secret contract. See {@link ReusableWorkflow}.
     */
    call: C;
    /** Named outputs or output contracts for this representation. See the owning type and its output mapping method; declaration alone does not write a value.
     */
    outputs: readonly O[];
  }>;
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
       * Using inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       * @example
       * ```ts
       * const deploy = defineWorkflow(".github/workflows/deploy.yml", {
       *   on: { workflow_call: { secrets: { token: { required: true } } } },
       * }).job("deploy", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     name: "Deploy",
       *     run: "deploy",
       *     env: ({ secrets }) => ({ TOKEN: secrets.token }),
       *   }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   secrets: ["DEPLOY_TOKEN"],
       * }).job("release", ({ job }) =>
       *   job.reusable().call("./.github/workflows/deploy.yml", deploy, {
       *     secrets: ({ secrets }) => ({ token: secrets.DEPLOY_TOKEN }),
       *   }));
       * defineProject({ workflows: [deploy, caller] });
       * ```
       */
      secrets?: SecretValues<C> | "inherit";
    }
    : {
      /** Secrets exposed to the called workflow. A map passes named values; inherit forwards the caller secrets within the same organization or enterprise. Forwarding applies only to the direct callee; nested calls must forward again.
       * Using inherit cannot statically prove secret availability or GitHub authorization.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsecrets
       * @example
       * ```ts
       * const deploy = defineWorkflow(".github/workflows/deploy.yml", {
       *   on: { workflow_call: { secrets: { token: { required: true } } } },
       * }).job("deploy", ({ job }) =>
       *   job.runsOn("ubuntu-latest").run({
       *     name: "Deploy",
       *     run: "deploy",
       *     env: ({ secrets }) => ({ TOKEN: secrets.token }),
       *   }));
       * const caller = defineWorkflow(".github/workflows/ci.yml", {
       *   on: { push: {} },
       *   secrets: ["DEPLOY_TOKEN"],
       * }).job("release", ({ job }) =>
       *   job.reusable().call("./.github/workflows/deploy.yml", deploy, {
       *     secrets: ({ secrets }) => ({ token: secrets.DEPLOY_TOKEN }),
       *   }));
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
 * Tsugiori checks contract names and requiredness without verifying the action implementation.
 * String values, including empty strings and whitespace, are preserved without trimming.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepswith
 * @example
 * ```ts
 * const value = { "fetch-depth": "0", ref: literal("main") } satisfies ActionInputs;
 * ```
 */
export type ActionInputs = Readonly<Record<string, ActionInput>>;
/** More-specific job/step values override workflow env; values in one env map cannot refer to each other.
 * Values may be empty or whitespace-only and are preserved without trimming; keys must be nonempty.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
 * @example
 * ```ts
 * const value = { CI: "true", NODE_ENV: "test" } satisfies EnvironmentVariables;
 * ```
 */
export type EnvironmentVariables = Readonly<Record<string, string>>;
/** Concurrency restricts jobs or workflow runs sharing a group to one running member. By default, a new pending member replaces the existing pending member.
 * Tsugiori supports queue max only with cancellation disabled; scenarios do not simulate scheduling.
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
   * Literal values must be integers from 1 to 360; scenarios do not measure time.
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
     * Tsugiori scenarios do not simulate cancellation or scheduling.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
     */
    failFast?: boolean;
    /** Creates a job for each combination of axis values. include can add values to compatible combinations or add new combinations; an include-only matrix runs one job per object. GitHub allows at most 256 jobs per matrix.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategymatrix
     */
    matrix: string | StaticMatrix;
  }>;
  /** Materialized native concurrency settings. Author with concurrency() and
   * see {@link Concurrency} for grouping, cancellation and queue semantics. */
  concurrency?: Concurrency;
}>;

/** GitHub evaluates expressions enclosed by `${{ }}` in workflow fields using contexts, operators and functions.
 * Tsugiori inserts caller-asserted syntax without checking context availability or evaluating it during generation.
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
 * This lowered representation is not executed during generation or scenarios.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
 */
export type AuthoringUsesStep = Readonly<{
  /** Materialized uses step discriminator. */
  type: "uses";
  /** Local composite definition retained for automatic collection and nested-call validation.
   */
  calleeAction?: AuthoringCompositeAction;
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
   * Literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
}>;
/** A run step executes commands in a new shell process on the runner.
 * Script values remain unchanged through YAML literal-block emission.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
 */
export type AuthoringRunStep = Readonly<{
  /** Materialized run step discriminator. */
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
   * Literal values must be integers from 1 to 360; scenarios do not measure time.
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
 * The task body remains outside YAML and is invoked through a normal Actions step.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
 */
export type AuthoringTaskStep = Readonly<{
  /** Materialized task step discriminator. */
  type: "task";
  /** Task body working directory override; default is the native job/step working directory. It does not select the preparation Deno project.
   */
  workingDirectory?: string;
  /** A unique job identifier used by needs and output/result references.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_id
   */
  id?: string;
  /** The job display name in the run UI. If omitted, GitHub uses the job id.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idname
   */
  name: string;
  /** Named input values or contracts for this representation. See the owning type for authoring references versus native fixture values.
   */
  inputs: Readonly<
    Record<
      string,
      Readonly<
        {
          /** Value validator shared by producing and consuming tasks. See textValue() and jsonValue().
           */
          contract: ValueContract<
            unknown
          >;
          /** Source expression evaluated by GitHub and parsed with contract before the task body runs.
           */
          from: string;
          /** Allows an absent wire value, represented as null in the task body.
           */
          optional: boolean;
        }
      >
    >
  >;
  /** Native task output validators and required-write flags. The task writes through TaskContext.outputs.set(); these declarations do not map job outputs. */
  outputs: OutputDefinitions;
  /** Task body executed on the compiled runtime after inputs have been parsed.
   * It receives native values, output writers, cwd and logging; generation and
   * scenarios never invoke it. A rejection fails the task step.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({ name: "Report", inputs: {}, outputs: {}, run: ({ logger }) => logger.info("done") });
   * ```
   */
  run: (
    context: TaskContext<InputDefinitions, OutputDefinitions>,
  ) => void | Promise<void>;
  /** Serialized step condition evaluated by GitHub when this task step is reached. The body does not run when skipped.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idif
   */
  if?: string;
  /** Allows the job to continue successfully even if this step fails. Defaults to false. The failed step retains a failure outcome but has a success conclusion.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepscontinue-on-error
   */
  continueOnError?: boolean;
  /** The maximum job runtime in whole minutes before cancellation. GitHub defaults to 360 minutes; runner and token limits can further constrain execution.
   * Literal values must be integers from 1 to 360; scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes
   */
  timeoutMinutes?: number | string;
  /** Environment variables available to all steps in this scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   */
  env?: EnvironmentVariables;
}>;
/** Materialized action, shell or task step. Prefer the corresponding builder methods on {@link Exec}; these records are generated definitions, not commands to execute on the host.
 */
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
     * Tsugiori retains the local workflow definition for typed validation and scenario interpretation.
     * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iduses
     */
    callee?: AuthoringWorkflow;
    /** Steps executed in sequence on this job's runner; they share a workspace but run scripts use separate shell processes.
     * Reusable caller jobs keep this array empty and emit no steps field.
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
   * When omitted, Tsugiori uses the workflow path rather than GitHub's workflow-file-path fallback.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#name
   */
  name: string;
  /** The workflow YAML file path. GitHub discovers .yml and .yaml files under .github/workflows.
   * Generation writes this path relative to the Deno project directory.
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
  /** Completed jobs in this workflow. Author jobs in dependency order and refer to them through needs().
   */
  jobs: readonly AuthoringJob[];
}>;
/** Materialized project returned by {@link defineProject}. Pass it to runProject for generation. Workflow and Action metadata paths are relative to the invocation Deno project, not the source module URL.
 */
export type ProjectConfig = Readonly<{
  /** Discriminant identifying the representation or result category.
   */
  kind: "github-actions.project";
  /** Positive safe integer, default 1. Increase for changes to remote dependencies, lockfiles or Deno settings outside the automatically tracked local module graph. See {@link defineProject}.
   */
  cacheVersion: number;
  /** Checkout-relative ./ Action path for an unreleased source checkout. Released packages select their matching preparation Action automatically.
   */
  localTaskPrepareAction?: string;
  /** Task body working directory override; default is the native job/step working directory. It does not select the preparation Deno project.
   */
  workingDirectory: string;
  /** Completed workflows to generate together; include local reusable callees. See {@link defineProject}.
   */
  workflows: readonly AuthoringWorkflow[];
  /** Additional completed composite Action roots. Internal references from workflows and these roots are generated automatically; repeated definitions generate once. An Action-only project is allowed. See {@link defineCompositeAction} and {@link defineProject}.
   */
  actions?: readonly AuthoringCompositeAction[];
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
   * When omitted, Tsugiori uses the workflow path rather than GitHub's workflow-file-path fallback.
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
   * This list narrows reference names; it neither creates variables nor changes GitHub configuration.
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
   * This list narrows reference names; it does not create, populate or authorize secrets.
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
  : E;
type ContractOutputs<C extends ActionContract> = C extends
  { outputs: infer O extends object } ? O : E;
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

/** Empty authoring context or reference map. No runtime values are stored here. */
export type E = Record<never, never>;

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type StateDefaults = {
  needs: E;
  matrix: E;
  vars: string;
  secrets: string;
  inputs: E;
  outputs: readonly [];
  proof: never;
  call: E;
  outputKeys: never;
};
// Conditional resolution materializes the small context instead of retaining
// the source parameter bag as a second alias in LSP displays.
type Compact<Values> = [Values] extends [unknown] ? {
    readonly [
      K in keyof Values as K extends keyof StateDefaults
        ? Same<Values[K], StateDefaults[K]> extends true ? never : K
        : K
    ]: Values[K];
  } extends infer C
    ? keyof C extends never ? E : { readonly [K in keyof C]: C[K] }
  : never
  : never;
type Setting<C, K extends PropertyKey, Bound, Default extends Bound> = C extends
  { readonly [P in K]: infer V extends Bound } ? V : Default;
/** Authoring context carried by state aliases. Omitted fields retain the defaults
 * of the owning state. These are type-level settings, not runtime configuration.
 * Inferred states supply this context automatically; consumers need no annotation.
 */
export interface StateEnv {
  /** Declared dependency output names. */ readonly needs?: Record<
    string,
    readonly string[]
  >;
  /** Inferred matrix row. */ readonly matrix?: object;
  /** Available variable names. */ readonly vars?: string;
  /** Available secret names. */ readonly secrets?: string;
  /** Native workflow or composite input values. */ readonly inputs?: object;
  /** Declared job output names. */ readonly outputs?: readonly string[];
  /** Paths proven present by an authoring condition. */ readonly proof?:
    string;
  /** Reusable workflow call contract. */ readonly call?: WorkflowCall;
  /** Declared reusable workflow output keys. */ readonly outputKeys?: string;
}

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
export interface JR<
  WorkflowPath extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Test extends object = object,
> {
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
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.outputs.version,
   *           }),
   *         }),
   *   );
   * ```
   */
  readonly id: JobId;
  /** Project-relative workflow output path identifying the owning workflow.
   */
  readonly workflowPath: WorkflowPath;
  /** Declared output keys available for typed references; this does not contain their execution-time values.
   */
  readonly outputNames: Outputs;
  /** Retained task output contracts for direct passthrough references. Computed expressions do not retain validation contracts.
   */
  readonly contracts?: Readonly<Record<string, ReferenceBinding>>;
  /** Type-level job fixture shape for scenario inference; not runtime output data.
   */
  readonly [testJobShape]?: Test;
}
const testStepShape: unique symbol = Symbol("tsugiori.test-step-shape");
const testJobShape: unique symbol = Symbol("tsugiori.test-job-shape");
const testWorkflowShape: unique symbol = Symbol("tsugiori.test-workflow-shape");
/** Native fixture input/output shape retained by the authoring type. Use TestStepOf for extraction; no authored step is executed by a scenario.
 */
export interface TS<
  Inputs = Record<string, unknown>,
  Outputs = Record<string, unknown>,
> {
  /** Named input values or contracts for this representation. See the owning type for authoring references versus native fixture values.
   */
  readonly inputs: Inputs;
  /** Named outputs or output contracts for this representation. See the owning type and its output mapping method; declaration alone does not write a value.
   */
  readonly outputs: Outputs;
}
/** Step and matrix fixture shapes retained by a completed job. Used by the scenario API to infer IDs and native values.
 */

export interface TJ<
  Steps extends StepReferences = StepReferences,
  Matrix extends object = object,
> {
  /** Named completed steps or ordered materialized definitions. Only explicit step IDs are available for references and scenario fixtures.
   */
  readonly steps: Steps;
  /** Concrete matrix row shape used by scenario fixtures. */
  readonly matrix: Matrix;
}
/** Extracts the named step fixture shapes from a completed job type. See {@link TJ}.
 */

export type TestStepsOf<Job> = Job extends {
  /** Type-level job fixture shape for scenario inference; not runtime output data.
   */
  readonly [testJobShape]?: infer T;
} ? T extends TJ<infer Steps, object> ? Steps : never
  : never;
/** Extracts the per-instance matrix value shape from a completed job type. See {@link TJ}.
 */
export type TestMatrixOf<Job> = Job extends {
  /** Type-level job fixture shape for scenario inference; not runtime output data.
   */
  readonly [testJobShape]?: infer T;
} ? T extends TJ<StepReferences, infer Matrix> ? Matrix : never
  : never;
/** Extracts native fixture input/output types from a named step reference. See {@link TS}.
 */
export type TestStepOf<Step> = Step extends {
  /** Type-level step fixture shape for scenario inference; not runtime output data.
   */
  readonly [testStepShape]?: infer T;
} ? T
  : never;
/** Extracts the completed job fixture shapes from a workflow. Used to parameterize WorkflowScenario.
 */
export type TestJobsOf<Workflow> = Workflow extends {
  /** Type-level completed workflow shape for scenario inference.
   */
  readonly [testWorkflowShape]?: infer Jobs;
} ? Jobs
  : never;
type JobReferences = Readonly<
  Record<string, JR<string, string, readonly string[]>>
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
 * Tsugiori exposes only declared step ids and output names.
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
export interface SR<
  Id extends string = string,
  Outputs extends readonly string[] = readonly string[],
  Test extends TS = TS,
> {
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
  readonly id: Id;
  /** String output references from an earlier action or run step, read as steps.<id>.outputs.<name>.
   * This map contains runtime expression references, not values evaluated during generation.
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
  readonly outputs: Readonly<
    Outputs extends {
      /** Type-level Action metadata used to infer inputs and output keys.
       */
      readonly __actionMetadata: infer M;
    } ? { [K in keyof M]: ActionOutputReference<Id, K & string> }
      : {
        [OutputName in Outputs[number]]: ActionOutputReference<Id, OutputName>;
      }
  >;
  /** Declared output keys available for typed references; this does not contain their execution-time values.
   */
  readonly outputNames: Outputs;
  /** Retained task output contracts for direct passthrough references. Computed expressions do not retain validation contracts.
   */
  readonly contracts?: Readonly<Record<string, ReferenceBinding>>;
  /** Type-level step fixture shape for scenario inference; not runtime output data.
   */
  readonly [testStepShape]?: Test;
}
type StepReferences = Readonly<Record<string, SR>>;
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
  Dependencies extends readonly JR<
    string,
    string,
    readonly string[]
  >[],
> = [Dependencies] extends [unknown]
  ? { readonly [D in Dependencies[number] as D["id"]]: D["outputNames"] }
  : never;
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
type TaskInputDefinitions = Readonly<
  Record<
    string,
    Readonly<{
      contract: ValueContract<unknown>;
      from: ExpressionInput;
    }>
  >
>;
type AuthoringValue<Value, Context> = Value | ((context: Context) => Value);
type StepEnv<
  Needs extends Record<string, readonly string[]>,
  Steps extends StepReferences,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = AuthoringValue<
  Readonly<Record<string, string | Expression<unknown>>>,
  Scope<
    "jobs.<job_id>.steps.env",
    Needs,
    OutputMap<Steps>,
    Matrix,
    Vars,
    Secrets,
    InputValues
  >
>;
type JobEnv<
  Needs extends Record<string, readonly string[]>,
  Matrix extends object,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = AuthoringValue<
  Readonly<Record<string, string | Expression<unknown>>>,
  Scope<
    "jobs.<job_id>.env",
    Needs,
    E,
    Matrix,
    Vars,
    Secrets,
    InputValues
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
   * Literal values must be integers from 1 to 360; expression results are checked by GitHub. Scenarios do not measure time.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   timeoutMinutes: () => literal(10),
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
  /** Environment variables supplied as a static map or one authoring callback returning the complete map in the step env scope. A step value overrides a job value, which overrides a workflow value. Values in the same map cannot refer to each other. Workflow env is not forwarded to reusable workflows.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#env
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   name: "Build",
   *   run: "deno test",
   *   env: ({ github }) => ({ SHA: github.sha }),
   * });
   * ```
   */
  env?: StepEnv<Needs, Steps, Matrix, Vars, Secrets, InputValues>;
}>;
/** A uses step runs an action with named inputs. GitHub evaluates conditions and input expressions at runtime.
 * Tsugiori scenarios use fixtures rather than executing actions.
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
  Needs extends Record<string, readonly string[]> = E,
  Steps extends StepReferences = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> =
  & Omit<StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>, "name">
  & Readonly<{
    /** Optional display name; references use id instead. */
    name?: string;
    /** Unique ID exposing the contract's output names to later steps. */
    id?: Id extends keyof Steps ? never : Id;
  }>
  & (C extends ActionContract ? Readonly<{
      /** Override the complete implementation reference, including local paths
       * and forks. Tsugiori keeps the declared input/output contract and does not
       * prove that the new implementation matches it.
       * @example In a `defineWorkflow().job()` callback with `{ job }`, given a completed `versionAction`.
       * ```ts
       * job.runsOn("ubuntu-latest").uses(versionAction, { uses: "my-org/version@v1" });
       * ```
       */
      uses?: string;
    }>
    : Readonly<{
      /** Omit when the first uses() argument is an implementation string. */
      uses?: never;
    }>)
  & (RequiredContractKeys<C> extends never ? Readonly<{
      /** Named string inputs. Required contract inputs without defaults must be
       * supplied; a callback form is documented on UsesStepOptions.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: { ref: "main" } });
       * ```
       */
      with?: ActionValues<C>;
    }>
    : Readonly<{
      /** Named string inputs. Required contract inputs without defaults must be
       * supplied; a callback form is documented on UsesStepOptions.
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: { ref: "main" } });
       * ```
       */
      with: ActionValues<C>;
    }>);

/** Step settings for a direct action contract or implementation reference. */
export type UsesStepOptions<
  C extends ActionContract | string = string,
  Id extends string | undefined = undefined,
  Needs extends Record<string, readonly string[]> = E,
  Steps extends StepReferences = E,
  Matrix extends object = E,
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
        /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
         * ```
         */
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
        /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
         * @example In a `defineWorkflow().job()` callback with `{ job }`.
         * ```ts
         * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
         * ```
         */
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
 * The outputs list declares reference names; scenarios do not execute the script.
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
export interface RunStepDefinition<
  Id extends string | undefined = undefined,
  Outputs extends readonly string[] = readonly [],
  Needs extends Record<string, readonly string[]> = E,
  Steps extends StepReferences = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> extends StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues> {
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
  readonly id?: Id;
  /** Runs command-line programs of at most 21,000 characters using the runner shell. Each run step starts a fresh non-login shell process; multiline commands within one step share that process. Shell state does not persist to the next step.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({ name: "Build", run: "deno test" });
   * ```
   */
  readonly run: string;
  /** Named outputs exposed to subsequent consumers. A run step sets string values by appending `name=value` to the GITHUB_OUTPUT environment file.
   * This list declares output names for typed references; it does not write values or execute the script.
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
  readonly outputs?: Outputs;
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
  readonly workingDirectory?: string;
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
  readonly shell?: string;
}
/** A step condition can skip execution, and continue-on-error can prevent a step failure from failing the job.
 * Typed task input/output contracts and the task callback are additional runtime contracts, not GitHub workflow fields.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
 * @example In a `defineWorkflow().job()` callback with `{ job }`.
 * ```ts
 * job.runsOn("ubuntu-latest").task({
 *   id: "version",
 *   name: "Read version",
 *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
 *   outputs: { version: { contract: textValue(), required: true } },
 *   run: async ({ inputs, outputs, logger }) => {
 *     logger.info(inputs.sha);
 *     await outputs.set("version", "1.0.0");
 *   },
 * });
 * ```
 */

export interface TaskStepDefinition<
  Id extends string | undefined = undefined,
  Inputs extends TaskInputDefinitions = E,
  Outputs extends OutputDefinitions = E,
  Needs extends Record<string, readonly string[]> = E,
  Steps extends StepReferences = E,
  Matrix extends object = E,
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
> extends
  Omit<StepCommon<Needs, Steps, Matrix, Vars, Secrets, InputValues>, "if"> {
  /** Task body working directory override; default is the native job/step working directory. It does not select the preparation Deno project.
   */
  readonly workingDirectory?: string;
  /** Unique step ID for typed output references.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  readonly id?: Id;
  /** Build a GitHub step condition in the field context. The callback runs
   * during authoring and returns a boolean expression; GitHub decides whether
   * to run the task. present() can guard optional typed input references.
   * See {@link TaskStepDefinition} and present() for absence handling.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   name: "Report", inputs: {}, outputs: {},
   *   if: ({ github }) => github.ref.eq("refs/heads/main"),
   *   run: ({ logger }) => logger.info("main branch"),
   * });
   * ```
   */
  readonly if?: Condition;
  /** Pairs each input contract with its runtime expression source. Accepts a static map or one authoring callback returning all bindings. Its context retains earlier output types and presence proofs from job/task conditions; run receives parsed native values.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  readonly inputs: AuthoringValue<
    Inputs,
    Scope<
      "jobs.<job_id>.steps.env",
      Needs,
      OutputMap<Steps>,
      Matrix,
      Vars,
      Secrets,
      InputValues,
      Proof | ConditionProof<Condition>
    >
  >;
  /** Declares native output contracts and whether each write is required.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  readonly outputs: Outputs;
  /** Runs in the compiled task runtime with native values; await output writes.
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
   *   outputs: { version: { contract: textValue(), required: true } },
   *   run: async ({ inputs, outputs, logger }) => {
   *     logger.info(inputs.sha);
   *     await outputs.set("version", "1.0.0");
   *   },
   * });
   * ```
   */
  readonly run: (
    context: TaskContext<Inputs, Outputs, Proof | ConditionProof<Condition>>,
  ) => void | Promise<void>;
}
const jobDefinition = Symbol("tsugiori.job-definition");
/** Identity key carrying a completed composite definition. Obtain it through {@link defineCompositeAction}; do not fabricate a definition or use this as a GitHub runtime value.
 */
export const compositeActionDefinition = Symbol(
  "tsugiori.composite-action-definition",
);
const workflowDefinition = Symbol("tsugiori.workflow-definition");
/** Workflow identity consumed by scenario(). Obtain one from {@link defineWorkflow} with at least one completed job; the identity ties the scenario to its authoring definition.
 */
export interface TestableWorkflow {
  /** Retained workflow identity for generation; obtain through defineWorkflow().
   */
  readonly [workflowDefinition]: AuthoringWorkflow;
  /** Type-level completed workflow shape for scenario inference.
   */
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
/** Completed job or composite step sequence accepted by its defining callback. Return the state belonging to that callback; returning a state from another definition is rejected. Output mappings finalize the sequence.
 */
export interface JobDone<
  WorkflowPath extends string = string,
  JobId extends string = string,
  Outputs extends readonly string[] = readonly [],
  Steps extends StepReferences = StepReferences,
  Matrix extends object = object,
> {
  /** Retained job identity tying the finalized state to its originating callback.
   */
  readonly [jobDefinition]: FinalizedJobDefinition<
    WorkflowPath,
    JobId,
    Outputs
  >;
  /** Type-level job fixture shape for scenario inference; not runtime output data.
   */
  readonly [testJobShape]?: TJ<Steps, Matrix>;
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
/** Native run/Action step reference with string scenario outputs. Its names and
 * fixture values follow the declarations; no execution-time value is stored.
 */
export type NS<Id extends string, Outputs extends readonly string[]> = SR<
  Id,
  Outputs,
  TS<Record<string, unknown>, Record<Outputs[number], string>>
>;
type DefinitionStepReference<Definition> = Definition extends
  Readonly<{ id: infer Id extends string }> ? NS<
    Id,
    Definition extends Readonly<{ actionOutputNames: unknown }>
      ? Invocation<Definition>
      : Definition extends
        Readonly<{ run: string; outputs: infer O extends readonly string[] }>
        ? O
      : TaskOutputs<Definition>
  >
  : never;
type AddStepReference<Definition, Steps extends StepReferences> =
  [DefinitionStepId<Definition>] extends [never] ? Steps : {
    readonly [K in keyof Steps | DefinitionStepId<Definition>]: K extends
      keyof Steps ? Steps[K] : DefinitionStepReference<Definition>;
  };
/** Typed task reference retaining native fixture inputs and the full output
 * contracts, including optional outputs. Obtain it from a named task step.
 */
export type TR<
  Id extends string,
  Inputs extends Record<string, unknown>,
  Outputs extends OutputDefinitions,
> = SR<Id, TypedNames<Outputs>, TS<Inputs, OutputValues<Outputs>>>;
type NativeInputs<I extends InputDefinitions> = [I] extends [unknown]
  ? { readonly [K in keyof InputValues<I>]: InputValues<I>[K] }
  : never;
type AddTaskReference<
  Id extends string | undefined,
  I extends InputDefinitions,
  O extends OutputDefinitions,
  Steps extends StepReferences,
> = Id extends string ? {
    readonly [K in keyof Steps | Id]: K extends keyof Steps ? Steps[K]
      : TR<Id, NativeInputs<I>, O>;
  }
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
 * Configure strategy before fields that reference its inferred matrix.
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
export type Exec<
  WorkflowPath extends string,
  JobId extends string,
  CEnv extends StateEnv = E,
> = ExecBase<
  WorkflowPath,
  JobId,
  Setting<CEnv, "needs", Record<string, readonly string[]>, E>,
  Setting<CEnv, "matrix", object, E>,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>,
  Setting<CEnv, "proof", string, never>
>;
type ExecOf<
  WorkflowPath extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
> = Compact<{
  needs: Needs;
  matrix: Matrix;
  vars: Vars;
  secrets: Secrets;
  inputs: InputValues;
  proof: Proof;
}> extends infer Context extends StateEnv ? Exec<WorkflowPath, JobId, Context>
  : never;
/** Method surface of {@link Exec}; its context is inferred by the DSL. */
interface ExecBase<
  WorkflowPath extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Proof extends string = never,
> {
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
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
          E,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >,
      ) => Expression<string> | string | NonEmptyReadonlyArray<string>),
  ): ExecOf<
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
        E,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >,
  ): ExecOf<
    WorkflowPath,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Job env overrides workflow env; values within one map cannot depend on one another. Accepts a static map or one authoring callback returning the complete map.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenv
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").env(({ github }) => ({ SHA: github.sha }));
   * ```
   */
  env(
    value: JobEnv<Needs, Matrix, Vars, Secrets, InputValues>,
  ): ExecOf<
    WorkflowPath,
    JobId,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Run defaults apply to run steps; explicit step shell/directory wins. A static object or authoring callback returns shell and workingDirectory together in the defaults scope.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrun
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").defaultsRun(({ github }) => ({
   *   shell: "bash",
   *   workingDirectory: github.workspace,
   * }));
   * ```
   */
  defaultsRun(
    value: AuthoringValue<
      Readonly<
        {
          /** The command interpreter for run steps, for example bash, pwsh or cmd. Overrides job defaults; otherwise the runner chooses its platform default. On Linux/macOS the default is bash with sh fallback; Windows defaults to pwsh with powershell fallback. Explicit bash enables pipefail in addition to -e; a custom shell command must include {0} for the script file.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").defaultsRun(({ github }) => ({
           *   shell: "bash",
           *   workingDirectory: github.workspace,
           * }));
           * ```
           */
          shell?: string | ExpressionInput;
          /** The directory in which the run script executes. Overrides job defaults; otherwise uses the default workspace directory. The directory must already exist on the runner.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsworking-directory
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").defaultsRun(({ github }) => ({
           *   shell: "bash",
           *   workingDirectory: github.workspace,
           * }));
           * ```
           */
          workingDirectory?: string | ExpressionInput;
        }
      >,
      Scope<
        "jobs.<job_id>.defaults.run",
        Needs,
        E,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >
    >,
  ): ExecOf<
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
      E,
      E,
      Vars,
      Secrets,
      InputValues
    >,
  >(
    condition: C,
  ): ExecOf<
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
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
         * Tsugiori scenarios do not simulate cancellation or scheduling.
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
  ): ExecOf<
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
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
        E,
        E,
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
       * Tsugiori scenarios do not simulate cancellation or scheduling.
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
  ): ExecOf<
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
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
        E,
        E,
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
       * Tsugiori scenarios do not simulate cancellation or scheduling.
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
  ): ExecOf<
    WorkflowPath,
    JobId,
    Needs,
    E,
    Vars,
    Secrets,
    InputValues,
    Proof
  >;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
         * Tsugiori scenarios do not simulate cancellation or scheduling.
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
          E,
          E,
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
         * Tsugiori scenarios do not simulate cancellation or scheduling.
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
  ): ExecOf<
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
   * Accepts a static object or one authoring callback returning the complete settings in the concurrency scope. Cancellation remains a static boolean. The queue max setting requires cancellation disabled; scenarios do not schedule.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").concurrency(({ github }) => ({
   *   group: format("ci-{0}", github.ref),
   *   cancelInProgress: false,
   *   queue: "max",
   * }));
   * ```
   */
  concurrency(
    definition: AuthoringValue<
      Readonly<
        {
          /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          group: ExpressionInput;
          /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          cancelInProgress: boolean;
          /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          queue?: "max";
        }
      >,
      Scope<
        "jobs.<job_id>.concurrency",
        Needs,
        E,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >
    >,
  ): ExecOf<
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
   * Tsugiori supports contents, id-token, actions and pull-requests; scenarios do not verify authorization.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").permissions({ contents: "read" });
   * ```
   */
  permissions(
    value: WorkflowPermissions,
  ): ExecOf<
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
   * Literal values retain a 1–360 integer limit; expression values pass through. Scenarios do not measure time.
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
        E,
        Matrix,
        Vars,
        Secrets,
        InputValues
      >,
  ): ExecOf<
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
   * Tsugiori supports the name only, not the structured name/url form; scenarios do not enforce protections.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").environment("production");
   * ```
   */
  environment(
    value: string,
  ): ExecOf<
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
   * Tsugiori scenarios represent action behavior with fixtures.
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
            E,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
      : [
        options:
          & ObjectUsesStepOptions<
            NoInfer<C>,
            Id,
            Needs,
            E,
            Matrix,
            Vars,
            Secrets,
            InputValues
          >
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
  ): StepOf<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, E>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    readonly [],
    Proof
  >;
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori scenarios represent action behavior with fixtures.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   * @example
   * In a `defineWorkflow().job()` callback with `{ job }`.
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
    options:
      & Omit<
        ObjectUsesStepOptions<
          NoInfer<C>,
          Id,
          Needs,
          E,
          Matrix,
          Vars,
          Secrets,
          InputValues
        >,
        "with"
      >
      & Readonly<
        {
          /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
           * ```
           */
          with: (
            context: Scope<
              "jobs.<job_id>.steps.with",
              Needs,
              OutputMap<E>,
              Matrix,
              Vars,
              Secrets,
              InputValues
            >,
          ) => R;
        }
      >
      & CheckedActionValues<C, NoInfer<R>>,
  ): StepOf<
    WorkflowPath,
    JobId,
    AddStepReference<ActionStepDefinition<C, Id>, E>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    readonly [],
    Proof
  >;
  /** Executes commands in a new runner shell process. Explicit shell and working directory override job defaults; shell state does not persist between run steps.
   * Tsugiori preserves the script through YAML emission; scenarios do not execute it.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   *   env: ({ github }) => ({ SHA: github.sha }),
   * });
   * ```
   */
  run<
    const D extends RunStepDefinition<
      string | undefined,
      readonly string[],
      Needs,
      E,
      Matrix,
      Vars,
      Secrets,
      InputValues
    >,
  >(
    definition: D,
  ): StepOf<
    WorkflowPath,
    JobId,
    AddStepReference<D, E>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    readonly [],
    Proof
  >;
  /** Steps run sequentially within a job. Their conditions, environment, timeouts and continue-on-error policy determine execution and failure handling.
   * Tsugiori creates a step invoking the task runtime; the task body remains outside YAML and uses typed task I/O.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").task({
   *   id: "version",
   *   name: "Read version",
   *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
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
    const I extends TaskInputDefinitions,
    const O extends OutputDefinitions,
    const C extends
      | StepField<
        "jobs.<job_id>.steps.if",
        Needs,
        E,
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
        E,
        Matrix,
        Vars,
        Secrets,
        InputValues,
        Proof,
        C
      >
      & Readonly<{
        /** Named outputs or output contracts for this representation. See the owning type and its output mapping method; declaration alone does not write a value.
         */
        outputs: O;
        /** GitHub runtime condition. A callback builds the expression during authoring; it does not decide whether to run on the host.
         */
        if?: C;
        /** Allows a failed step to have a successful conclusion. Task output references become optional because execution may fail before writing them.
         */
        continueOnError?: F;
      }>,
  ): StepOf<
    WorkflowPath,
    JobId,
    AddTaskReference<Id, I, EffectiveOutputs<O, C, F>, E>,
    Needs,
    Matrix,
    Vars,
    Secrets,
    InputValues,
    readonly [],
    Proof
  >;
}
/** Immutable composite sequence after its first step. Append steps before
 * mapping public outputs with {@link CStep.outputs}. See
 * {@link CompositeDraft.steps} for the defining callback and
 * {@link defineCompositeAction} for distribution and local uses resolution.
 */
export type CStep<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  CEnv extends StateEnv = E,
> = CStepBase<
  WorkflowPath,
  JobId,
  Steps,
  Setting<CEnv, "needs", Record<string, readonly string[]>, E>,
  Setting<CEnv, "matrix", object, E>,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>,
  Setting<CEnv, "outputs", readonly string[], readonly []>,
  Setting<CEnv, "proof", string, never>
>;
type CStepOf<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> = Compact<{
  needs: Needs;
  matrix: Matrix;
  vars: Vars;
  secrets: Secrets;
  inputs: InputValues;
  outputs: Outputs;
  proof: Proof;
}> extends infer Context extends StateEnv
  ? CStep<WorkflowPath, JobId, Steps, Context>
  : never;
/** Method surface of {@link CStep}; its context is inferred by the DSL. */
interface CStepBase<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> extends JobDone<WorkflowPath, JobId, Outputs, Steps, Matrix> {
  /** Named completed steps or ordered materialized definitions. Only explicit step IDs are available for references and scenario fixtures.
   */
  readonly steps: Steps;

  /** Map declared public Action outputs to values from earlier steps. The callback runs during authoring and returns a complete name-to-expression map; GitHub resolves those expressions when the Action executes. Keys must exactly match ActionMetadata.outputs or steps() throws TypeError. Call after the producing steps and return this finalized state; no more steps can be appended. See {@link ActionMetadata} outputs, {@link RunStepDefinition} output names and {@link CompositeDraft.steps}.
   * @example Given a composite state `built` whose `build` run step declares `version`, and metadata declaring public output `version`.
   * ```ts
   * built.outputs(({ steps }) => ({ version: steps.build.outputs.version }));
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
  ): JobDone<
    WorkflowPath,
    JobId,
    JobOutputNames<Names>,
    Steps,
    Matrix
  >;

  /** Append an Action step. Contracts infer required string inputs and output names; a string uses reference has no declared outputs. The with callback runs during authoring and returns a string/string-expression map. Later steps can refer to outputs only when this step has an id. Composite local uses resolves in the caller workspace; no checkout is inserted. See {@link UsesStepOptions} and {@link ActionContract}.
   * @example Given a composite state `built` after an earlier step.
   * ```ts
   * built.uses("actions/checkout@v4", { id: "checkout", with: ({ github }) => ({ ref: github.sha }) });
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
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example Given a composite state `built` after an earlier step.
             * ```ts
             * built.uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
          & CheckedActionValues<C, NoInfer<R>>
          & Readonly<{
            /** Unsupported in composite Actions; omit this property. Workflow steps support a timeout through their native step settings.
             */
            timeoutMinutes?: never;
          }>,
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
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example Given a composite state `built` after an earlier step.
             * ```ts
             * built.uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
          & CheckedActionValues<C, NoInfer<R>>
          & Readonly<{
            /** Unsupported in composite Actions; omit this property. Workflow steps support a timeout through their native step settings.
             */
            timeoutMinutes?: never;
          }>,
      ]
  ): CStepOf<
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
  /** Append an Action step. Contracts infer required string inputs and output names; a string uses reference has no declared outputs. The with callback runs during authoring and returns a string/string-expression map. Later steps can refer to outputs only when this step has an id. Composite local uses resolves in the caller workspace; no checkout is inserted. See {@link UsesStepOptions} and {@link ActionContract}.
   * @example Given a composite state `built` after an earlier step.
   * ```ts
   * built.uses("actions/checkout@v4", { id: "checkout", with: ({ github }) => ({ ref: github.sha }) });
   * ```
   */
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
          /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
           * @example Given a composite state `built` after an earlier step.
           * ```ts
           * built.uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
           * ```
           */
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
      & CheckedActionValues<C, NoInfer<R>>
      & Readonly<{
        /** Unsupported in composite Actions; omit this property. Workflow steps support a timeout through their native step settings.
         */
        timeoutMinutes?: never;
      }>,
  ): CStepOf<
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

  /** Append a native shell step; shell is mandatory in a composite. Declaring outputs exposes names to later steps but the script must actually write GITHUB_OUTPUT. Callbacks for env and if build runtime expressions from earlier steps. See {@link RunStepDefinition}.
   * @example Given a composite state `built` after an earlier step.
   * ```ts
   * built.run({ id: "report", name: "Report", run: "echo done", shell: "bash" });
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
    definition:
      & AvailableStepDefinition<D, Steps>
      & Readonly<{
        /** Required interpreter for a composite run step, for example bash.
         */
        shell: string;
        /** Unsupported in composite Actions; omit this property. Workflow steps support a timeout through their native step settings.
         */
        timeoutMinutes?: never;
      }>,
  ): CStepOf<
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

  /** Append a compiled Deno task. The inputs map callback builds GitHub expressions during authoring; run executes later with parsed native inputs and an output writer. Composite tasks support workingDirectory and omit timeoutMinutes. See {@link TaskStepDefinition} and {@link defineCompositeAction}.
   * @example Given a composite state `built` after an earlier step.
   * ```ts
   * built.task({ name: "Report", inputs: {}, outputs: {}, run: ({ logger }) => logger.info("done") });
   * ```
   */
  task<
    const Id extends string | undefined,
    const I extends TaskInputDefinitions,
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
          /** Unsupported in composite Actions; omit this property. Workflow steps support a timeout through their native step settings.
           */
          timeoutMinutes?: never;
          /** Task body working directory override; default is the native job/step working directory. It does not select the preparation Deno project.
           */
          workingDirectory?: string;

          /** Map declared public Action outputs to values from earlier steps. The callback runs during authoring and returns a complete name-to-expression map; GitHub resolves those expressions when the Action executes. Keys must exactly match ActionMetadata.outputs or steps() throws TypeError. Call after the producing steps and return this finalized state; no more steps can be appended. See {@link ActionMetadata} outputs, {@link RunStepDefinition} output names and {@link CompositeDraft.steps}.
           * @example Given a composite state `built` whose `build` run step declares `version`, and metadata declaring public output `version`.
           * ```ts
           * built.outputs(({ steps }) => ({ version: steps.build.outputs.version }));
           * ```
           */
          outputs: O;

          /** GitHub runtime condition. A callback builds the expression during authoring; it does not decide whether to run on the host.
           */
          if?: C;

          /** Allows a failed step to have a successful conclusion. Task output references become optional because execution may fail before writing them.
           */
          continueOnError?: F;

          /** Unique step ID exposing declared outputs to later steps. IDs are distinct from display names.
           */
          id?: Exclude<Id, keyof Steps>;
        }
      >,
  ): CStepOf<
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

/** Public composite Action metadata passed to {@link defineCompositeAction}. Inputs are strings, including defaults. Output descriptions declare the public names; {@link CStep.outputs} separately maps those names to step expressions.
 */
export type ActionMetadata = Readonly<{
  /** Human-readable display name; references use IDs or output keys rather than this text.
   */
  name: string;
  /** Public description of the input, output or Action for its consumers.
   */
  description: string;
  /** Optional Action author attribution.
   */
  author?: string;
  /** Optional Marketplace icon and color metadata; it does not affect execution.
   */
  branding?: ActionContract["branding"];
  /** Public string input declarations. Their literal names become CompositeDraft.inputs references. Defaults are strings; callers must pass secrets explicitly.
   */
  inputs?: Readonly<
    Record<
      string,
      Omit<ActionContractInput, "default"> & {
        /** Value used by the Action when the caller omits this input. Composite input defaults must be strings.
         */
        default?: string;
      }
    >
  >;
  /** Public output descriptions and names. This metadata does not write values; finish the step sequence with CStep.outputs() mapping every declared name. See {@link CStep.outputs}.
   */
  outputs?: Readonly<
    Record<
      string,
      Readonly<{
        /** Public description of the input, output or Action for its consumers.
         */
        description: string;
      }>
    >
  >;
}>;

/** Materialized composite definition retained by {@link Composite}. Generation emits its metadata file and, for task steps, its source payload. Prefer {@link defineCompositeAction} to constructing records.
 */
export type AuthoringCompositeAction = Readonly<{
  /** Project-relative metadata output file, ending in action.yml or action.yaml.
   */
  path: string;
  /** Public name, description, input and output declarations. See {@link ActionMetadata}.
   */
  metadata: ActionMetadata;
  /** Native composite execution definition retained for generation.
   */
  runs: Readonly<{
    /** Native Action runtime discriminator, always composite for this definition.
     */
    using: "composite";
    /** Named completed steps or ordered materialized definitions. Only explicit step IDs are available for references and scenario fixtures.
     */
    steps: readonly AuthoringStep[];
  }>;
  /** Serialized step expressions mapped to public Action outputs. Author these with {@link CStep.outputs}.
   */
  outputValues: Readonly<Record<string, string>>;
}>;

type CompositeInputs<M extends ActionMetadata> = [M] extends [unknown] ? {
    readonly [K in keyof M["inputs"]]: string;
  }
  : never;
/** Completed composite Action usable as a contract in uses() and in
 * {@link defineProject}. Public inputs and outputs are strings even when an
 * internal task uses JSON. A uses step ID exposes declared output names to later
 * steps; the reference is a GitHub expression, not an already obtained value.
 * See {@link ActionMetadata} and {@link CStep.outputs} for declaration
 * and mapping before consumption.
 * @example In a `defineWorkflow().job()` callback with `{ job }`, given a completed `versionAction` declaring public output `version`.
 * ```ts
 * job.runsOn("ubuntu-latest").uses(versionAction, { id: "version" })
 *   .run({ name: "Report", run: 'echo "$VERSION"',
 *     env: ({ steps }) => ({ VERSION: steps.version.outputs.version }),
 *   });
 * ```
 */
export type Composite<M extends ActionMetadata> =
  & M
  & Readonly<{
    /** GitHub Action implementation reference. A contract supplies the default; a uses override selects a different implementation without proving that it matches the declared metadata.
     */
    uses: string;
    /** Retained composite identity for generation; obtain through defineCompositeAction().
     */
    [compositeActionDefinition]: AuthoringCompositeAction;
  }>;
/** Composite metadata and input references before its steps are defined. Call {@link CompositeDraft.steps} once and retain the returned immutable Action. See {@link defineCompositeAction}.
 */
export interface CompositeDraft<
  P extends string,
  M extends ActionMetadata,
> {
  /** References to the literal public input names declared in ActionMetadata.
   * Inputs remain GitHub string expressions; they are not host values.
   * Pass them into env, with or task input sources. See {@link ActionMetadata}.
   * @example Given a draft `inputAction` whose metadata declares input `who`.
   * ```ts
   * inputAction.inputs.who;
   * ```
   */
  readonly inputs: import("./expression.ts").Ref<CompositeInputs<M>, "inputs">;
  /** Define a nonempty composite step sequence. The callback runs now with step.run/uses/task and must return its own completed state. If metadata declares outputs, finish with {@link CStep.outputs}; keys must match exactly. Retain the returned Action for uses() and {@link defineProject}.
   * @example Given `draft` from defineCompositeAction with public output metadata for `version`.
   * ```ts
   * draft.steps(({ step }) => step.run({ id: "build", name: "Build", shell: "bash", run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"', outputs: ["version"] }).outputs(({ steps }) => ({ version: steps.build.outputs.version })));
   * ```
   */
  steps<Result extends JobDone<P, "composite", readonly string[]>>(
    define: (
      context: Readonly<
        {
          /** Composite step builder. Start with run(), uses() or task(), and return the final state. Composite run steps require shell; timeouts and direct secret names are unavailable.
           */
          step: Pick<
            CStepOf<
              P,
              "composite",
              E,
              E,
              E,
              string,
              never,
              CompositeInputs<M>
            >,
            "run" | "uses" | "task"
          >;
        }
      >,
    ) => Result,
  ): Composite<M>;
}

/**
 * Declare a composite Action metadata file and its public metadata, then define its steps.
 * The file is project-relative and must end in action.yml or action.yaml; parent traversal and absolute
 * paths throw TypeError. This call creates a draft, not an executable Action.
 * Call {@link CompositeDraft.steps}. Referenced internal Actions are collected automatically; use defineProject actions for additional generation roots.
 *
 * Output metadata describes the public interface. A run step declares output names
 * and writes their values to GITHUB_OUTPUT; a task declares contracts and calls
 * outputs.set(). After those steps, {@link CStep.outputs} maps their
 * references to every public metadata output. Give uses() an id to consume the
 * resulting Action outputs from later workflow/composite steps. Those references
 * build GitHub expressions, not values available during authoring.
 *
 * `defineCompositeAction(path, metadata).steps(...)` generates the specified
 * metadata file. Its parent directory owns local uses references and task payloads.
 * Root action.yml and action.yaml are supported. Directory arguments are rejected;
 * migrate them by appending /action.yml or /action.yaml. A project can contain actions, workflows,
 * or both. Common metadata remains separate from the composite execution part.
 * JavaScript and Docker action authoring are not implemented.
 *
 * The step builder supports `run`, `uses` and `task`, step conditions, env, and
 * `continueOnError`. Every authored `run` needs an explicit `shell`. Composite
 * steps do not support `timeoutMinutes`. Declare public output descriptions in
 * metadata and supply matching `.outputs(...)` mappings after the steps. Public
 * Action inputs and outputs are strings; task contracts validate internal text or
 * JSON values. Use `inputs` or explicit `env` mappings: composite actions do not
 * receive automatic `INPUT_*` variables. Secrets must be passed by callers.
 *
 * `.uses(action, options)` shares declared input names, requiredness and output
 * names. Generation recursively collects its definition. Generation resolves its local
 * reference from the project's checkout-relative `workingDirectory` (default
 * `.`). If the Deno project is `.github`, set `workingDirectory: ".github"`;
 * `actions/greet/action.yml` then generates there and is called as
 * `./.github/actions/greet`. This setting does not change task execution cwd.
 * An explicit `uses` override selects a different standard reference while keeping
 * the contract's types.
 *
 * Within a composite, a local `./` reference still points into the caller's
 * checkout, as GitHub specifies; it is not relative to the downloaded Action.
 * No checkout is injected. Use an external contract or explicit remote `uses`
 * reference when publishing a composite that invokes another repository action.
 * Handwritten callers use the generated directory with ordinary `uses`.
 * Publish the YAML with its repository to import a SHA-pinned contract through
 * the existing {@link ActionContract} type service; no contract file is
 * generated locally.
 *
 * Actions containing tasks also generate `.tsugiori/` beside the metadata file.
 * Commit this directory with the YAML. It contains the reachable local module
 * graph, discovered Deno configuration, workspace configuration, import maps,
 * lockfiles and the preparation bridge. The executable authoring entrypoint is
 * included; callers need no Tsugiori configuration. Remote dependencies remain
 * Deno-managed downloads on a cache miss, not vendored files. Dynamically computed
 * imports and runtime data files outside Deno's module graph are not automatically
 * packaged; make such resources part of the Action distribution explicitly.
 *
 * Preparation runs in the bundled project directory and reuses the task cache
 * lifecycle. Every task runs through a distinct normal Bash step, in the caller's
 * normal working directory unless its `workingDirectory` explicitly overrides
 * it. Task functions still support Linux/macOS X64/ARM64. Actions with only
 * `run`/`uses` steps have no task platform restriction or task payload.
 * `generate --check` compares both YAML and bundled payload bytes; it does not
 * remove obsolete or unconfigured files. Increment `cacheVersion` for changes to
 * settings or remote dependencies outside the tracked local module graph.
 *
 * @example
 * ```ts
 * defineCompositeAction("actions/version/action.yml", {
 *   name: "Version", description: "Expose a version",
 *   outputs: { version: { description: "Version string" } },
 * });
 * ```
 */
export function defineCompositeAction<
  const P extends string,
  const M extends ActionMetadata,
>(
  path: P,
  metadata: M,
): CompositeDraft<P, M> {
  if (
    !/^(?:\.\/)?[A-Za-z0-9._/-]+$/.test(path) ||
    path.split("/").includes("..") || path.startsWith("/") ||
    path.includes("//") ||
    !/^(?:.*\/)?action\.ya?ml$/.test(path)
  ) {
    throw new TypeError(
      "Action path must be a project-relative action.yml or action.yaml file without parent traversal; replace directory arguments with <directory>/action.yml.",
    );
  }
  metadata = copyNative(metadata);
  const normalized = posix.normalize(path);
  const directory = posix.dirname(normalized);
  const owner = Symbol(normalized);
  type Inputs = CompositeInputs<M>;
  type Start = CStepOf<
    P,
    "composite",
    E,
    E,
    E,
    string,
    never,
    Inputs
  >;
  return Object.freeze({
    inputs: scope("jobs.<job_id>.steps.env")
      .inputs as import("./expression.ts").Ref<Inputs, "inputs">,
    steps<Result extends JobDone<P, "composite", readonly string[]>>(
      define: (
        context: Readonly<{ step: Pick<Start, "run" | "uses" | "task"> }>,
      ) => Result,
    ): Composite<M> {
      const step = createExecutionJobFacade({
        workflowPath: path,
        id: "composite",
        owner,
        runsOn: "composite",
        needs: [],
        steps: [],
        references: {},
        contracts: new Map(),
        proofPaths: new Set(),
        composite: true,
      });
      const result = define({ step: step as unknown as Start });
      const definition = result[jobDefinition];
      if (!definition || definition.owner !== owner) {
        throw new TypeError("Composite steps must belong to this Action.");
      }
      const values = definition.job.outputs ?? {};
      if (
        Object.keys(values).sort().join("\0") !==
          Object.keys(metadata.outputs ?? {}).sort().join("\0")
      ) {
        throw new TypeError(
          "Composite output mappings must match declared metadata outputs.",
        );
      }
      const action: AuthoringCompositeAction = Object.freeze({
        path: normalized,
        metadata: copyNative(metadata),
        runs: Object.freeze({
          using: "composite",
          steps: definition.job.steps,
        }),
        outputValues: values,
      });
      return Object.freeze({
        ...copyNative(metadata),
        uses: directory === "." ? "./" : `./${directory}`,
        [compositeActionDefinition]: action,
      }) as Composite<M>;
    },
  });
}

/** Immutable workflow job after its first step. Add more steps or map outputs, then return this state from the job callback. Earlier states do not acquire steps added to a later state. See {@link Exec} and {@link Step.outputs}.
 */
export type Step<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  CEnv extends StateEnv = E,
> = StepBase<
  WorkflowPath,
  JobId,
  Steps,
  Setting<CEnv, "needs", Record<string, readonly string[]>, E>,
  Setting<CEnv, "matrix", object, E>,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>,
  Setting<CEnv, "outputs", readonly string[], readonly []>,
  Setting<CEnv, "proof", string, never>
>;
type StepOf<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> = Compact<{
  needs: Needs;
  matrix: Matrix;
  vars: Vars;
  secrets: Secrets;
  inputs: InputValues;
  outputs: Outputs;
  proof: Proof;
}> extends infer Context extends StateEnv
  ? Step<WorkflowPath, JobId, Steps, Context>
  : never;
/** Method surface of {@link Step}; its context is inferred by the DSL. */
interface StepBase<
  WorkflowPath extends string,
  JobId extends string,
  Steps extends StepReferences,
  Needs extends Record<string, readonly string[]> = E,
  Matrix extends object = E,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
  Outputs extends readonly string[] = readonly [],
  Proof extends string = never,
> extends JobDone<WorkflowPath, JobId, Outputs, Steps, Matrix> {
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
  ): JobDone<
    WorkflowPath,
    JobId,
    JobOutputNames<Names>,
    Steps,
    Matrix
  >;
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori scenarios represent action behavior with fixtures.
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
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
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
          & Readonly<{
            /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
             * @example In a `defineWorkflow().job()` callback with `{ job }`.
             * ```ts
             * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
             * ```
             */
            with?: R;
          }>
          & CheckedActionValues<C, NoInfer<R>>,
      ]
  ): StepOf<
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
  /** Runs an action with the supplied inputs, subject to the step condition, environment and failure policy.
   * Tsugiori scenarios represent action behavior with fixtures.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses
   * @example
   * In a `defineWorkflow().job()` callback with `{ job }`.
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
          /** Action input values, or a callback receiving field-scoped expression references and returning the input map. Values must be strings or string expressions; use toJSON() for number/boolean expressions.
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.runsOn("ubuntu-latest").uses("actions/checkout@v4", { with: ({ github }) => ({ ref: github.sha }) });
           * ```
           */
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
  ): StepOf<
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
   * Tsugiori preserves the script through YAML emission; scenarios do not execute it.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsrun
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn("ubuntu-latest").run({
   *   id: "build",
   *   name: "Build",
   *   run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"',
   *   outputs: ["version"],
   *   env: ({ github }) => ({ SHA: github.sha }),
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
  ): StepOf<
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
   * Tsugiori creates a step invoking the task runtime; the task body remains outside YAML and uses typed task I/O.
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
   *     inputs: ({ steps }) => ({
   *       version: {
   *         contract: version,
   *         from: steps.make.outputs.version,
   *       },
   *     }),
   *     outputs: {},
   *     run: ({ inputs, logger }) => {
   *       logger.info(inputs.version);
   *     },
   *   });
   * ```
   */
  task<
    const Id extends string | undefined,
    const I extends TaskInputDefinitions,
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
          /** Named outputs exposed to subsequent consumers. A run step sets string values by appending `name=value` to the GITHUB_OUTPUT environment file.
           * This list declares output names for typed references; it does not write values or execute the script.
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
           *   inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
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
  ): StepOf<
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
export type CallJob<
  P extends string,
  J extends string,
  CEnv extends StateEnv = E,
> = CallJobBase<
  P,
  J,
  Setting<CEnv, "needs", Record<string, readonly string[]>, E>,
  Setting<CEnv, "matrix", object, E>,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>
>;
type CallJobOf<
  P extends string,
  J extends string,
  N extends Record<string, readonly string[]> = E,
  M extends object = E,
  V extends string = string,
  S extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<
  { needs: N; matrix: M; vars: V; secrets: S; inputs: InputValues }
> extends infer Context extends StateEnv ? CallJob<P, J, Context> : never;
/** Method surface of {@link CallJob}; its context is inferred by the DSL. */
interface CallJobBase<
  P extends string,
  J extends string,
  N extends Record<string, readonly string[]> = E,
  M extends object = E,
  V extends string = string,
  S extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
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
      E,
      E,
      V,
      S,
      InputValues
    >,
  ): CallJobOf<P, J, N, M, V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
        E,
        E,
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
       * Tsugiori scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy(() => ({ matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<{ os: string }>() }));
       * ```
       */
      failFast?: boolean;
    }>,
  ): CallJobOf<P, J, N, Shape, V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
        E,
        E,
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
       * Tsugiori scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
       */
      failFast?: boolean;
    }>,
  ): CallJobOf<
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
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
         * Tsugiori scenarios do not simulate cancellation or scheduling.
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
  ): CallJobOf<P, J, N, Rows[number], V, S, InputValues>;
  /** Creates job variants from combinations of matrix values, available as matrix.<key>. An include-only matrix creates one job per object. failFast defaults to true and cancels remaining members on failure; GitHub allows at most 256 jobs.
   * Tsugiori supports static axes/include and expression matrices; scenarios do not simulate scheduling or fail-fast cancellation.
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
       * Tsugiori scenarios do not simulate cancellation or scheduling.
       * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstrategyfail-fast
       * @example In a `defineWorkflow().job()` callback with `{ job }`.
       * ```ts
       * job.reusable()
       *   .strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] }, failFast: false });
       * ```
       */
      failFast?: boolean;
    }>,
  ): CallJobOf<
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
        E,
        M,
        V,
        S,
        InputValues
      >,
  ): CallJobOf<P, J, N, M, V, S, InputValues>;
  /** Sets this job's GITHUB_TOKEN permissions, overriding the workflow map. Once any permission is specified, all unspecified permissions become none. Repository, organization and fork policies can reduce effective access.
   * Tsugiori supports contents, id-token, actions and pull-requests; scenarios do not verify authorization.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().permissions({ contents: "read" });
   * ```
   */
  permissions(
    value: WorkflowPermissions,
  ): CallJobOf<P, J, N, M, V, S, InputValues>;
  /** Allows at most one running member of a group in this repository. A new pending member normally replaces the old pending member; cancelInProgress also cancels the running member.
   * Accepts a static object or one authoring callback returning the complete settings in the concurrency scope. Cancellation remains a static boolean. The queue max setting requires cancellation disabled; scenarios do not schedule.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.reusable().concurrency(({ github }) => ({
   *   group: format("ci-{0}", github.ref),
   *   cancelInProgress: false,
   *   queue: "max",
   * }));
   * ```
   */
  concurrency(
    value: AuthoringValue<
      Readonly<
        {
          /** A concurrency group shared by jobs or runs in this repository. Only one member may run at a time. Names are case-insensitive; use distinct groups to avoid cancelling unrelated workflows.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          group: ExpressionInput;
          /** Whether a newly queued group member also cancels the currently running member. false keeps the running member.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          cancelInProgress: boolean;
          /** max allows up to 100 pending members instead of the default one; additional members are cancelled when the queue is full. Members are processed in order of starting to wait, not dispatch time. Cannot be combined with cancel-in-progress.
           * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency
           * @example In a `defineWorkflow().job()` callback with `{ job }`.
           * ```ts
           * job.reusable().concurrency(({ github }) => ({
           *   group: format("ci-{0}", github.ref),
           *   cancelInProgress: false,
           *   queue: "max",
           * }));
           * ```
           */
          queue?: "max";
        }
      >,
      Scope<
        "jobs.<job_id>.concurrency",
        N,
        E,
        M,
        V,
        S,
        InputValues
      >
    >,
  ): CallJobOf<P, J, N, M, V, S, InputValues>;
  /** Runs a reusable workflow as this job. The caller passes declared inputs through with and secrets through a map or inherit; the callee returns workflow outputs through needs.<caller_job>.outputs. Caller workflow env is not forwarded.
   * Pass an args object with static maps or separate with and secrets authoring callbacks. with excludes secrets; secrets includes them. Each callback runs once during call(), before contract validation in generation; GitHub resolves emitted expressions. Input and secret names, types and requiredness follow the callee contract.
   * Tsugiori requires the callee in the same project and validates its explicit contract; inherit cannot prove GitHub secret availability.
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
  call<
    const C extends WorkflowCall,
    O extends string,
    const W extends CallValues<NoInfer<C>> = CallValues<NoInfer<C>>,
    const T extends SecretValues<NoInfer<C>> | "inherit" =
      | SecretValues<NoInfer<C>>
      | "inherit",
  >(
    /** A reusable workflow runs as a separate workflow with its own jobs and steps.
     * Tsugiori retains the local workflow definition for typed validation and scenario interpretation.
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
      & {
        readonly [K in keyof WorkflowCallArguments<C>]: K extends "with"
          ? AuthoringValue<
            W & Readonly<Record<Exclude<keyof W, keyof CallInputs<C>>, never>>,
            Scope<
              "jobs.<job_id>.with.<with_id>",
              N,
              E,
              M,
              V,
              S,
              InputValues
            >
          >
          : AuthoringValue<
            T extends "inherit" ? T
              :
                & T
                & Readonly<
                  Record<Exclude<keyof T, keyof CallSecrets<C>>, never>
                >,
            Scope<
              "jobs.<job_id>.secrets.<secrets_id>",
              N,
              E,
              M,
              V,
              S,
              InputValues
            >
          >;
      }
      & Readonly<{
        /** Complete declared input map or a callback in the with scope, which excludes secrets.
         * @example In a job callback with `{ job }`, with a locally declared version contract.
         * ```ts
         * const versionWorkflow = defineWorkflow(".github/workflows/version.yml", {
         *   on: { workflow_call: { inputs: { version: { type: "string", required: true } } } },
         * }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }));
         * job.reusable().call("./.github/workflows/version.yml", versionWorkflow, {
         *   with: ({ github }) => ({ version: github.sha }),
         * });
         * ```
         */
        with?: AuthoringValue<
          W,
          Scope<
            "jobs.<job_id>.with.<with_id>",
            N,
            E,
            M,
            V,
            S,
            InputValues
          >
        >;
        /** Complete declared secret map, its authoring callback, or inherit. Only this field exposes secrets.
         * @example In a job callback with `{ job }`, with a locally declared version contract.
         * ```ts
         * const versionWorkflow = defineWorkflow(".github/workflows/version.yml", {
         *   on: { workflow_call: { inputs: { version: { type: "string", required: true } } } },
         * }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }));
         * job.reusable().call("./.github/workflows/version.yml", versionWorkflow, {
         *   with: { version: "1.0.0" }, secrets: "inherit",
         * });
         * ```
         */
        secrets?: AuthoringValue<
          T,
          Scope<
            "jobs.<job_id>.secrets.<secrets_id>",
            N,
            E,
            M,
            V,
            S,
            InputValues
          >
        >;
      }>,
  ): JobDone<P, J, readonly O[], E, M>;
  /** Runs a reusable workflow referenced by owner/repository/.github/workflows/file@ref or ./.github/workflows/file. Local paths use the caller commit; external references select a SHA, tag or branch and cannot use expressions.
   * Pass a static args object; with and secrets each accept a whole-map authoring callback in their own scope. with excludes secrets. Callbacks run once during rawCall(); GitHub resolves their expressions. Tsugiori input/output contracts are caller assertions; scenarios require a call fixture.
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
    args?: Readonly<{
      /** Complete input map. The authoring callback excludes secrets.
       * @example In a job callback with `{ job }`.
       * ```ts
       * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
       *   with: ({ github }) => ({ revision: github.sha }),
       * });
       * ```
       */
      with?: AuthoringValue<
        RawCallInputs,
        Scope<
          "jobs.<job_id>.with.<with_id>",
          N,
          E,
          M,
          V,
          S,
          InputValues
        >
      >;
      /** Complete secret map or inherit. The authoring callback includes secrets; inherit forwards only to the direct callee.
       * @example In a job callback with `{ job }`.
       * ```ts
       * job.reusable().rawCall("owner/repo/.github/workflows/build.yml@v1", {
       *   secrets: ({ secrets }) => ({ token: secrets.DEPLOY_TOKEN }),
       * });
       * ```
       */
      secrets?:
        | "inherit"
        | AuthoringValue<
          Readonly<Record<string, string | Expression<string>>>,
          Scope<
            "jobs.<job_id>.secrets.<secrets_id>",
            N,
            E,
            M,
            V,
            S,
            InputValues
          >
        >;
    }>,
  ): JobDone<P, J, readonly string[], E, M>;
}
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
export type JobInit<
  WorkflowPath extends string,
  JobId extends string,
  CEnv extends StateEnv = E,
> = JobInitBase<
  WorkflowPath,
  JobId,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>
>;
type JobInitOf<
  WorkflowPath extends string,
  JobId extends string,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{ vars: Vars; secrets: Secrets; inputs: InputValues }> extends
  infer Context extends StateEnv ? JobInit<WorkflowPath, JobId, Context>
  : never;
/** Method surface of {@link JobInit}; its context is inferred by the DSL. */
interface JobInitBase<
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
  reusable(): CallJobOf<
    WorkflowPath,
    JobId,
    E,
    E,
    Vars,
    Secrets,
    InputValues
  >;
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn(["self-hosted", "linux", "x64"]);
   * ```
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecOf<
    WorkflowPath,
    JobId,
    E,
    E,
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
export type DepJob<
  WorkflowPath extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]>,
  CEnv extends StateEnv = E,
> = DepJobBase<
  WorkflowPath,
  JobId,
  Needs,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>
>;
type DepJobOf<
  WorkflowPath extends string,
  JobId extends string,
  Needs extends Record<string, readonly string[]>,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{ vars: Vars; secrets: Secrets; inputs: InputValues }> extends
  infer Context extends StateEnv ? DepJob<WorkflowPath, JobId, Needs, Context>
  : never;
/** Method surface of {@link DepJob}; its context is inferred by the DSL. */
interface DepJobBase<
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
  reusable(): CallJobOf<
    WorkflowPath,
    JobId,
    Needs,
    E,
    Vars,
    Secrets,
    InputValues
  >;
  /** Selects the runner executing this job. A label array requires a runner matching every label, for example [self-hosted, linux, x64]. A single label can select a GitHub-hosted image such as ubuntu-latest.
   * Configure strategy before selecting a matrix-dependent runner; scenarios do not provision runners.
   * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idruns-on
   * @example In a `defineWorkflow().job()` callback with `{ job }`.
   * ```ts
   * job.runsOn(["self-hosted", "linux", "x64"]);
   * ```
   */
  runsOn(
    runner: string | NonEmptyReadonlyArray<string>,
  ): ExecOf<
    WorkflowPath,
    JobId,
    Needs,
    E,
    Vars,
    Secrets,
    InputValues
  >;
}
/** Initial execution-job configuration. Set runsOn() and add a run, uses or task step before returning the state. Configure matrix strategy before fields which reference matrix values; {@link JobScope} supplies earlier jobs for needs().
 */
export type Job<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  CEnv extends StateEnv = E,
> = JobBase<
  WorkflowPath,
  JobId,
  Jobs,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>
>;
type JobOf<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{ vars: Vars; secrets: Secrets; inputs: InputValues }> extends
  infer Context extends StateEnv ? Job<WorkflowPath, JobId, Jobs, Context>
  : never;
/** Method surface of {@link Job}; its context is inferred by the DSL. */
interface JobBase<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> extends JobInitBase<WorkflowPath, JobId, Vars, Secrets, InputValues> {
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
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.outputs.version,
   *           }),
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
  ): DepJobOf<
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
 *           env: ({ needs }) => ({
 *             VERSION: needs.build.outputs.version,
 *           }),
 *         }),
 *   );
 * ```
 */
export type JobAt<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  InputValues extends object = Readonly<Record<string, string>>,
> = keyof Jobs extends never
  ? JobInitOf<WorkflowPath, JobId, Vars, Secrets, InputValues>
  : JobOf<WorkflowPath, JobId, Jobs, Vars, Secrets, InputValues>;
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
 *           env: ({ needs }) => ({
 *             VERSION: needs.build.outputs.version,
 *           }),
 *         }),
 *   );
 * ```
 */
export type JobScope<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  CEnv extends StateEnv = E,
> = JobScopeBase<
  WorkflowPath,
  JobId,
  Jobs,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "inputs", object, E>
>;
type JobScopeOf<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{ vars: Vars; secrets: Secrets; inputs: InputValues }> extends
  infer Context extends StateEnv ? JobScope<WorkflowPath, JobId, Jobs, Context>
  : never;
/** Method surface of {@link JobScope}; its context is inferred by the DSL. */
interface JobScopeBase<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Vars extends string,
  Secrets extends string,
  InputValues extends object = Readonly<Record<string, string>>,
> {
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
  readonly job: JobAt<
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
   *           env: ({ needs }) => ({
   *             VERSION: needs.build.outputs.version,
   *           }),
   *         }),
   *   );
   * ```
   */
  readonly jobs: Jobs;
}
type AddJobReference<
  WorkflowPath extends string,
  JobId extends string,
  Jobs extends JobReferences,
  Result extends JobDone<string, string, readonly string[]>,
> = [Result] extends [unknown] ? {
    readonly [K in keyof Jobs | JobId]: K extends keyof Jobs ? Jobs[K]
      : JR<
        WorkflowPath,
        JobId,
        Result[typeof jobDefinition]["outputNames"],
        NonNullable<Result[typeof testJobShape]>
      >;
  }
  : never;
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
export type WorkflowStart<
  WorkflowPath extends string,
  CEnv extends StateEnv = E,
> = WorkflowStartBase<
  WorkflowPath,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "call", WorkflowCall, E>,
  Setting<CEnv, "outputKeys", string, never>,
  Setting<CEnv, "inputs", object, E>
>;
type WorkflowStartOf<
  WorkflowPath extends string,
  Vars extends string = string,
  Secrets extends string = string,
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{
  vars: Vars;
  secrets: Secrets;
  call: C;
  outputKeys: O;
  inputs: InputValues;
}> extends infer Context extends StateEnv ? WorkflowStart<WorkflowPath, Context>
  : never;
/** Method surface of {@link WorkflowStart}; its context is inferred by the DSL. */
interface WorkflowStartBase<
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
   * Tsugiori adds jobs in declaration order and exposes declared outputs for later definitions.
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
    Result extends JobDone<
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
      scope: JobScopeOf<
        WorkflowPath,
        JobId,
        E,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): WorkflowOf<
    WorkflowPath,
    AddJobReference<WorkflowPath, JobId, E, Result>,
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
 *           env: ({ needs }) => ({
 *             VERSION: needs.build.outputs.version,
 *           }),
 *         }),
 *   );
 * ```
 */
export type Workflow<
  WorkflowPath extends string,
  Jobs extends JobReferences,
  CEnv extends StateEnv = E,
> = WorkflowBase<
  WorkflowPath,
  Jobs,
  Setting<CEnv, "vars", string, string>,
  Setting<CEnv, "secrets", string, string>,
  Setting<CEnv, "call", WorkflowCall, E>,
  Setting<CEnv, "outputKeys", string, never>,
  Setting<CEnv, "inputs", object, E>
>;
type WorkflowOf<
  WorkflowPath extends string,
  Jobs extends JobReferences,
  Vars extends string = string,
  Secrets extends string = string,
  C extends WorkflowCall = WorkflowCall,
  O extends string = never,
  InputValues extends object = Readonly<Record<string, string>>,
> = Compact<{
  vars: Vars;
  secrets: Secrets;
  call: C;
  outputKeys: O;
  inputs: InputValues;
}> extends infer Context extends StateEnv
  ? Workflow<WorkflowPath, Jobs, Context>
  : never;
/** Method surface of {@link Workflow}; its context is inferred by the DSL. */
interface WorkflowBase<
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
  /** Retained workflow_call contract used to validate calls independently of the union of all trigger inputs.
   */
  readonly [workflowContract]: Readonly<{
    /** Declared reusable workflow input and secret contract. See {@link ReusableWorkflow}.
     */
    call: C;
    /** Named outputs or output contracts for this representation. See the owning type and its output mapping method; declaration alone does not write a value.
     */
    outputs: readonly O[];
  }>;
  /** Defines reusable workflow outputs mapped to outputs of jobs within the callee. Callers read them as needs.<caller_job>.outputs.<name>.
   * Tsugiori exposes typed callee job references and only allows this on reusable workflows.
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
          /** Completed jobs in this workflow. Author jobs in dependency order and refer to them through needs().
           */
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
  ): WorkflowOf<
    WorkflowPath,
    Jobs,
    Vars,
    Secrets,
    C,
    keyof Values & string,
    InputValues
  >;
  /** Retained workflow identity for generation; obtain through defineWorkflow().
   */
  readonly [workflowDefinition]: AuthoringWorkflow;
  /** Type-level completed workflow shape for scenario inference.
   */
  readonly [testWorkflowShape]?: Jobs;
  /** Jobs run independently unless needs declares dependencies. A job id identifies it in dependency and output references; name controls its display label.
   * Tsugiori adds jobs in declaration order and exposes declared outputs for later definitions.
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
    Result extends JobDone<
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
      scope: JobScopeOf<
        WorkflowPath,
        JobId,
        Jobs,
        Vars,
        Secrets,
        InputValues
      >,
    ) => Result,
  ): WorkflowOf<
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
  composite?: boolean;
  outputContracts?: Readonly<Record<string, ReferenceBinding>>;
}>;

/** A workflow defines event triggers and jobs. Its project-relative YAML path is its sole identity.
 * Tsugiori callers own GitHub workflow placement; generation imposes no output directory.
 * Tsugiori constructs immutable authoring state; expressions and step bodies are not executed during generation.
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
): WorkflowStartOf<
  WorkflowPath,
  Names<Vars>,
  Names<Secrets>,
  CallContractOf<On>,
  WorkflowOutputNames<On>,
  WorkflowInputs<On>
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
  return createWorkflowFacade<
    WorkflowPath,
    Names<Vars>,
    Names<Secrets>,
    CallContractOf<On>,
    WorkflowOutputNames<On>,
    WorkflowInputs<On>
  >(draft, false);
}

/** Materializes completed workflow definitions and explicit Action roots. Generation recursively collects internal Composite references, deduplicates identical definitions, and rejects distinct Actions sharing a directory. Local reusable workflow callees must still be listed explicitly.
 * @see https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobs
 * @example Given a completed workflow `ci`.
 * ```ts
 * defineProject({ cacheVersion: 1, workflows: [ci] });
 * ```
 */
export function defineProject<
  const Workflows extends readonly Readonly<
    {
      /** Retained workflow identity for generation; obtain through defineWorkflow().
       */
      [workflowDefinition]: AuthoringWorkflow;
    }
  >[] = readonly [],
>(
  input: Readonly<{
    /** Increase when inputs outside the tracked source graph change the task binary.
     * @example Given a completed workflow `ci`.
     * ```ts
     * defineProject({ cacheVersion: 2, workflows: [ci] });
     * ```
     */
    cacheVersion?: number;
    /** Checkout-relative Action path for developing Tsugiori itself; released packages select their matching Action automatically. */
    localTaskPrepareAction?: string;
    /** Actions project directory for artifact preparation only. */
    workingDirectory?: string;
    /** Completed workflows to generate together, including local reusable callees.
     * @example Given a completed workflow `ci`.
     * ```ts
     * defineProject({ workflows: [ci] });
     * ```
     */
    workflows?: Workflows;
    /** Additional completed composite Action roots. Internal references from workflows and these roots are generated automatically; repeated definitions generate once. An Action-only project is allowed. See {@link defineCompositeAction} and {@link defineProject}.
     */
    actions?: readonly Readonly<
      {
        /** Retained composite identity for generation; obtain through defineCompositeAction().
         */
        [compositeActionDefinition]: AuthoringCompositeAction;
      }
    >[];
  }>,
): ProjectConfig {
  const cacheVersion = input.cacheVersion ?? 1;
  if (!Number.isSafeInteger(cacheVersion) || cacheVersion <= 0) {
    throw new TypeError("Cache version must be a positive safe integer.");
  }
  if (
    input.localTaskPrepareAction !== undefined &&
    (!/^\.\/[A-Za-z0-9._/-]+$/.test(
      input.localTaskPrepareAction,
    ) ||
      input.localTaskPrepareAction.includes("//") ||
      input.localTaskPrepareAction.split("/").includes(".."))
  ) {
    throw new TypeError(
      "Local task prepare Action must be a ./ checkout-relative path without parent traversal.",
    );
  }
  return Object.freeze({
    kind: "github-actions.project",
    ...(input.localTaskPrepareAction === undefined
      ? {}
      : { localTaskPrepareAction: input.localTaskPrepareAction }),
    cacheVersion,
    workingDirectory: input.workingDirectory ?? ".",
    workflows: Object.freeze(
      (input.workflows ?? []).map((value) => value[workflowDefinition]),
    ),
    actions: Object.freeze(
      (input.actions ?? []).map((value) => value[compositeActionDefinition]),
    ),
  });
}

// The draft erases authoring generics; restore the initial context selected by
// defineWorkflow without comparing it to a broad expression reference type.
function createWorkflowFacade<
  P extends string,
  V extends string,
  S extends string,
  C extends WorkflowCall,
  O extends string,
  I extends object,
>(
  draft: WorkflowDraft,
  finalized: false,
): WorkflowStartOf<P, V, S, C, O, I>;
function createWorkflowFacade(
  draft: WorkflowDraft,
  finalized: boolean,
): WorkflowStartOf<string> | WorkflowOf<string, JobReferences>;
function createWorkflowFacade(
  draft: WorkflowDraft,
  finalized: boolean,
): WorkflowStartOf<string> | WorkflowOf<string, JobReferences> {
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
        scope: JobScopeOf<
          string,
          string,
          JobReferences,
          string,
          string,
          Readonly<Record<string, string>>
        >,
      ) => JobDone<string, string>,
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
      }) as JobScopeOf<
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
    | WorkflowStartOf<string>
    | WorkflowOf<string, JobReferences>;
}

function resolveAuthoringValue<Value>(
  key: import("./expression_scope.ts").GitHubExpressionScopeKey,
  value: unknown,
  contracts?: ReadonlyMap<string, ReferenceBinding>,
): Value {
  return (typeof value === "function"
    ? value(scope(key, contracts))
    : value) as Value;
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
function renderAuthoringScalar(value: unknown): string {
  if (typeof value === "function") {
    throw new TypeError(
      "Value callbacks are unsupported; return the complete map from an authoring callback.",
    );
  }
  return typeof value === "string"
    ? value
    : emitExpression(value as ExpressionInput);
}
function evaluateEnv(
  value: unknown,
  key: import("./expression_scope.ts").GitHubExpressionScopeKey =
    "jobs.<job_id>.steps.env",
): EnvironmentVariables | undefined {
  if (value === undefined) return undefined;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(
        resolveAuthoringValue<Readonly<Record<string, unknown>>>(key, value),
      ).map((
        [name, entry],
      ) => [name, renderAuthoringScalar(entry)]),
    ),
  ) as EnvironmentVariables;
}
function createJobStartFacade(
  draft: JobDraft,
  dependenciesAvailable: boolean,
):
  | JobInitOf<string, string>
  | JobOf<
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
        needs: (...dependencies: readonly JR[]) =>
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
  }) as JobOf<
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
): CallJobOf<string, string> {
  const update = (key: keyof JobOptions, value: unknown) =>
    createReusableJobFacade(
      Object.freeze({ ...draft, options: { ...draft.options, [key]: value } }),
    );
  const invoke = (
    uses: string,
    args: unknown,
    callee?: AuthoringWorkflow,
    names: readonly string[] = [],
  ): JobDone<string, string, readonly string[]> => {
    if (typeof args === "function") {
      throw new TypeError(
        "Reusable call arguments must be an object; use separate with and secrets callbacks.",
      );
    }
    const value = args as { with?: unknown; secrets?: unknown } | undefined;
    const withValues = resolveAuthoringValue<RawCallInputs | undefined>(
      "jobs.<job_id>.with.<with_id>",
      value?.with,
    );
    const secretValues = resolveAuthoringValue(
      "jobs.<job_id>.secrets.<secrets_id>",
      value?.secrets,
    );
    validateCallExpressionInputs(withValues);
    const job: AuthoringJob = Object.freeze({
      id: draft.id,
      needs: draft.needs,
      ...draft.options,
      uses,
      with: withValues && copyCallInputs(withValues),
      callSecrets: secretValues === "inherit"
        ? "inherit"
        : evaluateEnv(secretValues, "jobs.<job_id>.secrets.<secrets_id>"),
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
    concurrency: (value: unknown) =>
      update("concurrency", renderConcurrency(value)),
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
  }) as CallJobOf<string, string>;
}
function renderConcurrency(
  value: unknown,
): NonNullable<JobOptions["concurrency"]> {
  const definition = resolveAuthoringValue<
    { group: unknown; cancelInProgress: boolean; queue?: "max" }
  >("jobs.<job_id>.concurrency", value);
  return Object.freeze({
    ...definition,
    group: renderAuthoringScalar(definition.group),
  });
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
): ExecOf<string, string> {
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
        E,
        E,
        E,
        string,
        string,
        Readonly<Record<string, string>>
      >,
    ) =>
      createExecutionJobFacade({
        ...draft,
        options: { ...draft.options, env: evaluateEnv(v, "jobs.<job_id>.env") },
      }),
    defaultsRun: (v: unknown) =>
      createExecutionJobFacade({
        ...draft,
        options: {
          ...draft.options,
          defaults: Object.freeze(
            Object.fromEntries(
              Object.entries(
                resolveAuthoringValue<Readonly<Record<string, unknown>>>(
                  "jobs.<job_id>.defaults.run",
                  v,
                ),
              ).map((
                [k, x],
              ) => [k, renderAuthoringScalar(x)]),
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
    concurrency: (value: unknown) =>
      createExecutionJobFacade(Object.freeze({
        ...draft,
        options: { ...draft.options, concurrency: renderConcurrency(value) },
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
          options.uses === undefined && contract &&
            compositeActionDefinition in contract
            ? (contract as unknown as {
              [compositeActionDefinition]: AuthoringCompositeAction;
            })[compositeActionDefinition]
            : undefined,
        ),
        outputs,
      );
    },
    run: (
      definition: RunStepDefinition<string | undefined, readonly string[]>,
    ) => {
      if (draft.composite && !definition.shell?.trim()) {
        throw new TypeError("Composite run steps require shell.");
      }
      if (definition.outputs !== undefined) {
        validateActionOutputs(definition.outputs);
      }
      return appendStep(draft, runStep(definition), definition.outputs ?? []);
    },
    task: (
      definition: TaskStepDefinition<
        string | undefined,
        TaskInputDefinitions,
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
  }) as ExecOf<string, string>;
}
function createStepFacade(
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
): StepOf<string, string, StepReferences> {
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
  }) as unknown as StepOf<string, string, StepReferences>;
}
function appendStep(
  draft:
    & JobDraft
    & Readonly<{ runsOn: string | NonEmptyReadonlyArray<string> }>,
  step: AuthoringStep,
  outputNames: readonly string[] = Object.freeze([]),
  contracts?: Readonly<Record<string, ReferenceBinding>>,
): StepOf<string, string, StepReferences> {
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
    env?: unknown;
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
  calleeAction?: AuthoringCompositeAction,
): AuthoringUsesStep {
  return Object.freeze({
    type: "uses",
    ...(calleeAction === undefined ? {} : { calleeAction }),
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
    TaskInputDefinitions,
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
  for (
    const [name, input] of Object.entries(
      resolveAuthoringValue<InputDefinitions>(
        "jobs.<job_id>.steps.env",
        definition.inputs,
        contracts,
      ) ?? {},
    )
  ) {
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
    const source = input.from;
    if (typeof source === "function") {
      throw new TypeError(
        "Task input sources must be expressions; use an inputs map callback.",
      );
    }
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
    ...(definition.workingDirectory === undefined
      ? {}
      : { workingDirectory: definition.workingDirectory }),
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
): SR {
  return Object.freeze({
    id,
    outputNames: Object.freeze([...outputNames]),
    ...(contracts === undefined ? {} : { contracts }),
    outputs: Object.freeze(Object.fromEntries(outputNames.map((name) => [
      name,
      `\${{ steps.${id}.outputs.${name} }}`,
    ]))),
  }) as SR;
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
