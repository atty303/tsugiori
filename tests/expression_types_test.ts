import {
  actionInput,
  defineAction,
  defineTask,
  defineTsugiori,
  fromJSON,
  pipeline,
  rawNode,
} from "@atty303/tsugiori/github-actions";

function assertContracts(): void {
  const widenedNames: string[] = ["env"];
  pipeline("bad-vars", {
    output: ".github/workflows/bad-vars.yml",
    events: ["push"],
    // @ts-expect-error declared keys must retain literal names
    vars: widenedNames,
  });
  pipeline("bad-secrets", {
    output: ".github/workflows/bad-secrets.yml",
    events: ["push"],
    // @ts-expect-error declared keys must retain literal names
    secrets: widenedNames,
  });
  const name = "dev";
  const deploy = defineAction({
    uses: "example/deploy@sha",
    inputs: { stage: actionInput.string({ required: true }) },
    outputs: ["name"],
  });
  const task = defineTask({
    outputs: ["matrix"],
    run: async ({ outputs }) => {
      await outputs.set("matrix", "dev");
      // @ts-expect-error undeclared task output
      await outputs.set("missing", "value");
    },
  });
  pipeline("inline", {
    output: ".github/workflows/inline.yml",
    events: ["push"],
  })
    .job(
      "test",
      ({ job }) =>
        job.runsOn("ubuntu-latest").task({
          name: "Inline",
          task: async ({ outputs }) => {
            // @ts-expect-error inline task has no declared outputs
            await outputs.set("unknown", "value");
          },
        }),
    );
  pipeline("collision", {
    output: ".github/workflows/collision.yml",
    events: ["push"],
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
  const first = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
    vars: ["env"],
    secrets: ["token"],
  })
    .job("prepare", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .task({ id: "produce", name: "Produce", task })
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
        .concurrency({
          group: ({ matrix }) => matrix.stage,
          cancelInProgress: false,
        })
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
        .concurrency({
          group: ({ matrix }) => matrix.stage,
          cancelInProgress: false,
        })
        .uses({
          id: "deploy",
          name: "Deploy",
          uses: ({ matrix }) => deploy({ stage: matrix.stage }),
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
  defineTsugiori({ pipelines: [second] });
}
void assertContracts;
Deno.test("typed expression contracts compile", () => {});
