import { assert, assertEquals } from "@std/assert";
import {
  emitWorkflow,
  validateWorkflow,
  type Workflow,
} from "../packages/compiler/src/github_actions/mod.ts";

Deno.test("emits canonical GitHub Actions YAML", async (t) => {
  const workflow: Workflow = {
    name: "CI",
    events: ["push", "pull_request"],
    jobs: [
      {
        id: "test",
        runsOn: {
          type: "labels",
          labels: ["x64", "SELF-HOSTED", "linux"],
        },
        needs: ["build"],
        steps: [
          { type: "run", name: "Test", run: "deno test" },
          { type: "run", run: "echo first\necho second" },
        ],
      },
      {
        id: "deploy",
        runsOn: {
          type: "group",
          group: "production-runners",
          labels: ["x64", "self-hosted", "linux"],
        },
        needs: ["test", "build"],
        steps: [{ type: "run", name: "Deploy", run: "./deploy" }],
      },
      {
        id: "build",
        runsOn: { type: "labels", labels: ["ubuntu-latest"] },
        needs: [],
        steps: [
          {
            type: "uses",
            name: "Checkout",
            uses: "actions/checkout@v6",
          },
          { type: "run", name: "Build", run: "deno task build" },
        ],
      },
    ],
  };

  const result = validateWorkflow(workflow);
  assert(result.ok);
  await t.assertSnapshot(emitWorkflow(result.value), {
    serializer: (value) => value,
  });
});

Deno.test("normalizes semantically unordered input", () => {
  const first = validateWorkflow(canonicalizationWorkflow(
    [
      "push",
      "pull_request",
    ],
    ["linux", "self-hosted", "x64"],
    ["test", "build"],
  ));
  const second = validateWorkflow(canonicalizationWorkflow(
    [
      "pull_request",
      "push",
    ],
    ["x64", "linux", "self-hosted"],
    ["build", "test"],
  ));

  assert(first.ok);
  assert(second.ok);
  assertEquals(emitWorkflow(first.value), emitWorkflow(second.value));
});

Deno.test("reports structural validation diagnostics", () => {
  const workflow = {
    name: " ",
    events: ["push", "push"],
    jobs: [
      {
        id: "1invalid",
        runsOn: {
          type: "labels",
          labels: ["self-hosted", "linux", "Linux"],
        },
        needs: ["missing", "missing"],
        steps: [],
      },
      {
        id: "1invalid",
        runsOn: { type: "group", group: " " },
        needs: ["1invalid"],
        steps: [{ type: "uses", name: " ", uses: " " }],
      },
    ],
  } as unknown as Workflow;

  const result = validateWorkflow(workflow);
  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      { code: "workflow.name.empty", path: ["name"] },
      { code: "workflow.events.duplicate", path: ["events", 1] },
      { code: "job.id.invalid", path: ["jobs", 0, "id"] },
      {
        code: "job.runs-on.labels.duplicate",
        path: ["jobs", 0, "runsOn", "labels", 2],
      },
      {
        code: "job.needs.duplicate",
        path: ["jobs", 0, "needs", 1],
      },
      { code: "job.steps.empty", path: ["jobs", 0, "steps"] },
      { code: "job.id.invalid", path: ["jobs", 1, "id"] },
      { code: "job.id.duplicate", path: ["jobs", 1, "id"] },
      {
        code: "job.runs-on.group.empty",
        path: ["jobs", 1, "runsOn", "group"],
      },
      {
        code: "step.name.empty",
        path: ["jobs", 1, "steps", 0, "name"],
      },
      {
        code: "step.uses.empty",
        path: ["jobs", 1, "steps", 0, "uses"],
      },
      {
        code: "job.needs.unknown",
        path: ["jobs", 0, "needs", 0],
      },
      {
        code: "job.needs.unknown",
        path: ["jobs", 0, "needs", 1],
      },
      {
        code: "job.needs.self",
        path: ["jobs", 1, "needs", 0],
      },
    ],
  );
});

Deno.test("reports each cyclic dependency component", () => {
  const result = validateWorkflow({
    name: "Cycles",
    events: ["push"],
    jobs: [
      job("gamma", ["beta"]),
      job("independent", []),
      job("beta", ["alpha"]),
      job("alpha", ["gamma"]),
    ],
  });

  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path, message }) => ({
      code,
      path,
      message,
    })),
    [{
      code: "job.needs.cycle",
      path: ["jobs", 3, "needs"],
      message: "Job dependency cycle includes jobs: alpha, beta, gamma.",
    }],
  );
});

function canonicalizationWorkflow(
  events: Workflow["events"],
  runnerLabels: readonly [string, ...string[]],
  needs: readonly string[],
): Workflow {
  return {
    name: "Canonical",
    events,
    jobs: [
      job("test", ["build"]),
      job("build", []),
      {
        id: "deploy",
        runsOn: { type: "labels", labels: runnerLabels },
        needs,
        steps: [{ type: "run", run: "./deploy" }],
      },
    ],
  };
}

function job(id: string, needs: readonly string[]): Workflow["jobs"][number] {
  return {
    id,
    runsOn: { type: "labels", labels: ["ubuntu-latest"] },
    needs,
    steps: [{ type: "run", run: "true" }],
  };
}
