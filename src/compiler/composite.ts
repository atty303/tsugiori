import { flattenSteps } from "../github_actions/steps.ts";
import type {
  AuthoringCompositeAction,
  AuthoringStep,
  ProjectConfig,
} from "../github_actions/mod.ts";

// Collection deduplicates identities; lowering separately checks every call path.
export function collectCompositeActions(
  project: ProjectConfig,
): readonly AuthoringCompositeAction[] {
  const actions = new Set<AuthoringCompositeAction>();
  const visit = (action: AuthoringCompositeAction): void => {
    if (actions.has(action)) return;
    actions.add(action);
    inspect(action.runs.steps);
  };
  const inspect = (steps: readonly AuthoringStep[]): void => {
    for (const step of flattenSteps(steps)) {
      if (step.type === "uses" && step.calleeAction) visit(step.calleeAction);
    }
  };
  for (const action of project.actions ?? []) visit(action);
  for (const workflow of project.workflows) {
    for (const job of workflow.jobs) inspect(job.steps);
  }
  return [...actions].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}
