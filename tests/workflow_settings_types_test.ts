import {
  literal,
  workflow,
  type WorkflowPermissions,
} from "../src/github_actions/mod.ts";

import type { permissionLevels } from "../src/github_actions/permissions.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type _PermissionCatalog = Expect<
  Equal<
    Exclude<WorkflowPermissions, string>,
    Readonly<
      {
        [K in keyof typeof permissionLevels]?:
          typeof permissionLevels[K][number];
      }
    >
  >
>;

function settingsTypes() {
  const permission: WorkflowPermissions = {
    "artifact-metadata": "write",
    "code-quality": "read",
    "vulnerability-alerts": "read",
  };
  void permission;
  const invalidPermission: WorkflowPermissions = {
    // @ts-expect-error vulnerability-alerts has no write level
    "vulnerability-alerts": "write",
  };
  void invalidPermission;
  workflow("ci.yml", {
    on: { push: {} },
    vars: ["RUNNERS"],
    concurrency: ({ github, vars }) => ({
      group: vars.RUNNERS,
      cancelInProgress: github.ref.eq("refs/heads/main"),
    }),
  })
    .job("build", ({ job }) => {
      const exec = job.runsOn(({ vars }) => ({
        group: vars.RUNNERS,
        labels: ["linux"],
      }));
      // @ts-expect-error runs-on excludes secrets
      job.runsOn(({ secrets }) => secrets.TOKEN);
      // @ts-expect-error workflow/job cancellation must be boolean, not a number expression
      exec.concurrency({ group: "build", cancelInProgress: literal(1) });
      exec.environment({
        name: ({ github }) => github.ref_name,
        url: ({ env, runner }) => env.URL.or(runner.temp),
      });
      // @ts-expect-error environment name excludes env
      exec.environment({ name: ({ env }) => env.NAME });
      // @ts-expect-error environment name excludes steps
      exec.environment({ name: ({ steps }) => steps.build.outputs.url });
      // @ts-expect-error environment URL excludes secrets
      exec.environment({ name: "dev", url: ({ secrets }) => secrets.TOKEN });
      exec.environment({
        name: "dev",
        // @ts-expect-error no step output exists before adding its named step
        url: ({ steps }) => steps.build.outputs.url,
      });
      const built = exec.run({
        id: "build",
        name: "Build",
        run: "true",
        outputs: ["url"],
      }).environment({
        name: "dev",
        url: ({ steps }) => steps.build.outputs.url,
      });
      built.steps.build.outputs.url;
      built.environment({
        name: "dev",
        // @ts-expect-error environment retains declared output names
        url: ({ steps }) => steps.build.outputs.missing,
      });
      return built;
    });
  workflow("ci.yml", {
    on: { push: {} },
    // @ts-expect-error workflow defaults are literal strings
    defaults: { shell: literal("bash") },
  });
  workflow("ci.yml", {
    on: { push: {} },
    // @ts-expect-error workflow concurrency excludes needs
    concurrency: ({ needs }) => ({
      group: needs.build.outputs.group,
      cancelInProgress: false,
    }),
  });
}
void settingsTypes;
