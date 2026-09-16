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
try {
  Deno.statSync("fail-config");
  throw new Error("config-load-private");
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
const test = ci.job("test", { runsOn: "ubuntu-latest" });
test.run("Setup", "echo setup");
test.task("Test", async (ctx) => {
  ctx.logger.info("task-log-private");
  if (Deno.env.get("TSUGIORI_TASK_FAILURE") === "1") {
    Object.defineProperty(WeakMap.prototype, "get", {
      value: () => "task-error-type-private",
    });
    const error = new Error("task-failure-private") as Error & {
      errorType: string;
    };
    error.errorType = "task-error-type-private";
    throw error;
  }
  await Deno.writeTextFile("task-result.txt", ctx.cwd);
});

export default defineTsugiori({ pipelines: [ci] });
`;
      await Deno.writeTextFile(resolve(fixture, "tsugiori.ts"), configSource);

      const cli = resolve(fixture, "bin/tsugiori");
      await buildCli(cli);
      const environment: Record<string, string> = {
        ...Deno.env.toObject(),
        PATH: `${resolve(fixture, "bin")}:${Deno.env.get("PATH") ?? ""}`,
      };
      delete environment.RUNNER_DEBUG;
      assertEquals(environment.RUNNER_DEBUG, undefined);

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
        { ...environment, RUNNER_DEBUG: "1" },
      );
      assertEquals(stale.code, 1);
      assertStringIncludes(stale.stderr, "task layout is stale");
      const staleRecord = diagnosticRecord(stale.stderr);
      assert(staleRecord !== undefined);
      assertEquals(
        staleRecord.operations.at(-1)?.errorType,
        "registry_layout_mismatch",
      );
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
      assertEquals(diagnosticRecord(executed.stderr), undefined);
      assertEquals(
        await Deno.readTextFile(resolve(fixture, "task-result.txt")),
        await Deno.realPath(fixture),
      );

      const debugged = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        { ...environment, RUNNER_DEBUG: "1" },
      );
      assertEquals(debugged.code, 0, debugged.stderr);
      const debugRecord = diagnosticRecord(debugged.stderr);
      assert(debugRecord !== undefined);
      assertEquals(
        debugRecord.operations[0],
        {
          name: "task.dispatch",
          status: "success",
          attributes: { entrypoint: "ci/test/task-1" },
        },
      );
      assertEquals(debugRecord.status, "success");
      assertEquals(debugRecord.completeness, "complete");
      assertEquals(debugged.stderr.includes("task-log-private"), false);

      const taskFailure = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        {
          ...environment,
          RUNNER_DEBUG: "1",
          TSUGIORI_TASK_FAILURE: "1",
        },
      );
      assertEquals(taskFailure.code, 1);
      assertStringIncludes(taskFailure.stderr, "task-failure-private");
      const taskFailureRecord = diagnosticRecord(taskFailure.stderr);
      assert(taskFailureRecord !== undefined);
      assertEquals(taskFailureRecord.operations[0].errorType, "task_failed");
      assertEquals(
        taskFailure.stderr.includes("task-error-type-private"),
        false,
      );

      await Deno.writeTextFile(resolve(fixture, "fail-config"), "fail\n");
      const configFailure = await run(
        runtime,
        ["ci/test/task-1"],
        fixture,
        { ...environment, RUNNER_DEBUG: "1" },
      );
      assertEquals(configFailure.code, 1);
      assertStringIncludes(configFailure.stderr, "config-load-private");
      const configFailureRecords = diagnosticRecords(configFailure.stderr);
      assertEquals(configFailureRecords.length, 1);
      assertEquals(
        configFailureRecords[0].operations[0].errorType,
        "config_load_failed",
      );
      await Deno.remove(resolve(fixture, "fail-config"));

      const unknown = await run(
        runtime,
        ["ci/test/task-99"],
        fixture,
        { ...environment, RUNNER_DEBUG: "1" },
      );
      assertEquals(unknown.code, 1);
      assertStringIncludes(unknown.stderr, "Unknown task entrypoint");
      const unknownRecord = diagnosticRecord(unknown.stderr);
      assert(unknownRecord !== undefined);
      assertEquals(
        unknownRecord.operations[0].errorType,
        "entrypoint_not_found",
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
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

type DiagnosticRecord = Readonly<{
  status: "error" | "success";
  completeness: "complete" | "partial";
  operations: readonly Readonly<{
    name: string;
    status: "error" | "success";
    errorType?: string;
    attributes?: Readonly<Record<string, string>>;
  }>[];
}>;

function diagnosticRecord(stderr: string): DiagnosticRecord | undefined {
  return diagnosticRecords(stderr)[0];
}

function diagnosticRecords(stderr: string): readonly DiagnosticRecord[] {
  const records: DiagnosticRecord[] = [];
  for (const line of stderr.split("\n")) {
    if (!line.startsWith('{"schemaVersion":1,')) continue;
    records.push(JSON.parse(line) as DiagnosticRecord);
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
