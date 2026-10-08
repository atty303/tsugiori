import {
  type Expression,
  toJSON,
  workflow,
} from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";

function contextContracts(): void {
  const flow = workflow("context-types.yml", { on: { push: {} } }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "check",
        name: "Check",
        run: "true",
        env: ({ github, job, runner, secrets }) => {
          // @ts-expect-error check_run_id is numeric, not a string
          const badId: Expression<string> = job.check_run_id;
          void badId;
          // @ts-expect-error runner environment has the fixed native value domain
          const badEnvironment: Expression<"Linux"> = runner.environment;
          void badEnvironment;
          return {
            FILE: github.artifacts_list,
            ID: toJSON(job.check_run_id),
            TOKEN: secrets.GITHUB_TOKEN,
          };
        },
      }),
  );
  void scenario(flow, (test) =>
    test.job("build", (job) => {
      job.jobRuntime({ check_run_id: 42, workflow_ref: "fixture@main" });
      job.runner({ environment: "github-hosted" });
      job.step("check").github({ artifacts: "/fixture/artifacts" });
      // @ts-expect-error computed status is not a fixture field
      job.jobRuntime({ status: "failure" });
      // @ts-expect-error containers use their existing dedicated fixture
      job.jobRuntime({ container: { id: "fixture" } });
      // @ts-expect-error numeric context retains its native type
      job.jobRuntime({ check_run_id: "42" });
      // @ts-expect-error fixture cannot override other computed contexts
      job.runner({ steps: {} });
      // @ts-expect-error native runner environment domain
      job.runner({ environment: "Linux" });
      // @ts-expect-error caller event identity cannot change for a step
      job.step("check").github({ event_name: "pull_request" });
      // @ts-expect-error caller source identity cannot change for a step
      job.step("check").github({ sha: "changed" });
      // @ts-expect-error runner-owned file paths are strings
      job.step("check").github({ artifacts: 42 });
    }));
}
void contextContracts;
