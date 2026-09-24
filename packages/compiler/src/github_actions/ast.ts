export type WorkflowEvent = "pull_request" | "push";

export type PermissionLevel = "none" | "read" | "write";

export type WorkflowPermissions = Readonly<{
  contents?: PermissionLevel;
}>;
export type EnvironmentVariables = Readonly<Record<string, string>>;
export type Concurrency = Readonly<
  { group: string; cancelInProgress: boolean }
>;
export type JobOptions = Readonly<{
  if?: string;
  timeoutMinutes?: number;
  environment?: string;
  outputs?: Readonly<Record<string, string>>;
  strategy?: Readonly<{
    failFast?: boolean;
    matrix: Readonly<Record<string, string | readonly string[]>>;
  }>;
  concurrency?: Concurrency;
}>;

export type ActionInput = string | number | boolean;
export type ActionInputs = Readonly<Record<string, ActionInput>>;

export type StepMetadata = Readonly<{
  id?: string;
  if?: string;
  continueOnError?: boolean;
  env?: EnvironmentVariables;
}>;

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type LabelRunnerSelection = Readonly<{
  type: "labels";
  labels: NonEmptyReadonlyArray<string>;
}>;

export type GroupRunnerSelection = Readonly<{
  type: "group";
  group: string;
  labels?: NonEmptyReadonlyArray<string>;
}>;

export type RunnerSelection = LabelRunnerSelection | GroupRunnerSelection;

export type UsesStep =
  & StepMetadata
  & Readonly<{
    type: "uses";
    name?: string;
    uses: string;
    with?: ActionInputs;
  }>;

export type RunStep =
  & StepMetadata
  & Readonly<{
    type: "run";
    name?: string;
    run: string;
    workingDirectory?: string;
  }>;

export type Step = UsesStep | RunStep;

export type Job =
  & Readonly<{
    id: string;
    runsOn: RunnerSelection;
    needs: readonly string[];
    steps: readonly Step[];
  }>
  & JobOptions;

export type Workflow = Readonly<{
  name: string;
  events: readonly WorkflowEvent[];
  pushBranches?: readonly string[];
  concurrency?: Concurrency;
  permissions?: WorkflowPermissions;
  jobs: readonly Job[];
}>;
