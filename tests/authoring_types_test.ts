import type {
  Exec,
  JobAt,
  JobDone,
  JR,
  Step,
  TaskArtifactCacheJob,
  Workflow,
  WorkflowStart,
} from "../src/github_actions/mod.ts";
import { project, workflow } from "../src/github_actions/mod.ts";
import type { ExpressionEnvironment } from "../src/github_actions/expression_scope.ts";

type Equal<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true
  : false;
type Expect<Value extends true> = Value;
type StringKeys<Value> = Extract<keyof Value, string>;

type _EmptyWorkflowSurface = Expect<
  Equal<StringKeys<WorkflowStart<"ci">>, "job" | "inputs">
>;
type _NonEmptyWorkflowSurface = Expect<
  Equal<
    StringKeys<
      Workflow<
        "ci",
        { test: JR<"ci", "test"> }
      >
    >,
    "job" | "workflowOutputs" | "inputs"
  >
>;
type _FirstJobSurface = Expect<
  Equal<
    StringKeys<JobAt<"ci", "test", Record<never, never>>>,
    "runsOn" | "reusable"
  >
>;
type _DependentJobSurface = Expect<
  Equal<
    StringKeys<
      JobAt<
        "ci",
        "build",
        { test: JR<"ci", "test"> }
      >
    >,
    "needs" | "runsOn" | "reusable"
  >
>;
type _ExecutionSurface = Expect<
  Equal<
    StringKeys<Exec<"ci", "test">>,
    | "runsOn"
    | "name"
    | "env"
    | "defaultsRun"
    | "container"
    | "services"
    | "when"
    | "strategy"
    | "concurrency"
    | "permissions"
    | "continueOnError"
    | "timeoutMinutes"
    | "environment"
    | "uses"
    | "run"
    | "task"
  >
>;
type _StepSurface = Expect<
  Equal<
    StringKeys<Step<"ci", "test", Record<never, never>>>,
    "uses" | "run" | "steps" | "task" | "outputs" | "environment"
  >
>;
type _TaskArtifactCacheSurface = Expect<
  Equal<StringKeys<TaskArtifactCacheJob>, "uses" | "run">
>;

function assertTaskArtifactCacheTypes(): void {
  const cache = {
    uses: "acme/cache@v1",
    name: "Cache",
    description: "Cache task artifacts",
    inputs: { directory: { description: "Artifact path", required: true } },
  } as const;
  project({
    taskArtifactCache: ({ job, path, kind }) => {
      // @ts-expect-error task execution depends on artifact preparation.
      job.task({ name: "Restore", run: () => {} });
      // @ts-expect-error required Action inputs must be supplied.
      job.uses(cache);
      return kind === "composite"
        ? job.uses(cache, { with: { directory: path } })
          .run({ name: "Ready", run: "true", shell: "bash" })
        : job.uses(cache, { with: { directory: path } });
    },
  });
}
void assertTaskArtifactCacheTypes;

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

  const empty = workflow(".github/workflows/ci.yml", {
    on: { push: {} },
  });
  // @ts-expect-error an empty workflow is not finalizable.
  project({ workflows: [empty] });

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

  let captured!: JobDone<".github/workflows/other.yml", "captured">;
  workflow(".github/workflows/other.yml", {
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

// Reference interfaces and grouped contexts retain immutable authoring maps.
function assertReadonlyReferences(): void {
  const flow = workflow("readonly.yml", { on: { push: {} } }).job(
    "first",
    ({ job }) => {
      const state = job.runsOn("ubuntu-latest").run({
        id: "one",
        name: "One",
        run: "true",
        outputs: ["value"],
      });
      // @ts-expect-error named references are immutable
      state.steps.one = { ...state.steps.one };
      // @ts-expect-error step identity is immutable
      state.steps.one.id = "one";
      // @ts-expect-error declared output references are immutable
      state.steps.one.outputs.value = "${{ steps.one.outputs.value }}";
      return state;
    },
  );
  flow.job("second", ({ job, jobs }) => {
    // @ts-expect-error prior job references are immutable
    jobs.first = { ...jobs.first };
    // @ts-expect-error job identity is immutable
    jobs.first.id = "first";
    return job.needs(jobs.first).runsOn("ubuntu-latest").run({
      name: "Two",
      run: "true",
    });
  });
}
void assertReadonlyReferences;
