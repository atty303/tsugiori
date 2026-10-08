import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { dirname, resolve } from "node:path";
import { parse } from "../src/deps.ts";

Deno.test({
  name:
    "self-contained composite payload prepares, restores, and dispatches in caller cwd",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const root = await Deno.makeTempDir({ prefix: "tsugiori-composite-" });
    try {
      const author = resolve(root, "author");
      const consumer = resolve(root, "consumer");
      await Deno.mkdir(author);
      await Deno.mkdir(consumer);
      await copyDirectory(resolve("src"), resolve(author, "src"));
      const config = JSON.parse(await Deno.readTextFile("deno.json"));
      delete config.workspace;
      config.tasks = { tsugiori: "deno run --frozen=true -A ./actions.ts" };
      await Deno.writeTextFile(
        resolve(author, "deno.json"),
        JSON.stringify(config),
      );
      await Deno.copyFile("deno.lock", resolve(author, "deno.lock"));
      await Deno.writeTextFile(
        resolve(author, "dependency.ts"),
        'export const marker = "payload";\n',
      );
      await Deno.writeTextFile(
        resolve(author, "actions.ts"),
        `
import { compositeAction, project as makeProject, runProject, textValue } from "./src/github_actions.ts";
import { marker } from "./dependency.ts";
const draft = compositeAction("action.yaml", { name: "Task", description: "Independent task", inputs: { who: { description: "Recipient", required: true } }, outputs: { result: { description: "Result" } } });
const action = draft.steps(({ step }) => step.task({ id: "tsugiori-task-prepare", name: "Execute", inputs: { who: { contract: textValue(), from: draft.inputs.who } }, outputs: { result: { contract: textValue(), required: true } }, run: async ({ inputs, outputs }) => {
  if (Deno.env.get("TASK_FAIL") === "1") throw new Error("private task failure");
  await Deno.writeTextFile("result.txt", marker + ":" + inputs.who);
  await outputs.set("result", inputs.who);
}}).outputs(({ steps }) => ({ result: steps["tsugiori-task-prepare"].outputs.result })));
const parent = compositeAction("parent/action.yml", { name: "Parent", description: "Parent" }).steps(({ step }) => step.uses(action, { with: { who: "world" } }));
if (import.meta.main) Deno.exitCode = await runProject({ project: makeProject({ workingDirectory: ".", actions: [parent], cacheVersion: 7 }), entrypointUrl: import.meta.url });
`,
      );
      const env = {
        ...Deno.env.toObject(),
        XDG_CACHE_HOME: resolve(root, "cache"),
        RUNNER_TEMP: root,
        GITHUB_OUTPUT: resolve(root, "output"),
      };
      const generated = await run(
        Deno.execPath(),
        ["task", "tsugiori", "generate"],
        author,
        env,
      );
      assertEquals(generated.code, 0, generated.stderr);
      const check = () =>
        run(
          Deno.execPath(),
          ["task", "tsugiori", "generate", "--check"],
          author,
          env,
        );
      assertEquals((await check()).code, 0);
      const copiedDependency = resolve(
        author,
        ".tsugiori/source/dependency.ts",
      );
      await Deno.writeTextFile(copiedDependency, "// changed\n");
      assertStringIncludes(
        (await check()).stderr,
        "changed: .tsugiori/source/dependency.ts",
      );
      await Deno.remove(copiedDependency);
      assertStringIncludes(
        (await check()).stderr,
        "missing: .tsugiori/source/dependency.ts",
      );
      assertEquals(
        (await run(
          Deno.execPath(),
          ["task", "tsugiori", "generate"],
          author,
          env,
        )).code,
        0,
      );
      const yaml = await Deno.readTextFile(
        resolve(author, "action.yaml"),
      );
      const action = parse(yaml) as {
        runs: {
          steps: {
            id?: string;
            name: string;
            run?: string;
            env?: Record<string, string>;
            with?: Record<string, string>;
          }[];
        };
      };
      assertEquals(action.runs.steps.length, 3);
      const prepare = action.runs.steps[1];
      assertEquals(prepare.id, "tsugiori-task-prepare-2");
      const actionDirectory = resolve(consumer, "action");
      await copyDirectory(
        resolve(author, ".tsugiori"),
        resolve(actionDirectory, ".tsugiori"),
      );
      await Deno.copyFile(
        resolve(author, "action.yaml"),
        resolve(actionDirectory, "action.yaml"),
      );
      await Deno.remove(author, { recursive: true });
      const sourceKey = prepare.env!.TSUGIORI_SOURCE_KEY;
      const bootstrapEnv = {
        ...env,
        ...prepare.env,
        TSUGIORI_PROJECT_DIRECTORY: resolve(
          actionDirectory,
          ".tsugiori/source",
        ),
        TSUGIORI_ACTION_PATH: actionDirectory,
        TSUGIORI_ARTIFACT_CACHE: resolve(root, "delivery"),
        TSUGIORI_RUNNER_OS: Deno.build.os === "darwin" ? "macOS" : "Linux",
        TSUGIORI_RUNNER_ARCH: Deno.build.arch === "aarch64" ? "ARM64" : "X64",
      };
      const bootstrap = () =>
        run(
          "/bin/bash",
          [resolve(actionDirectory, ".tsugiori/prepare.sh")],
          consumer,
          bootstrapEnv,
        );
      const first = await bootstrap();
      assertEquals(first.code, 0, first.stderr);
      assertStringIncludes(first.stdout, "cache miss");
      const manifest = JSON.parse(
        await Deno.readTextFile(resolve(root, "delivery/manifest.json")),
      );
      assertEquals(manifest.entrypoints, [
        "action.yaml/composite/tsugiori-task-prepare",
      ]);
      const runtime = (await Deno.readTextFile(env.GITHUB_OUTPUT)).split("\n")
        .find((line) => line.startsWith("runtime-path="))!.slice(
          "runtime-path=".length,
        );
      const second = await bootstrap();
      assertEquals(second.code, 0, second.stderr);
      assertStringIncludes(second.stdout, "cache hit");
      const tools = resolve(root, "tools");
      await Deno.mkdir(tools);
      for (const command of ["mkdir", "chmod", "ls", "tail", "rm"]) {
        let tool = `/usr/bin/${command}`;
        if (!(await exists(tool))) tool = `/bin/${command}`;
        await Deno.symlink(tool, resolve(tools, command));
      }
      const offline = await run(
        "/bin/bash",
        [resolve(actionDirectory, ".tsugiori/prepare.sh")],
        consumer,
        { ...bootstrapEnv, PATH: tools, TSUGIORI_DIAGNOSTICS: "0" },
      );
      assertEquals(offline.code, 0, offline.stderr);
      assertStringIncludes(offline.stdout, "cache hit");

      for (const who of ["one", "two"]) {
        const task = await run(
          runtime,
          ["action.yaml/composite/tsugiori-task-prepare"],
          consumer,
          {
            ...env,
            TSUGIORI_INPUT_WHO: who,
          },
        );
        assertEquals(task.code, 0, task.stderr);
        assertEquals(
          await Deno.readTextFile(resolve(consumer, "result.txt")),
          `payload:${who}`,
        );
      }
      assert(
        !(await exists(
          resolve(actionDirectory, ".tsugiori/source/result.txt"),
        )),
      );
      const failure = await run(
        runtime,
        ["action.yaml/composite/tsugiori-task-prepare"],
        consumer,
        { ...env, TSUGIORI_INPUT_WHO: "bad", TASK_FAIL: "1" },
      );
      assertEquals(failure.code, 1);
      assertStringIncludes(failure.stderr, "private task failure");
      await Deno.writeTextFile(
        resolve(actionDirectory, ".tsugiori/source/dependency.ts"),
        "// drift\n",
      );
      const drift = await bootstrap();
      assertEquals(drift.code, 1);
      assertStringIncludes(drift.stderr, "source changed");
      const histories = [];
      for await (
        const entry of Deno.readDir(resolve(root, "cache/tsugiori/diagnostics"))
      ) {
        histories.push(
          await Deno.readTextFile(
            resolve(root, "cache/tsugiori/diagnostics", entry.name),
          ),
        );
      }
      assert(histories.some((history) => history.includes('"source_drift"')));
      assert(
        !histories.some((history) => history.includes("private task failure")),
      );
      assert(/^S[0-9A-Z]{50}$/.test(sourceKey));
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string>,
) {
  const output = await new Deno.Command(command, {
    args: [...args],
    cwd,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}
async function exists(path: string) {
  try {
    await Deno.stat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}
async function copyDirectory(source: string, destination: string) {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const target = resolve(destination, entry.name);
    if (entry.isDirectory) {
      await copyDirectory(resolve(source, entry.name), target);
    } else if (entry.isFile) {
      await Deno.mkdir(dirname(target), { recursive: true });
      await Deno.copyFile(resolve(source, entry.name), target);
    }
  }
}
