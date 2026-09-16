export type WorkflowEvent = "pull_request" | "push";

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

export type UsesStep = Readonly<{
  type: "uses";
  name?: string;
  uses: string;
}>;

export type RunStep = Readonly<{
  type: "run";
  name?: string;
  run: string;
}>;

export type Step = UsesStep | RunStep;

export type Job = Readonly<{
  id: string;
  runsOn: RunnerSelection;
  needs: readonly string[];
  steps: readonly Step[];
}>;

export type Workflow = Readonly<{
  name: string;
  events: readonly WorkflowEvent[];
  jobs: readonly Job[];
}>;
