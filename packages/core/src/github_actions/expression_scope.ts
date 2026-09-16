export const githubExpressionContextNames = [
  "github",
  "env",
  "vars",
  "job",
  "jobs",
  "steps",
  "runner",
  "secrets",
  "strategy",
  "matrix",
  "needs",
  "inputs",
] as const;

export type GitHubExpressionContextName =
  (typeof githubExpressionContextNames)[number];

export const githubSpecialFunctionNames = [
  "always",
  "cancelled",
  "success",
  "failure",
  "hashFiles",
] as const;

export type GitHubSpecialFunctionName =
  (typeof githubSpecialFunctionNames)[number];

type ExpressionScopeDefinition = Readonly<{
  contexts: readonly GitHubExpressionContextName[];
  functions: readonly GitHubSpecialFunctionName[];
}>;
type ExpressionScopeCatalog = Readonly<
  Record<string, ExpressionScopeDefinition>
>;

const noFunctions = [] as const;
const stepFunctions = ["hashFiles"] as const;
const jobMatrixContexts = [
  "github",
  "needs",
  "strategy",
  "matrix",
  "vars",
  "inputs",
] as const;
const stepContexts = [
  "github",
  "needs",
  "strategy",
  "matrix",
  "job",
  "runner",
  "env",
  "vars",
  "secrets",
  "steps",
  "inputs",
] as const;

// This is a checked-in snapshot of GitHub's context availability table. The
// workflow-key identity remains explicit even when entries share a value so a
// later provider change can split them independently.
export const githubExpressionScopes = {
  "run-name": {
    contexts: ["github", "inputs", "vars"],
    functions: noFunctions,
  },
  concurrency: {
    contexts: ["github", "inputs", "vars"],
    functions: noFunctions,
  },
  env: {
    contexts: ["github", "secrets", "inputs", "vars"],
    functions: noFunctions,
  },
  "jobs.<job_id>.concurrency": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.container": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.container.credentials": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "env",
      "vars",
      "secrets",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.container.env.<env_id>": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "job",
      "runner",
      "env",
      "vars",
      "secrets",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.container.image": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.continue-on-error": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.defaults.run": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "env",
      "vars",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.env": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "vars",
      "secrets",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.environment": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.environment.url": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "job",
      "runner",
      "env",
      "vars",
      "steps",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.if": {
    contexts: ["github", "needs", "vars", "inputs"],
    functions: ["always", "cancelled", "success", "failure"],
  },
  "jobs.<job_id>.name": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.outputs.<output_id>": {
    contexts: stepContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.runs-on": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.secrets.<secrets_id>": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "secrets",
      "inputs",
      "vars",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.services": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.services.<service_id>.credentials": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "env",
      "vars",
      "secrets",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.services.<service_id>.env.<env_id>": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "job",
      "runner",
      "env",
      "vars",
      "secrets",
      "inputs",
    ],
    functions: noFunctions,
  },
  "jobs.<job_id>.steps.continue-on-error": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.env": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.if": {
    contexts: [
      "github",
      "needs",
      "strategy",
      "matrix",
      "job",
      "runner",
      "env",
      "vars",
      "steps",
      "inputs",
    ],
    functions: ["always", "cancelled", "success", "failure", "hashFiles"],
  },
  "jobs.<job_id>.steps.name": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.run": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.timeout-minutes": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.with": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.steps.working-directory": {
    contexts: stepContexts,
    functions: stepFunctions,
  },
  "jobs.<job_id>.strategy": {
    contexts: ["github", "needs", "vars", "inputs"],
    functions: noFunctions,
  },
  "jobs.<job_id>.timeout-minutes": {
    contexts: jobMatrixContexts,
    functions: noFunctions,
  },
  "jobs.<job_id>.with.<with_id>": {
    contexts: ["github", "needs", "strategy", "matrix", "inputs", "vars"],
    functions: noFunctions,
  },
  "on.workflow_call.inputs.<inputs_id>.default": {
    contexts: ["github", "inputs", "vars"],
    functions: noFunctions,
  },
  "on.workflow_call.outputs.<output_id>.value": {
    contexts: ["github", "jobs", "vars", "inputs"],
    functions: noFunctions,
  },
} as const satisfies ExpressionScopeCatalog;

export type GitHubExpressionScopeKey = keyof typeof githubExpressionScopes;

export const supportedExpressionScopeKeys =
  [] as const satisfies readonly GitHubExpressionScopeKey[];

const expressionContext = Symbol("tsugiori.expression-context");
const specialFunction = Symbol("tsugiori.special-function");

export type OpaqueExpressionContext<
  Name extends GitHubExpressionContextName,
> = Readonly<{ [expressionContext]: Name }>;
export type OpaqueSpecialFunction<
  Name extends GitHubSpecialFunctionName,
> = Readonly<{ [specialFunction]: Name }>;

type ContextRegistry = {
  readonly [Name in GitHubExpressionContextName]: OpaqueExpressionContext<Name>;
};
type FunctionRegistry = {
  readonly [Name in GitHubSpecialFunctionName]: OpaqueSpecialFunction<Name>;
};
type ContextNameFor<Scope extends GitHubExpressionScopeKey> =
  (typeof githubExpressionScopes)[Scope]["contexts"][number];
type FunctionNameFor<Scope extends GitHubExpressionScopeKey> =
  (typeof githubExpressionScopes)[Scope]["functions"][number];

export type ExpressionEnvironment<Scope extends GitHubExpressionScopeKey> =
  Readonly<
    & Pick<ContextRegistry, ContextNameFor<Scope>>
    & Pick<FunctionRegistry, FunctionNameFor<Scope>>
  >;
