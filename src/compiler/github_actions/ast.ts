import type {
  ContainerSettings,
  JobEnvironment,
  RunDefaults,
  ServiceSettings,
  StaticMatrix,
  WorkflowPermissions,
  WorkflowTriggers,
} from "../../github_actions/mod.ts";
export type {
  WorkflowDispatchInput,
  WorkflowPermissions,
} from "../../github_actions/mod.ts";
export type { WorkflowEvent } from "../../github_actions/mod.ts";
export type EnvironmentVariables = Readonly<Record<string, string>>;
export type Concurrency = Readonly<
  {
    group: string;
    cancelInProgress: boolean | string;
    queue?: "single" | "max";
  }
>;
export type JobOptions = Readonly<{
  container?: string | ContainerSettings;
  services?: Readonly<Record<string, ServiceSettings>>;
  if?: string;
  permissions?: WorkflowPermissions;
  continueOnError?: boolean | string;
  timeoutMinutes?: number | string;
  environment?: string | JobEnvironment;
  name?: string;
  env?: EnvironmentVariables;
  defaults?: RunDefaults;
  outputs?: Readonly<Record<string, string>>;
  strategy?: Readonly<{
    failFast?: boolean | string;
    maxParallel?: number | string;
    matrix: string | StaticMatrix;
  }>;
  concurrency?: Concurrency;
}>;

export type ActionInput = string;
type WorkflowCallInputs = Readonly<Record<string, string | number | boolean>>;
export type ActionInputs = Readonly<Record<string, ActionInput>>;

export type StepMetadata = Readonly<{
  id?: string;
  if?: string;
  continueOnError?: boolean | string;
  timeoutMinutes?: number | string;
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
    originalRef?: string;
    with?: ActionInputs;
  }>;

export type RunStep =
  & StepMetadata
  & Readonly<{
    type: "run";
    name?: string;
    run: string;
    workingDirectory?: string;
    shell?: string;
  }>;

export type Step = UsesStep | RunStep;

export type Job =
  & Readonly<{
    id: string;
    runsOn?: RunnerSelection;
    uses?: string;
    callOutputNames?: readonly string[];
    with?: WorkflowCallInputs;
    callSecrets?: "inherit" | EnvironmentVariables;
    needs: readonly string[];
    steps: readonly Step[];
  }>
  & JobOptions;

export type Workflow = Readonly<{
  name: string;
  on: WorkflowTriggers;
  runName?: string;
  env?: EnvironmentVariables;
  concurrency?: Concurrency;
  permissions?: WorkflowPermissions;
  defaults?: RunDefaults;
  jobs: readonly Job[];
}>;
