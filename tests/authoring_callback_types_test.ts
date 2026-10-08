import { literal, textValue, workflow } from "../src/github_actions/mod.ts";

function checkCallbacks() {
  const callee = workflow("callee.yml", {
    on: {
      workflow_call: {
        inputs: {
          revision: { type: "string", required: true },
          flag: { type: "boolean" },
        },
        secrets: { token: { required: true } },
      },
    },
  }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }),
  );
  workflow("caller.yml", { on: { push: {} }, secrets: ["TOKEN"] }).job(
    "check",
    ({ job }) => {
      const execution = job.runsOn("ubuntu-latest");
      execution.env(({ github, secrets }) => ({
        SHA: github.sha,
        TOKEN: secrets.TOKEN,
      }));
      execution.env(({ github }) => {
        // @ts-expect-error job env has no runner
        void github.missing;
        return { SHA: github.sha };
      });
      // @ts-expect-error job env has no env context
      execution.env(({ env }) => ({ VALUE: env.VALUE }));
      execution.defaultsRun(({ github, env }) => ({
        shell: "bash",
        workingDirectory: github.workspace.or(env.DIR),
      }));
      // @ts-expect-error defaults exclude secrets
      execution.defaultsRun(({ secrets }) => ({ shell: secrets.TOKEN }));
      // @ts-expect-error defaults per-value callbacks removed
      execution.defaultsRun({ shell: () => literal("bash") });
      execution.concurrency(({ github }) => ({
        group: github.ref,
        cancelInProgress: false,
        queue: "max",
      }));
      // @ts-expect-error concurrency excludes secrets
      execution.concurrency(({ secrets }) => ({
        group: secrets.TOKEN,
        cancelInProgress: false,
      }));
      execution.concurrency(({ github }) => ({
        group: github.ref,
        cancelInProgress: literal(true),
      }));
      const reusable = job.reusable();
      reusable.concurrency(({ github }) => ({
        group: github.ref,
        cancelInProgress: false,
      }));
      reusable.call("./callee.yml", callee, {
        with: ({ github, vars }) => ({
          revision: github.sha.or(vars.VERSION),
          flag: true,
        }),
        secrets: ({ secrets, github }) => ({
          token: secrets.TOKEN.or(github.sha),
        }),
      });
      reusable.call("./callee.yml", callee, {
        // @ts-expect-error with excludes secrets
        with: ({ secrets }) => ({ revision: secrets.TOKEN }),
        secrets: "inherit",
      });
      reusable.call("./callee.yml", callee, {
        // @ts-expect-error callback rejects unknown input names
        with: ({ github }) => ({ revision: github.sha, extra: "bad" }),
        secrets: "inherit",
      });
      reusable.call("./callee.yml", callee, {
        with: ({ github }) => ({ revision: github.sha }),
        // @ts-expect-error callback rejects unknown secret names
        secrets: ({ secrets }) => ({ token: secrets.TOKEN, extra: "bad" }),
      });
      reusable.call("./callee.yml", callee, {
        // @ts-expect-error required input missing from callback
        with: () => ({}),
        secrets: "inherit",
      });
      reusable.call("./callee.yml", callee, {
        // @ts-expect-error flag is boolean; github retains its context despite return mismatch
        with: ({ github }) => ({ revision: github.sha, flag: github.sha }),
        secrets: "inherit",
      });
      reusable.rawCall("owner/repo/.github/workflows/ci.yml@v1", {
        // @ts-expect-error raw with also excludes secrets
        with: ({ secrets }) => ({ value: secrets.TOKEN }),
        secrets: ({ secrets }) => ({ token: secrets.TOKEN }),
      });
      // @ts-expect-error args callback removed
      reusable.rawCall("./callee.yml", () => ({ with: {} }));
      // @ts-expect-error per-value callback removed
      execution.env({ VALUE: () => literal("value") });
      execution.concurrency({
        // @ts-expect-error per-value concurrency callback removed
        group: () => literal("group"),
        cancelInProgress: false,
      });
      return execution.task({
        name: "Consume",
        inputs: ({ github }) => ({
          sha: { contract: textValue(), from: github.sha },
        }),
        env: ({ secrets, hashFiles }) => ({
          TOKEN: secrets.TOKEN,
          HASH: hashFiles("deno.lock"),
        }),
        outputs: {},
        run: ({ inputs }) => {
          const sha: string = inputs.sha;
          void sha;
          // @ts-expect-error task input names are retained
          void inputs.missing;
        },
      });
    },
  );
}
void checkCallbacks;
Deno.test("whole callback inference and context boundaries compile", () => {});
