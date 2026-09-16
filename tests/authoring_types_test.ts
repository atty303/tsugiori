import type {
  AvailableJobState,
  EmptyPipelineState,
  ExecutionJobState,
  FinalizedJobState,
  JobReference,
  NonEmptyPipelineState,
  NonEmptyStepState,
} from "../packages/core/src/github_actions/mod.ts";
import {
  actionInput,
  defineAction,
  defineTsugiori,
  pipeline,
} from "../packages/core/src/github_actions/mod.ts";
import type { ExpressionEnvironment } from "../packages/core/src/github_actions/expression_scope.ts";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true
  : false;
type Expect<Value extends true> = Value;
type StringKeys<Value> = Extract<keyof Value, string>;

type _EmptyPipelineSurface = Expect<
  Equal<StringKeys<EmptyPipelineState<"ci">>, "job">
>;
type _NonEmptyPipelineSurface = Expect<
  Equal<
    StringKeys<
      NonEmptyPipelineState<
        "ci",
        { test: JobReference<"ci", "test"> }
      >
    >,
    "job"
  >
>;
type _FirstJobSurface = Expect<
  Equal<
    StringKeys<AvailableJobState<"ci", "test", Record<never, never>>>,
    "runsOn"
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
    "needs" | "runsOn"
  >
>;
type _ExecutionSurface = Expect<
  Equal<
    StringKeys<ExecutionJobState<"ci", "test">>,
    "uses" | "run" | "task"
  >
>;
type _StepSurface = Expect<
  Equal<
    StringKeys<NonEmptyStepState<"ci", "test", Record<never, never>>>,
    "uses" | "run" | "steps" | "task"
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
  const checkout = defineAction({
    uses: "actions/checkout@revision",
    inputs: {
      required: actionInput.string({ required: true }),
      optional: actionInput.boolean(),
    },
    outputs: ["revision"],
  });
  const widenedOutputs: string[] = ["revision"];
  defineAction({
    uses: "actions/checkout@revision",
    inputs: {},
    // @ts-expect-error action outputs must be a finite literal tuple.
    outputs: widenedOutputs,
  });

  checkout({ required: "value" });
  // @ts-expect-error required action inputs cannot be omitted.
  checkout({});
  // @ts-expect-error undeclared action inputs are not accepted.
  checkout({ required: "value", unknown: true });
  const dynamicInput = (required: boolean) =>
    // @ts-expect-error input requiredness must be statically known.
    actionInput.string({ required });
  void dynamicInput;

  const empty = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  });
  // @ts-expect-error an empty pipeline is not finalizable.
  defineTsugiori({ pipelines: [empty] });

  const withTest = empty.job("test", ({ job }) => {
    const checkedOut = job
      .runsOn("ubuntu-latest")
      .uses({
        id: "checkout",
        name: "Checkout",
        uses: checkout({ required: "value" }),
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
  pipeline("other", {
    output: ".github/workflows/other.yml",
    events: ["push"],
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
