import type { TaskFunction } from "../task/mod.ts";

export type PipelineEvent = "pull_request" | "push";

export type PermissionLevel = "none" | "read" | "write";

export type WorkflowPermissions = Readonly<{
  contents?: PermissionLevel;
}>;

export type ActionInput = string | number | boolean;
export type ActionInputs = Readonly<Record<string, ActionInput>>;

export type AuthoringUsesStep = Readonly<{
  type: "uses";
  name: string;
  uses: string;
  with?: ActionInputs;
}>;

export type AuthoringRunStep = Readonly<{
  type: "run";
  name: string;
  run: string;
}>;

export type AuthoringTaskStep = Readonly<{
  type: "task";
  name: string;
  task: TaskFunction;
}>;

export type AuthoringStep =
  | AuthoringUsesStep
  | AuthoringRunStep
  | AuthoringTaskStep;

export type AuthoringJob = Readonly<{
  id: string;
  runsOn: string;
  needs: readonly string[];
  steps: readonly AuthoringStep[];
}>;

export type AuthoringPipeline = Readonly<{
  id: string;
  name: string;
  output: string;
  events: readonly PipelineEvent[];
  permissions?: WorkflowPermissions;
  jobs: readonly AuthoringJob[];
}>;

export type TsugioriConfig = Readonly<{
  kind: "tsugiori.config";
  pipelines: readonly AuthoringPipeline[];
}>;

export type PipelineOptions = Readonly<{
  name?: string;
  output: string;
  events: readonly PipelineEvent[];
  permissions?: WorkflowPermissions;
}>;

export type JobOptions = Readonly<{
  runsOn: string;
  needs?: readonly JobBuilder[] | readonly string[];
}>;

export class JobBuilder {
  readonly #id: string;
  readonly #options: JobOptions;
  readonly #steps: AuthoringStep[] = [];

  constructor(id: string, options: JobOptions) {
    this.#id = id;
    this.#options = options;
  }

  uses(name: string, uses: string, withInputs?: ActionInputs): this {
    this.#steps.push({
      type: "uses",
      name,
      uses,
      ...(withInputs === undefined
        ? {}
        : { with: copyActionInputs(withInputs) }),
    });
    return this;
  }

  run(name: string, run: string): this {
    this.#steps.push({ type: "run", name, run });
    return this;
  }

  task(name: string, task: TaskFunction): this {
    this.#steps.push({ type: "task", name, task });
    return this;
  }

  build(): AuthoringJob {
    return Object.freeze({
      id: this.#id,
      runsOn: this.#options.runsOn,
      needs: Object.freeze(
        (this.#options.needs ?? []).map((dependency) =>
          typeof dependency === "string" ? dependency : dependency.id
        ),
      ),
      steps: Object.freeze([...this.#steps]),
    });
  }

  get id(): string {
    return this.#id;
  }
}

export class PipelineBuilder {
  readonly #id: string;
  readonly #options: PipelineOptions;
  readonly #jobs: JobBuilder[] = [];

  constructor(id: string, options: PipelineOptions) {
    this.#id = id;
    this.#options = options;
  }

  job(id: string, options: JobOptions): JobBuilder {
    const job = new JobBuilder(id, options);
    this.#jobs.push(job);
    return job;
  }

  build(): AuthoringPipeline {
    return Object.freeze({
      id: this.#id,
      name: this.#options.name ?? this.#id,
      output: this.#options.output,
      events: Object.freeze([...this.#options.events]),
      ...(this.#options.permissions === undefined
        ? {}
        : { permissions: copyPermissions(this.#options.permissions) }),
      jobs: Object.freeze(this.#jobs.map((job) => job.build())),
    });
  }
}

function copyPermissions(
  permissions: WorkflowPermissions,
): WorkflowPermissions {
  assertPlainRecord(permissions, "Workflow permissions");
  for (const [key, value] of Object.entries(permissions)) {
    if (key !== "contents") {
      throw new TypeError(
        `Workflow permission ${JSON.stringify(key)} is not supported.`,
      );
    }
    if (value !== "none" && value !== "read" && value !== "write") {
      throw new TypeError("Workflow permission must be none, read, or write.");
    }
  }
  return Object.freeze({ ...permissions });
}

function copyActionInputs(inputs: ActionInputs): ActionInputs {
  assertPlainRecord(inputs, "Action inputs");
  for (const value of Object.values(inputs)) {
    if (
      typeof value !== "string" && typeof value !== "boolean" &&
      !(typeof value === "number" && Number.isFinite(value))
    ) {
      throw new TypeError(
        "Action input must be a string, boolean, or finite number.",
      );
    }
  }
  return Object.freeze({ ...inputs });
}

function assertPlainRecord(value: unknown, label: string): void {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be an object.`);
  }
}

export function pipeline(
  id: string,
  options: PipelineOptions,
): PipelineBuilder {
  return new PipelineBuilder(id, options);
}

export function defineTsugiori(
  input: Readonly<{ pipelines: readonly PipelineBuilder[] }>,
): TsugioriConfig {
  return Object.freeze({
    kind: "tsugiori.config",
    pipelines: Object.freeze(input.pipelines.map((value) => value.build())),
  });
}
