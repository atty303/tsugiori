import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { resolve } from "node:path";
import { buildCli } from "../packages/cli/src/build.ts";

Deno.test({
  name:
    "compiled CLI generates, prepares, caches, and dispatches a task artifact",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const repositoryRoot = Deno.cwd();
    const fixture = await Deno.makeTempDir({ prefix: "tsugiori-e2e-" });
    try {
      await copyDirectory(
        resolve(repositoryRoot, "packages/core"),
        resolve(fixture, "vendor/core"),
      );
      await Deno.writeTextFile(
        resolve(fixture, "deno.json"),
        `${
          JSON.stringify(
            {
              extends: "./deno.base.json",
              imports: {
                "@tsugiori/core/github-actions":
                  "./vendor/core/src/github_actions/mod.ts",
              },
            },
            null,
            2,
          )
        }\n`,
      );
      await Deno.writeTextFile(
        resolve(fixture, "deno.base.json"),
        `${JSON.stringify({ compilerOptions: { strict: true } }, null, 2)}\n`,
      );
      const configSource =
        `import { defineTsugiori, pipeline } from "@tsugiori/core/github-actions";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["push"],
});
const test = ci.job("test", { runsOn: "ubuntu-latest" });
test.run("Setup", "echo setup");
test.task("Test", async (ctx) => {
  ctx.logger.info("task-log-private");
  await Deno.writeTextFile("task-result.txt", ctx.cwd);
});

export default defineTsugiori({ pipelines: [ci] });
`;
      await Deno.writeTextFile(resolve(fixture, "tsugiori.ts"), configSource);

      const cli = resolve(fixture, "bin/tsugiori");
      await buildCli(cli);
      const environment = {
        ...Deno.env.toObject(),
        PATH: `${resolve(fixture, "bin")}:${Deno.env.get("PATH") ?? ""}`,
      };

      const generated = await run(
        cli,
        ["generate", "--config", "./tsugiori.ts"],
        fixture,
        environment,
      );
      assertEquals(generated.code, 0, generated.stderr);
      const workflow = await Deno.readTextFile(
        resolve(fixture, ".github/workflows/ci.yml"),
      );
      assertStringIncludes(workflow, "name: Prepare task artifact");
      assertStringIncludes(
        workflow,
        "run: ./.tsugiori/task-runtime ci/test/task-1",
      );
      const expectedLayout = workflow.match(/ci\/test=sha256:[0-9a-f]+/)?.[0];
      assert(expectedLayout !== undefined);

      await Deno.writeTextFile(
        resolve(fixture, "tsugiori.ts"),
        configSource.replace('task("Test"', 'task("Changed"'),
      );
      const stale = await run(
        cli,
        [
          "task",
          "prepare",
          "--config",
          "./tsugiori.ts",
          "--expect-layout",
          expectedLayout,
        ],
        fixture,
        environment,
      );
      assertEquals(stale.code, 1);
      assertStringIncludes(stale.stderr, "task layout is stale");
      await Deno.writeTextFile(resolve(fixture, "tsugiori.ts"), configSource);

      const firstPrepare = await run(
        cli,
        [
          "task",
          "prepare",
          "--config",
          "./tsugiori.ts",
          "--expect-layout",
          expectedLayout,
        ],
        fixture,
        environment,
      );
      assertEquals(firstPrepare.code, 0, firstPrepare.stderr);
      assertStringIncludes(firstPrepare.stdout, "cache miss");

      await Deno.remove(resolve(fixture, ".tsugiori/task-runtime"));
      await Deno.remove(resolve(fixture, ".tsugiori/task-runtime.json"));
      const secondPrepare = await run(
        cli,
        [
          "task",
          "prepare",
          "--config",
          "./tsugiori.ts",
          "--expect-layout",
          expectedLayout,
        ],
        fixture,
        environment,
      );
      assertEquals(secondPrepare.code, 0, secondPrepare.stderr);
      assertStringIncludes(secondPrepare.stdout, "cache hit");

      await Deno.writeTextFile(
        resolve(fixture, "deno.base.json"),
        `${
          JSON.stringify(
            { compilerOptions: { strict: true, jsx: "react-jsx" } },
            null,
            2,
          )
        }\n`,
      );
      const configurationChanged = await run(
        cli,
        [
          "task",
          "prepare",
          "--config",
          "./tsugiori.ts",
          "--expect-layout",
          expectedLayout,
        ],
        fixture,
        environment,
      );
      assertEquals(configurationChanged.code, 0, configurationChanged.stderr);
      assertStringIncludes(configurationChanged.stdout, "cache miss");

      const materializedManifest = JSON.parse(
        await Deno.readTextFile(
          resolve(fixture, ".tsugiori/task-runtime.json"),
        ),
      ) as { artifactKey: string };
      await Deno.writeTextFile(
        resolve(
          fixture,
          `.tsugiori/cache/artifacts/${materializedManifest.artifactKey}/task-runtime`,
        ),
        "corrupt",
      );
      await Deno.remove(resolve(fixture, ".tsugiori/task-runtime"));
      await Deno.remove(resolve(fixture, ".tsugiori/task-runtime.json"));
      const recovered = await run(
        cli,
        [
          "task",
          "prepare",
          "--config",
          "./tsugiori.ts",
          "--expect-layout",
          expectedLayout,
        ],
        fixture,
        environment,
      );
      assertEquals(recovered.code, 0, recovered.stderr);
      assertStringIncludes(recovered.stdout, "cache miss");

      const runtime = resolve(fixture, ".tsugiori/task-runtime");
      const executed = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        environment,
      );
      assertEquals(executed.code, 0, executed.stderr);
      assertStringIncludes(executed.stdout, "task-log-private");
      assertEquals(
        await Deno.readTextFile(resolve(fixture, "task-result.txt")),
        await Deno.realPath(fixture),
      );

      const recordsBeforeOptOut = await diagnosticRecords(fixture);
      assert(recordsBeforeOptOut.length >= 4);
      assert(
        recordsBeforeOptOut.every((record) =>
          !record.includes("task-log-private")
        ),
      );
      const optedOut = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        { ...environment, TSUGIORI_DIAGNOSTICS: "off" },
      );
      assertEquals(optedOut.code, 0, optedOut.stderr);
      assertEquals(
        (await diagnosticRecords(fixture)).length,
        recordsBeforeOptOut.length,
      );

      const unknown = await run(
        runtime,
        ["ci/test/task-99"],
        fixture,
        environment,
      );
      assertEquals(unknown.code, 1);
      assertStringIncludes(unknown.stderr, "Unknown task entrypoint");
      assert(
        (await diagnosticRecords(fixture)).some((record) =>
          record.includes('"errorType": "entrypoint_not_found"')
        ),
      );

      await Deno.remove(resolve(fixture, ".tsugiori/diagnostics"), {
        recursive: true,
      });
      await Deno.writeTextFile(
        resolve(fixture, ".tsugiori/diagnostics"),
        "recording unavailable",
      );
      const recordingFailure = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        environment,
      );
      assertEquals(recordingFailure.code, 0);
      assertStringIncludes(
        recordingFailure.stderr,
        "warning: diagnostic recording failed",
      );
    } finally {
      await Deno.remove(fixture, { recursive: true });
    }
  },
});

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
): Promise<Readonly<{ code: number; stdout: string; stderr: string }>> {
  const result = await new Deno.Command(command, {
    args: [...args],
    cwd,
    env: { ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

async function diagnosticRecords(root: string): Promise<readonly string[]> {
  const directory = resolve(root, ".tsugiori/diagnostics");
  const records: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      records.push(await Deno.readTextFile(resolve(directory, entry.name)));
    }
  }
  return records;
}

async function copyDirectory(
  source: string,
  destination: string,
): Promise<void> {
  await Deno.mkdir(destination, { recursive: true });
  for await (const entry of Deno.readDir(source)) {
    const from = resolve(source, entry.name);
    const to = resolve(destination, entry.name);
    if (entry.isDirectory) await copyDirectory(from, to);
    else if (entry.isFile) await Deno.copyFile(from, to);
  }
}
