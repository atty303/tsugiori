import {
  literal,
  project,
  rawExpression,
  startsWith,
  workflow,
} from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";

function declarations() {
  const leaf = workflow(".github/workflows/leaf.yml", {
    on: { workflow_call: {} },
    cacheMode: "read",
  }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").cacheMode("none").snapshot({
        imageName: "ci",
        version: "2.*",
        if: ({ github }) => startsWith(github.ref, "refs/tags/").not(),
      }).run({ id: "setup", name: "Setup", run: "true" }),
  );
  const root = workflow("root.yml", { on: { push: {} }, cacheMode: "write" })
    .job("call", ({ job }) => {
      const caller = job.reusable().cacheMode("read");
      // @ts-expect-error snapshots belong to runner jobs, not callers
      caller.snapshot("ci");
      // @ts-expect-error cache mode is an enum, not a runtime expression
      caller.cacheMode(rawExpression("'write'"));
      return caller.call("./.github/workflows/leaf.yml", leaf, {});
    });
  workflow("bad.yml", {
    on: { push: {} },
    // @ts-expect-error cache mode is not an arbitrary string
    cacheMode: "restore-only",
  }).job("build", ({ job }) => {
    const exec = job.runsOn("ubuntu-latest").cacheMode("write-only");
    exec.snapshot({
      imageName: "ci",
      // @ts-expect-error frozen docs evidence github, not secrets
      if: ({ secrets }) => secrets.MAKE_IMAGE.eq("true"),
    });
    exec.snapshot({ imageName: "ci", if: literal(true) });
    exec.snapshot({ imageName: "ci", if: rawExpression("vars.MAKE_IMAGE") });
    const steps = exec.run({ id: "setup", name: "Setup", run: "true" });
    // @ts-expect-error set snapshot before appending steps
    steps.snapshot("ci");
    return steps;
  });
  scenario(
    root,
    (test) =>
      test.job("call", (job) =>
        job.expectSettings({ cacheMode: "read", cacheModeSource: "job" })),
    { config: project({ workflows: [root, leaf] }) },
  );
}
void declarations;
