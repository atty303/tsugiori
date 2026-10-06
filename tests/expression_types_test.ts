import {
  defineProject,
  defineWorkflow,
  type Expression,
  fromJSON,
  rawNode,
  textValue,
} from "@atty303/tsugiori/github-actions";

function assertContracts(): void {
  const widenedNames: string[] = ["env"];
  defineWorkflow(".github/workflows/bad-vars.yml", {
    on: { push: {} },
    // @ts-expect-error declared keys must retain literal names
    vars: widenedNames,
  });
  defineWorkflow(".github/workflows/bad-secrets.yml", {
    on: { push: {} },
    // @ts-expect-error declared keys must retain literal names
    secrets: widenedNames,
  });
  const name = "dev";
  const deploy = {
    name: "Action",
    description: "Action metadata",
    uses: "example/deploy@sha",
    inputs: { stage: { description: "Input", required: true } },
    outputs: { "name": { description: "Output" } },
  } as const;
  defineWorkflow(".github/workflows/logic.yml", {
    on: {
      push: {},
      workflow_dispatch: { inputs: { commit: { type: "string" } } },
    },
  }).job("test", ({ job }) =>
    job.runsOn("ubuntu-latest").uses(deploy, {
      name: "Conditional action input",
      with: ({ github, inputs }) => {
        const primary = github.event_name.eq("push").and(github.sha);
        const maybePrimary: Expression<false | string> = primary;
        const chosen: Expression<string> = primary.or(inputs.commit);
        void maybePrimary;
        return { stage: chosen };
      },
    }));
  const broad = rawNode<NonNullable<unknown>>("false").and("run");
  // @ts-expect-error a non-nullish value can be falsy, so && may not return a string
  const impossible: Expression<string> = broad;
  void impossible;
  const matrixContract = textValue();
  defineWorkflow(".github/workflows/inline.yml", {
    on: { push: {} },
  })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").task({
          name: "Inline",
          inputs: {},
          outputs: {},
          run: ({ outputs }) => {
            void outputs;
          },
        }),
    );
  defineWorkflow(".github/workflows/collision.yml", {
    on: { push: {} },
  }).job("test", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .run({
        id: "eq",
        name: "Colliding step ID",
        run: "true",
        outputs: ["result"],
      })
      .outputs(({ steps }) => {
        // @ts-expect-error method names require explicit key access
        steps.eq.outputs.result;
        return { result: steps.at("eq").at("outputs").at("result") };
      }));
  const first = defineWorkflow(".github/workflows/ci.yml", {
    on: { push: {} },
    vars: ["env"],
    secrets: ["token"],
  })
    .job("prepare", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .task({
          id: "produce",
          name: "Produce",
          inputs: {},
          outputs: { matrix: { contract: matrixContract, required: true } },
          run: async ({ outputs }) => {
            await outputs.set("matrix", "dev");
            // @ts-expect-error undeclared task output
            await outputs.set("missing", "value");
          },
        })
        .outputs(({ steps }) => ({ matrix: steps.produce.outputs.matrix })));
  first.job("bad-raw-string", ({ job }) =>
    job.runsOn("ubuntu-latest")
      // @ts-expect-error an ordinary string is not an expression
      .when("github.ref == 'main'")
      .run({ name: "Noop", run: "true" }));
  first.job(
    "bad",
    ({ job, jobs }) =>
      job.needs(jobs.prepare).runsOn("ubuntu-latest")
        // @ts-expect-error fromJSON requires a shape assertion at the matrix axis
        .strategy(({ needs }) => ({
          matrix: { stage: fromJSON(needs.prepare.outputs.matrix) },
        }))
        .run({ name: "Noop", run: "true" }),
  );
  first.job(
    "dynamic",
    ({ job, jobs }) =>
      job.needs(jobs.prepare).runsOn("ubuntu-latest")
        .strategy(({ needs }) => ({
          matrix: fromJSON(needs.prepare.outputs.matrix).as<
            { stage: string }
          >(),
        }))
        .concurrency(({ matrix }) => ({
          group: matrix.stage,
          cancelInProgress: false,
        }))
        .run({ name: "Noop", run: "true" }),
  );
  const second = first.job(
    "deploy",
    ({ job, jobs }) =>
      job.needs(jobs.prepare).runsOn("ubuntu-latest")
        .when(({ github, needs, vars }) => {
          // @ts-expect-error step context unavailable in job if
          steps.produce;
          // @ts-expect-error undeclared var
          vars.missing;
          // @ts-expect-error undeclared job
          needs.unknown;
          // @ts-expect-error undeclared output
          needs.prepare.outputs.unknown;
          return github.ref.eq(`refs/heads/main`).and(
            needs.prepare.outputs.matrix.ne(""),
          );
        })
        .strategy(({ needs }) => ({
          matrix: {
            stage: fromJSON(needs.prepare.outputs.matrix).as<
              readonly string[]
            >(),
          },
        }))
        .concurrency(({ matrix }) => ({
          group: matrix.stage,
          cancelInProgress: false,
        }))
        .uses(deploy, {
          id: "deploy",
          name: "Deploy",
          with: ({ matrix }) => ({ stage: matrix.stage }),
        })
        .run({
          name: "Check",
          run: "true",
          if: ({ steps }) => {
            // @ts-expect-error future step unavailable
            steps.future;
            return steps.deploy.outputs.name.eq(`matrix-${name}`).or(
              rawNode<boolean>("custom()"),
            );
          },
        }),
  );
  defineProject({ workflows: [second] });
}
void assertContracts;
Deno.test("typed expression contracts compile", () => {});
