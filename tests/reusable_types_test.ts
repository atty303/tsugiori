import { defineProject, defineWorkflow } from "../src/github_actions/mod.ts";

function assertReusableTypes(): void {
  const definition = defineWorkflow(".github/workflows/callee.yml", {
    on: {
      workflow_call: {
        inputs: {
          flag: { type: "boolean", required: true },
          count: { type: "number" },
          label: { type: "string", required: true },
        },
        secrets: { token: { required: true }, optional: {} },
      },
    },
  });
  const callee = definition.job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").when(definition.inputs.flag).run({
        id: "out",
        name: "Out",
        run: "echo out",
        outputs: ["message"],
      }).outputs(({ steps }) => ({ message: steps.out.outputs.message })),
  ).workflowOutputs(({ jobs }) => ({ message: jobs.job.outputs.message }));
  const caller = defineWorkflow(".github/workflows/caller.yml", {
    on: { push: {} },
  });
  caller.job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/callee.yml", callee, {
        with: { flag: true, label: "ok" },
        secrets: { token: "fixture" },
      }),
  );
  caller.job(
    "matrix",
    ({ job }) =>
      job.reusable().strategy({
        matrix: {
          include: [{ target: "linux", count: 1 }, {
            target: "windows",
            count: 2,
          }],
        },
      }).call(
        "./.github/workflows/callee.yml",
        callee,
        ({ matrix }) => ({
          with: { flag: true, label: matrix.target, count: matrix.count },
          secrets: "inherit",
        }),
      ),
  );
  caller.job("invalid", ({ job }) => {
    return job.reusable().call("./.github/workflows/callee.yml", callee, {
      // @ts-expect-error missing required input flag
      with: { label: "ok" },
      secrets: "inherit",
    });
  });
  caller.job("invalid", ({ job }) => {
    return job.reusable().call("./.github/workflows/callee.yml", callee, {
      // @ts-expect-error input flag is boolean
      with: { flag: "true", label: "ok" },
      secrets: "inherit",
    });
  });
  caller.job("invalid", ({ job }) => {
    return job.reusable().call("./.github/workflows/callee.yml", callee, {
      // @ts-expect-error undeclared input
      with: { flag: true, label: "ok", other: "no" },
      secrets: "inherit",
    });
  });
  caller.job("invalid", ({ job }) => {
    return job.reusable().call("./.github/workflows/callee.yml", callee, {
      with: { flag: true, label: "ok" },
      // @ts-expect-error required explicit secret is missing
      secrets: {},
    });
  });
  caller.job("invalid", ({ job }) => {
    return job.reusable().call("./.github/workflows/callee.yml", callee, {
      with: { flag: true, label: "ok" },
      // @ts-expect-error undeclared explicit secret
      secrets: { token: "fixture", other: "no" },
    });
  });
  const finished = caller.job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/callee.yml", callee, {
        with: { flag: true, label: "ok" },
        secrets: "inherit",
      }),
  );
  finished.job("consume", ({ job, jobs }) => {
    return job.needs(jobs.call).runsOn("ubuntu-latest").run({
      name: "Use",
      run: "echo use",
      // @ts-expect-error output name inferred from workflow outputs
      env: { BAD: ({ needs }) => needs.call.outputs.missing },
    });
  });
  caller.job("invalid", ({ job }) => {
    const call = job.reusable();
    // @ts-expect-error reusable caller has no run step
    call.run({ name: "No", run: "echo no" });
    // @ts-expect-error reusable caller has no runner
    call.runsOn("ubuntu-latest");
    return call.call("./.github/workflows/callee.yml", callee, {
      with: { flag: true, label: "ok" },
      secrets: "inherit",
    });
  });
  void defineProject({ workflows: [callee, finished] });
}
void assertReusableTypes;
