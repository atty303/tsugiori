import type {
  AvailableJobState,
  EmptyPipelineState,
  ExecutionJobState,
  FinalizedJobState,
  JobReference,
  NonEmptyPipelineState,
  NonEmptyStepState,
} from "../src/github_actions/mod.ts";
import { definePipeline, defineProject } from "../src/github_actions/mod.ts";
import type { ExpressionEnvironment } from "../src/github_actions/expression_scope.ts";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true
  : false;
type Expect<Value extends true> = Value;
type StringKeys<Value> = Extract<keyof Value, string>;

type _EmptyPipelineSurface = Expect<
  Equal<StringKeys<EmptyPipelineState<"ci">>, "job" | "inputs">
>;
type _NonEmptyPipelineSurface = Expect<
  Equal<
    StringKeys<
      NonEmptyPipelineState<
        "ci",
        { test: JobReference<"ci", "test"> }
      >
    >,
    "job" | "workflowOutputs" | "inputs"
  >
>;
type _FirstJobSurface = Expect<
  Equal<
    StringKeys<AvailableJobState<"ci", "test", Record<never, never>>>,
    "runsOn" | "reusable"
  >
>;
type _DependentJobSurface = Expect<
  Equal<
    StringKeys<
      AvailableJobState<
        "ci",
        "build",
        { test: JobReference<"ci", "test"> }
      >
    >,
    "needs" | "runsOn" | "reusable"
  >
>;
type _ExecutionSurface = Expect<
  Equal<
    StringKeys<ExecutionJobState<"ci", "test">>,
    | "runsOn"
    | "name"
    | "env"
    | "defaultsRun"
    | "when"
    | "strategy"
    | "concurrency"
    | "permissions"
    | "timeoutMinutes"
    | "environment"
    | "uses"
    | "run"
    | "task"
  >
>;
type _StepSurface = Expect<
  Equal<
    StringKeys<NonEmptyStepState<"ci", "test", Record<never, never>>>,
    "uses" | "run" | "steps" | "task" | "outputs"
  >
>;

type _JobIfScope = Expect<
  Equal<
    keyof ExpressionEnvironment<"jobs.<job_id>.if">,
    | "github"
    | "needs"
    | "vars"
    | "inputs"
    | "always"
    | "cancelled"
    | "success"
    | "failure"
  >
>;
type _StepRunScope = Expect<
  Equal<
    keyof ExpressionEnvironment<"jobs.<job_id>.steps.run">,
    | "github"
    | "needs"
    | "strategy"
    | "matrix"
    | "job"
    | "runner"
    | "env"
    | "vars"
    | "secrets"
    | "steps"
    | "inputs"
    | "hashFiles"
  >
>;

function assertAuthoringContracts(): void {
  const checkout = {
    uses: "actions/checkout@revision",
    name: "Checkout",
    description: "Checkout repository",
    inputs: {
      required: { description: "Required", required: true },
      optional: { description: "Optional" },
    },
    outputs: { revision: { description: "Revision" } },
  } as const;

  const empty = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  });
  // @ts-expect-error an empty pipeline is not finalizable.
  defineProject({ pipelines: [empty] });

  const withTest = empty.job("test", ({ job }) => {
    const checkedOut = job
      .runsOn("ubuntu-latest")
      .uses(checkout, {
        id: "checkout",
        name: "Checkout",
        with: { required: "value" },
      });
    const revision = checkedOut.steps.checkout.outputs.revision;
    // @ts-expect-error undeclared action outputs are unavailable.
    checkedOut.steps.checkout.outputs.unknown;
    return checkedOut.run({ id: "test", name: "Test", run: revision });
  });
  withTest.job(
    // @ts-expect-error duplicate job IDs are unavailable.
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ name: "Again", run: "true" }),
  );
  withTest.job("build", ({ job, jobs }) =>
    job
      .needs(jobs.test)
      .runsOn("ubuntu-latest")
      .run({ name: "Build", run: "true" }));

  empty.job("duplicate-step", ({ job }) => {
    const first = job
      .runsOn("ubuntu-latest")
      .run({ id: "same", name: "First", run: "true" });
    // @ts-expect-error duplicate step IDs are unavailable.
    return first.run({ id: "same", name: "Second", run: "true" });
  });

  let captured!: FinalizedJobState<"other", "captured">;
  definePipeline("other", {
    output: ".github/workflows/other.yml",
    on: { push: {} },
  }).job("captured", ({ job }) => {
    captured = job
      .runsOn("ubuntu-latest")
      .run({ name: "Captured", run: "true" });
    return captured;
  });
  // @ts-expect-error a callback must finalize the job currently being defined.
  empty.job("wrong", () => {
    return captured;
  });
}

void assertAuthoringContracts;

Deno.test("authoring type contracts compile", () => {});
