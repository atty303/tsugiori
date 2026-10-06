/**
 * GitHub Actions authoring, generation and scenario testing.
 *
 * Use defineWorkflow() or defineCompositeAction(), return immutable completed
 *  states and materialize them with defineProject(). Configuration callbacks build
 *  GitHub expressions now; task bodies run later on the compiled runtime.
 *
 * Detailed responsibilities and examples live in the selective entrypoints:
 *  [authoring](https://jsr.io/@atty303/tsugiori/doc/github-actions/authoring),
 *  [generation CLI](https://jsr.io/@atty303/tsugiori/doc/github-actions/run),
 *  [scenario testing](https://jsr.io/@atty303/tsugiori/doc/github-actions/testing),
 *  and [task contracts](https://jsr.io/@atty303/tsugiori/doc/task).
 *  Re-exports retain the defining API's documentation.
 *
 * @module
 */
export * from "./github_actions/mod.ts";
export type { TaskContext, TaskLogger, ValueContract } from "./task/mod.ts";
export { runProject } from "./runner/main.ts";
export type { RunOptions } from "./runner/main.ts";
export { scenario, ScenarioError } from "./testing/mod.ts";
export type {
  ScenarioObservation,
  ScenarioObserver,
  ScenarioResult,
  StepOutcome,
} from "./testing/mod.ts";
