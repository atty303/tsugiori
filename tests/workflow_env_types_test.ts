import { type Expression, workflow } from "../src/github_actions/mod.ts";

function workflowEnvContracts(): void {
  workflow("env-types.yml", {
    on: {
      workflow_dispatch: {
        inputs: {
          dry_run: { type: "boolean", default: false },
          count: { type: "number", default: 1 },
          stage: { type: "choice", options: ["dev", "prd"] },
        },
      },
    },
    vars: ["REGION"],
    secrets: ["DEPLOY_TOKEN"],
    env: (context) => {
      const flag: Expression<boolean> = context.inputs.dry_run;
      const count: Expression<number> = context.inputs.count;
      const stage: Expression<string> = context.inputs.stage;
      const job: Expression<string> = context.github.job;
      const token: Expression<string> = context.github.token;
      // @ts-expect-error runner-initialized github.job is not null
      const serverJob: Expression<null> = context.github.job;
      void serverJob;
      // @ts-expect-error declared variable names are retained
      context.vars.UNKNOWN;
      // @ts-expect-error declared secret names are retained
      context.secrets.UNKNOWN;
      // @ts-expect-error declared input names are retained
      context.inputs.UNKNOWN;
      // @ts-expect-error workflow env cannot read sibling env values
      context.env;
      // @ts-expect-error workflow env cannot read job dependencies
      context.needs;
      // @ts-expect-error workflow env cannot read matrix
      context.matrix;
      // @ts-expect-error workflow env cannot read steps
      context.steps;
      // @ts-expect-error workflow env cannot read runner
      context.runner;
      // @ts-expect-error workflow env cannot read job context
      context.job;
      // @ts-expect-error workflow env cannot read strategy
      context.strategy;
      // @ts-expect-error hashFiles is not available in workflow env
      context.hashFiles;
      return {
        DRY_RUN: flag,
        COUNT: count,
        STAGE: stage,
        JOB: job,
        TOKEN: token,
        REGION: context.vars.REGION,
        CUSTOM_TOKEN: context.secrets.DEPLOY_TOKEN,
        STANDARD_TOKEN: context.secrets.GITHUB_TOKEN,
        SHA: context.github.sha,
        CI: "true",
      };
    },
  });
  workflow("no-declarations.yml", {
    on: { push: {} },
    env: ({ github, vars, secrets, inputs }) => {
      const region: Expression<string> = vars.REGION;
      const deployToken: Expression<string> = secrets.DEPLOY_TOKEN;
      // @ts-expect-error undeclared input
      inputs.stage;
      return {
        SHA: github.sha,
        TOKEN: secrets.GITHUB_TOKEN,
        REGION: region,
        CUSTOM_TOKEN: deployToken,
      };
    },
  });
  workflow("bad-literal.yml", {
    on: { push: {} },
    // @ts-expect-error env does not accept numeric literals
    env: { COUNT: 1 },
  });
  workflow("bad-boolean.yml", {
    on: { push: {} },
    // @ts-expect-error env does not accept boolean literals
    env: { DRY_RUN: false },
  });
  workflow("bad-callback.yml", {
    on: { push: {} },
    // @ts-expect-error callback results must contain strings or expressions
    env: () => ({ COUNT: 1 }),
  });
  workflow("bad-value-callback.yml", {
    on: { push: {} },
    // @ts-expect-error only a map-level callback is supported
    env: { SHA: () => "sha" },
  });
}
void workflowEnvContracts;
