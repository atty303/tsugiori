import {
  defineTsugiori,
  type TestablePipeline,
  type TestJobsOf,
  type TestMatrixOf,
  type TestStepOf,
  type TestStepShape,
  type TestStepsOf,
} from "../../core/src/github_actions/mod.ts";
import { runScenario } from "./run.ts";

export type StepOutcome = "success" | "failure" | "cancelled";
export type Result = StepOutcome | "skipped";
export type Fixture<Outputs> = Readonly<{
  outcome?: StepOutcome;
  outputs?: Partial<Outputs>;
}>;
export type FixtureContext<Inputs, Matrix> = Readonly<{
  inputs: Inputs;
  env: Readonly<Record<string, string>>;
  matrix: Matrix;
}>;
export type FixtureValue<Inputs, Outputs, Matrix> =
  | Fixture<Outputs>
  | ((
    context: FixtureContext<Inputs, Matrix>,
  ) => Fixture<Outputs> | Promise<Fixture<Outputs>>);

export class ScenarioError extends Error {
  constructor(
    readonly kind:
      | "fixture_missing"
      | "fixture_invalid"
      | "expression_unsupported"
      | "expression_error"
      | "expectation_failed",
    readonly location: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${location}: ${message}`, options);
    this.name = "ScenarioError";
  }
}

export type StepResult = Readonly<{
  id: string;
  outcome: Result;
  conclusion: Result;
  outputs: Readonly<Record<string, string>>;
  inputs: Readonly<Record<string, unknown>>;
  env: Readonly<Record<string, string>>;
}>;
export type JobInstanceResult = Readonly<{
  matrix: Readonly<Record<string, unknown>>;
  result: Result;
  steps: Readonly<Record<string, StepResult>>;
}>;
export type JobResult = Readonly<{
  result: Result;
  outputs: Readonly<Record<string, string>>;
  instances: readonly JobInstanceResult[];
}>;
export type ScenarioResult = Readonly<{
  result: Result;
  jobs: Readonly<Record<string, JobResult>>;
}>;

export type StepRules = {
  fixture?: FixtureValue<never, Record<string, unknown>, never>;
  expectedInputs?: Readonly<Record<string, unknown>>;
  expectedOutputs?: Readonly<Record<string, unknown>>;
  expectedRun?: boolean;
  expectedOutcome?: Result;
  expectedConclusion?: Result;
  expressions: Map<string, unknown>;
};
export type InstanceRules = {
  steps: Map<string, StepRules>;
  internals: Map<string, StepOutcome>;
  expectedResult?: Result;
  expectedStepOrder?: readonly string[];
};
export type JobRules = InstanceRules & {
  expectedMatrix?: readonly Readonly<Record<string, unknown>>[];
  expectedOutputs?: Readonly<Record<string, string>>;
  matrixRules?: (matrix: Readonly<Record<string, unknown>>) => InstanceRules;
};
export type Program = {
  external: Record<string, unknown>;
  jobs: Map<string, JobRules>;
  defaultResult?: Result;
  expectedResult?: Result;
  expectedBefore: [string, string][];
};

type InputsOf<Step> = TestStepOf<Step> extends
  TestStepShape<infer Inputs, unknown> ? Inputs : never;
type OutputsOf<Step> = TestStepOf<Step> extends
  TestStepShape<unknown, infer Outputs> ? Outputs : never;
type JobSteps<Job> = TestStepsOf<Job>;
type JobMatrix<Job> = TestMatrixOf<Job>;
type JobNames<Jobs> = keyof Jobs & string;
type StepNames<Job> = keyof JobSteps<Job> & string;

function newStepRules(): StepRules {
  return { expressions: new Map() };
}
function newInstanceRules(): InstanceRules {
  return { steps: new Map(), internals: new Map() };
}
function newJobRules(): JobRules {
  return { ...newInstanceRules() };
}

export class StepScenario<Inputs, Outputs, Matrix> {
  constructor(private readonly rules: StepRules) {}
  fixture(value: FixtureValue<Inputs, Outputs, Matrix>): this {
    if (this.rules.fixture !== undefined) {
      throw new ScenarioError(
        "fixture_invalid",
        "scenario.step",
        "Duplicate fixture.",
      );
    }
    this.rules.fixture = value as StepRules["fixture"];
    return this;
  }
  expectInputs(value: Partial<Inputs>): this {
    this.rules.expectedInputs = value as Readonly<Record<string, unknown>>;
    return this;
  }
  expectOutputs(value: Partial<Outputs>): this {
    this.rules.expectedOutputs = value as Readonly<Record<string, unknown>>;
    return this;
  }
  expectRun(): this {
    this.rules.expectedRun = true;
    return this;
  }
  expectSkip(): this {
    this.rules.expectedRun = false;
    return this;
  }
  expectOutcome(value: Result): this {
    this.rules.expectedOutcome = value;
    return this;
  }
  expectConclusion(value: Result): this {
    this.rules.expectedConclusion = value;
    return this;
  }
  expression(field: string, value: unknown): this {
    this.rules.expressions.set(field, value);
    return this;
  }
}

export class InstanceScenario<Job> {
  constructor(protected readonly rules: InstanceRules) {}
  step<const Id extends StepNames<Job>>(
    id: Id,
  ): StepScenario<
    InputsOf<JobSteps<Job>[Id]>,
    OutputsOf<JobSteps<Job>[Id]>,
    JobMatrix<Job>
  > {
    let rules = this.rules.steps.get(id);
    if (rules === undefined) {
      rules = newStepRules();
      this.rules.steps.set(id, rules);
    }
    return new StepScenario(rules);
  }
  internal(
    which: "artifact" | "cache" | "prepare",
    outcome: StepOutcome,
  ): this {
    this.rules.internals.set(which, outcome);
    return this;
  }
  expectResult(result: Result): this {
    this.rules.expectedResult = result;
    return this;
  }
  expectStepOrder(...ids: readonly StepNames<Job>[]): this {
    this.rules.expectedStepOrder = ids;
    return this;
  }
}

export class JobScenario<Job> extends InstanceScenario<Job> {
  constructor(protected override readonly rules: JobRules) {
    super(rules);
  }
  expectMatrix(value: readonly JobMatrix<Job>[]): this {
    this.rules.expectedMatrix = value as readonly Readonly<
      Record<string, unknown>
    >[];
    return this;
  }
  expectOutputs(value: Readonly<Record<string, string>>): this {
    this.rules.expectedOutputs = value;
    return this;
  }
  eachMatrix(
    define: (
      matrix: JobMatrix<Job>,
      instance: InstanceScenario<Job>,
    ) => void,
  ): this {
    this.rules.matrixRules = (matrix) => {
      const rules = newInstanceRules();
      define(matrix as JobMatrix<Job>, new InstanceScenario<Job>(rules));
      return rules;
    };
    return this;
  }
  expression(field: string, value: unknown): this {
    const rules = this.rules.steps.get("__job__") ?? newStepRules();
    rules.expressions.set(field, value);
    this.rules.steps.set("__job__", rules);
    return this;
  }
}

export class PipelineScenario<Jobs> {
  readonly program: Program = {
    external: {},
    jobs: new Map(),
    expectedBefore: [],
  };
  github(value: Readonly<Record<string, unknown>>): this {
    this.program.external.github = value;
    return this;
  }
  inputs(value: Readonly<Record<string, unknown>>): this {
    this.program.external.inputs = value;
    return this;
  }
  vars(value: Readonly<Record<string, unknown>>): this {
    this.program.external.vars = value;
    return this;
  }
  secrets(value: Readonly<Record<string, unknown>>): this {
    this.program.external.secrets = value;
    return this;
  }
  expectAllReached(result: Result): this {
    this.program.defaultResult = result;
    return this;
  }
  expectResult(result: Result): this {
    this.program.expectedResult = result;
    return this;
  }
  expectBefore<Left extends JobNames<Jobs>, Right extends JobNames<Jobs>>(
    left: Left,
    right: Right,
  ): this {
    this.program.expectedBefore.push([left, right]);
    return this;
  }
  job<const Id extends JobNames<Jobs>>(
    id: Id,
    define: (job: JobScenario<Jobs[Id]>) => void,
  ): this {
    if (this.program.jobs.has(id)) {
      throw new ScenarioError("fixture_invalid", id, "Duplicate job scenario.");
    }
    const rules = newJobRules();
    this.program.jobs.set(id, rules);
    define(new JobScenario(rules));
    return this;
  }
}

export async function scenario<
  const Pipeline extends TestablePipeline,
>(
  pipeline: Pipeline,
  define: (test: PipelineScenario<TestJobsOf<Pipeline>>) => void,
): Promise<ScenarioResult> {
  const builder = new PipelineScenario<TestJobsOf<Pipeline>>();
  define(builder);
  const config = defineTsugiori({ pipelines: [pipeline] });
  return await runScenario(config, builder.program);
}
