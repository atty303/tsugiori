import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { basename, dirname, resolve } from "node:path";
import { parse } from "../src/deps.ts";
import { pathToFileURL } from "node:url";
import { sha256Bytes, sha256File } from "../src/task-runtime/artifact.ts";
import { removeIfPresent } from "../src/task-runtime/cache.ts";

Deno.test({
  name:
    "generated cache → prepare runs offline without Deno and recovers preparation failures",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const fixture = await Deno.makeTempDir({ prefix: "tsugiori-e2e-" });
    try {
      await copyDirectory(resolve(Deno.cwd(), "src"), resolve(fixture, "src"));
      const config = JSON.parse(await Deno.readTextFile("deno.json"));
      delete config.workspace;
      config.tasks = { tsugiori: "deno run --frozen=true -A ./workflows.ts" };
      await Deno.writeTextFile(
        resolve(fixture, "deno.json"),
        JSON.stringify(config),
      );
      await Deno.copyFile("deno.lock", resolve(fixture, "deno.lock"));
      await Deno.writeTextFile(
        resolve(fixture, "dependency.ts"),
        'export const marker = "first";\n',
      );
      await Deno.writeTextFile(
        resolve(fixture, "workflows.ts"),
        `
import { defineProject, defineWorkflow, runProject, textValue } from "./src/github_actions.ts";
import { marker } from "./dependency.ts";
if (Deno.env.get("TEST_OLD_VERSION") === "1") Object.defineProperty(Deno, "version", {value: {...Deno.version, deno: "2.5.0"}});
const project = defineProject({ localTaskPrepareAction: "./.github/actions/task-prepare", workflows: [defineWorkflow("workflows/ci.yml", { on: { push: {} } })
  .job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Test", inputs: {},
    outputs: { result: { contract: textValue(), required: true } },
    run: async (ctx) => {
      if (Deno.env.get("TASK_FAIL") === "1") throw new Error("task-failure-private");
      await Deno.writeTextFile("task-result.txt", marker);
      await ctx.outputs.set("result", "first\\nsecond");
    } }))] });
export default project;
if (import.meta.main) Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });
`,
      );
      const output = resolve(fixture, "github-output");
      const delivery = resolve(fixture, "delivery");
      const tools = resolve(fixture, "tools");
      await Deno.mkdir(tools);
      for (
        const command of [
          "bash",
          "mkdir",
          "chmod",
          "ls",
          "tail",
          "rm",
          "mktemp",
          "dirname",
          "basename",
        ]
      ) {
        let tool = `/usr/bin/${command}`;
        try {
          await Deno.stat(tool);
        } catch {
          tool = `/bin/${command}`;
        }
        await Deno.symlink(tool, resolve(tools, command));
      }
      const invocationLog = resolve(fixture, "deno-invocations");
      await Deno.writeTextFile(
        resolve(tools, "deno"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> '${invocationLog}'\nexec '${Deno.execPath()}' "$@"\n`,
      );
      await Deno.chmod(resolve(tools, "deno"), 0o755);
      const environment = {
        ...Deno.env.toObject(),
        PATH: tools,
        XDG_CACHE_HOME: resolve(fixture, "test-cache"),
        RUNNER_TEMP: fixture,
        TSUGIORI_ARTIFACT_CACHE: delivery,
        TSUGIORI_RUNNER_OS: Deno.build.os === "darwin" ? "macOS" : "Linux",
        TSUGIORI_RUNNER_ARCH: Deno.build.arch === "aarch64" ? "ARM64" : "X64",
        GITHUB_OUTPUT: output,
      };
      const generated = await run(
        Deno.execPath(),
        ["task", "tsugiori", "generate"],
        fixture,
        environment,
      );
      assertEquals(generated.code, 0, generated.stderr);
      const yaml = await Deno.readTextFile(
        resolve(fixture, "workflows/ci.yml"),
      );
      assert(!yaml.includes("Resolve task artifact"));
      assertStringIncludes(yaml, "runner.os");
      assertStringIncludes(yaml, "runner.arch");
      const actionPath = resolve(Deno.cwd(), ".github/actions/task-prepare");
      const action = parse(
        await Deno.readTextFile(resolve(actionPath, "action.yml")),
      ) as {
        runs: {
          steps: {
            run: string;
            env: Record<string, string>;
            "working-directory": string;
          }[];
        };
        outputs: { "runtime-path": { value: string } };
      };
      const step = action.runs.steps[0];
      assertEquals(step["working-directory"], "${{ github.workspace }}");
      assertEquals(
        action.outputs["runtime-path"].value,
        "${{ steps.prepare.outputs.runtime-path }}",
      );
      assertStringIncludes(yaml, "uses: ./.github/actions/task-prepare");
      assert(!yaml.includes("deno_binary"));
      assert(!yaml.includes("expected-layout"));
      const sourceKey = yaml.match(/tsugiori-task-(S[0-9A-Z]{50})/)?.[1];
      assert(sourceKey !== undefined);
      const prepare = async (extra: Record<string, string> = {}) => {
        await Deno.writeTextFile(output, "");
        return await run("/bin/bash", ["-c", step.run], dirname(fixture), {
          TSUGIORI_ACTION_PATH: actionPath,
          TSUGIORI_PROJECT_DIRECTORY: basename(fixture),
          TSUGIORI_ENTRYPOINT: "./workflows.ts",
          TSUGIORI_SOURCE_KEY: sourceKey,
          TSUGIORI_INSTALL_DENO_VERSION: step.env.TSUGIORI_INSTALL_DENO_VERSION,
          ...environment,
          ...extra,
        });
      };
      const first = await prepare();
      assertEquals(first.code, 0, first.stderr);
      const invocations = await Deno.readTextFile(invocationLog);
      for (
        const command of [
          "run --frozen=true",
          "info --json",
          "compile -A",
        ]
      ) assertStringIncludes(invocations, command);
      const binary = await Deno.readFile(resolve(delivery, "task-runtime"));
      const manifest = await Deno.readTextFile(
        resolve(delivery, "manifest.json"),
      );
      assertEquals(JSON.parse(manifest).schemaVersion, 4);
      assertEquals(JSON.parse(manifest).sourceKey, sourceKey);
      const runtime =
        parseGitHubOutputs(await Deno.readTextFile(output))["runtime-path"];
      await Deno.remove(resolve(tools, "deno"));
      await Deno.remove(resolve(fixture, "test-cache/tsugiori/runtimes"), {
        recursive: true,
      });
      const offline = { DENO_DIR: resolve(fixture, "empty-deno-cache") };
      const hit = await prepare(offline);
      assertEquals(hit.code, 0, hit.stderr);
      assertStringIncludes(hit.stdout, "cache hit");
      assertEquals(await Deno.readTextFile(invocationLog), invocations);
      assertEquals(
        parseGitHubOutputs(await Deno.readTextFile(output))["runtime-path"],
        runtime,
      );
      const executed = await run(
        runtime,
        ["workflows/ci.yml/test/task-1"],
        fixture,
        { ...environment, ...offline },
      );
      assertEquals(executed.code, 0, executed.stderr);
      assertEquals(
        await Deno.readTextFile(resolve(fixture, "task-result.txt")),
        "first",
      );
      assertStringIncludes(await Deno.readTextFile(output), "first\nsecond\n");
      const failedTask = await run(
        runtime,
        ["workflows/ci.yml/test/task-1"],
        fixture,
        { ...environment, TASK_FAIL: "1" },
      );
      assertEquals(failedTask.code, 1);
      assertStringIncludes(failedTask.stderr, "task-failure-private");
      assertEquals(await Deno.readTextFile(invocationLog), invocations);
      const inode = (await Deno.stat(runtime)).ino;
      await Promise.all([prepare(), prepare()]);
      assertEquals((await Deno.stat(runtime)).ino, inode);
      await Deno.writeTextFile(runtime, "corrupt-runtime");
      const recoveredRuntime = await prepare();
      assertEquals(recoveredRuntime.code, 0, recoveredRuntime.stderr);
      const recoveryPath =
        parseGitHubOutputs(await Deno.readTextFile(output))["runtime-path"];
      assert(recoveryPath !== runtime);
      assertEquals(await Deno.readFile(recoveryPath), binary);

      // Restore a usable external Deno for fallback; it must be the only binary used.
      await Deno.writeTextFile(
        resolve(tools, "deno"),
        `#!/bin/bash\nprintf '%s\\n' "$*" >> '${invocationLog}'\nexec '${Deno.execPath()}' "$@"\n`,
      );
      await Deno.chmod(resolve(tools, "deno"), 0o755);
      for (
        const damage of ["checksum", "startup", "manifest", "miss", "restore"]
      ) {
        await Deno.writeFile(resolve(delivery, "task-runtime"), binary);
        await Deno.chmod(resolve(delivery, "task-runtime"), 0o755);
        await Deno.writeTextFile(resolve(delivery, "manifest.json"), manifest);
        if (damage === "checksum") {
          await Deno.writeTextFile(
            resolve(delivery, "manifest.json"),
            JSON.stringify({
              ...JSON.parse(manifest),
              binarySha256: "invalid",
            }),
          );
        }
        if (damage === "startup") {
          await Deno.writeTextFile(
            resolve(delivery, "task-runtime"),
            "#!/bin/bash\nexit 7\n",
          );
        }
        if (damage === "manifest") {
          await Deno.writeTextFile(resolve(delivery, "manifest.json"), "{}");
        }
        if (damage === "miss") await Deno.remove(delivery, { recursive: true });
        if (damage === "restore") {
          await Deno.chmod(resolve(delivery, "manifest.json"), 0o000);
        }
        const recovered = await prepare();
        assertEquals(recovered.code, 0, `${damage}: ${recovered.stderr}`);
        const recoveredManifest = JSON.parse(
          await Deno.readTextFile(resolve(delivery, "manifest.json")),
        );
        assertEquals(
          await sha256File(resolve(delivery, "task-runtime")),
          recoveredManifest.binarySha256,
        );
        assertEquals(recoveredManifest.sourceKey, sourceKey);
      }
      // Same checksum-correct but unstartable binary in delivery, local cache, and runtime.
      const key = JSON.parse(manifest).artifactKey;
      const unstartable = new TextEncoder().encode("#!/bin/bash\nexit 7\n");
      const failedManifest = {
        ...JSON.parse(manifest),
        binarySha256: await sha256Bytes(unstartable),
      };
      for (
        const directory of [
          delivery,
          resolve(fixture, "test-cache/tsugiori/cache/artifacts", key),
          resolve(fixture, "test-cache/tsugiori/runtimes", key),
        ]
      ) {
        await Deno.writeFile(resolve(directory, "task-runtime"), unstartable);
        await Deno.chmod(resolve(directory, "task-runtime"), 0o755);
        await Deno.writeTextFile(
          resolve(directory, "manifest.json"),
          JSON.stringify(failedManifest),
        );
      }
      const callsBeforeRebuild = await Deno.readTextFile(invocationLog);
      const rebuilt = await prepare();
      assertEquals(rebuilt.code, 0, rebuilt.stderr);
      assertStringIncludes(
        (await Deno.readTextFile(invocationLog)).slice(
          callsBeforeRebuild.length,
        ),
        "compile -A",
      );
      const rebuiltRuntime =
        parseGitHubOutputs(await Deno.readTextFile(output))["runtime-path"];
      assert(rebuiltRuntime !== runtime);
      assertEquals(await Deno.readFile(runtime), unstartable);
      const rebuiltTask = await run(
        rebuiltRuntime,
        ["workflows/ci.yml/test/task-1"],
        fixture,
        environment,
      );
      assertEquals(rebuiltTask.code, 0, rebuiltTask.stderr);
      const existingDeno = await Deno.readTextFile(resolve(tools, "deno"));
      await Deno.remove(resolve(tools, "deno"));
      const afterRecovery = await prepare({
        DENO_DIR: resolve(fixture, "offline-after-recovery"),
      });
      assertEquals(afterRecovery.code, 0, afterRecovery.stderr);
      assertStringIncludes(afterRecovery.stdout, "cache hit");
      const afterRecoveryRuntime =
        parseGitHubOutputs(await Deno.readTextFile(output))["runtime-path"];
      assert(afterRecoveryRuntime !== runtime);
      const afterRecoveryTask = await run(
        afterRecoveryRuntime,
        ["workflows/ci.yml/test/task-1"],
        fixture,
        environment,
      );
      assertEquals(afterRecoveryTask.code, 0, afterRecoveryTask.stderr);
      await Deno.writeTextFile(resolve(tools, "deno"), existingDeno);
      await Deno.chmod(resolve(tools, "deno"), 0o755);
      // Exercise the exact download/extract bridge without contacting GitHub.
      const archive = resolve(fixture, "deno.zip");
      await Deno.writeFile(
        archive,
        Uint8Array.from(
          atob(
            "UEsDBBQAAAAAAEloRl0AFTl7XgAAAF4AAAAEAAAAZGVubyMhL2Jpbi9iYXNoCnByaW50ZiAnJXN8JXNcbicgIiRUU1VHSU9SSV9ERU5PIiAiJCoiID4+ICIkREVOT19DQUxMX0xPRyIKZXhlYyAiJFRFU1RfREVOTyIgIiRAIgpQSwECFAMUAAAAAABJaEZdABU5e14AAABeAAAABAAAAAAAAAAAAAAAgAEAAAAAZGVub1BLBQYAAAAAAQABADIAAACAAAAAAAA=",
          ),
          (c) => c.charCodeAt(0),
        ),
      );
      const downloads = resolve(fixture, "downloads");
      await Deno.writeTextFile(
        resolve(tools, "curl"),
        `#!/bin/bash
printf '%s\\n' "$*" >> "$DOWNLOAD_LOG"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then /bin/cp "$DENO_ZIP" "$2"; exit 0; fi
  shift
done
exit 1
`,
      );
      await Deno.chmod(resolve(tools, "curl"), 0o755);
      await Deno.symlink("/usr/bin/unzip", resolve(tools, "unzip"));
      {
        await Deno.remove(resolve(fixture, "test-cache/tsugiori/cache"), {
          recursive: true,
        });
        await Deno.remove(delivery, { recursive: true });
        const beforeOld = await Deno.readTextFile(invocationLog);
        const old = await prepare({ TEST_OLD_VERSION: "1" });
        assertEquals(old.code, 1);
        assertStringIncludes(old.stderr, "requires Deno >= 2.6.0; found 2.5.0");
        const oldCalls = (await Deno.readTextFile(invocationLog)).slice(
          beforeOld.length,
        );
        assertStringIncludes(oldCalls, "run --frozen=true");
        assert(!oldCalls.includes("--version"));
        await assertRejects(() => Deno.stat(downloads), Deno.errors.NotFound);
        await Deno.remove(resolve(tools, "deno"));
        const downloaded = await prepare({
          TEST_DENO: Deno.execPath(),
          DENO_ZIP: archive,
          DOWNLOAD_LOG: downloads,
          DENO_CALL_LOG: invocationLog,
        });
        assertEquals(downloaded.code, 0, downloaded.stderr);
        const selectedCalls = (await Deno.readTextFile(invocationLog)).split(
          "\n",
        ).filter((line) => line.includes("|"));
        for (
          const call of selectedCalls.filter((line) =>
            /[|](run|info|compile) /.test(line)
          )
        ) {
          assertStringIncludes(call.split("|")[0], "/tsugiori-deno.");
        }
        assertStringIncludes(
          await Deno.readTextFile(downloads),
          `https://github.com/denoland/deno/releases/download/v${step.env.TSUGIORI_INSTALL_DENO_VERSION}/deno-${Deno.build.target}.zip`,
        );
        for await (const entry of Deno.readDir(fixture)) {
          assert(!entry.name.startsWith("tsugiori-deno."));
        }
        assertEquals(environment.PATH, tools);
      }
      // Drift is terminal even offline: no fallback tool or task output is produced.
      await Deno.remove(resolve(fixture, "task-result.txt"));
      const callsBeforeDrift = await Deno.readTextFile(invocationLog);
      const downloadsBeforeDrift = await Deno.readTextFile(downloads);
      const binaryBeforeDrift = await Deno.readFile(
        resolve(delivery, "task-runtime"),
      );
      await Deno.writeTextFile(
        resolve(fixture, "dependency.ts"),
        'export const marker = "changed";\n',
      );
      const stale = await run(
        Deno.execPath(),
        ["task", "tsugiori", "generate", "--check"],
        fixture,
        environment,
      );
      assertEquals(stale.code, 1);
      assertStringIncludes(stale.stderr, "changed: workflows/ci.yml");
      const changed = await prepare(offline);
      assertEquals(changed.code, 1, changed.stderr);
      assertStringIncludes(changed.stderr, "Regenerate and commit");
      assertEquals(await Deno.readTextFile(output), "");
      assertEquals(await Deno.readTextFile(invocationLog), callsBeforeDrift);
      assertEquals(await Deno.readTextFile(downloads), downloadsBeforeDrift);
      assertEquals(
        await Deno.readFile(resolve(delivery, "task-runtime")),
        binaryBeforeDrift,
      );
      await assertRejects(
        () => Deno.stat(resolve(fixture, "task-result.txt")),
        Deno.errors.NotFound,
      );
      await Deno.remove(resolve(fixture, "dependency.ts"));
      const missing = await prepare(offline);
      assertEquals(missing.code, 1);
      assertStringIncludes(missing.stderr, "source changed or is missing");
      assertEquals(await Deno.readTextFile(output), "");
      assertEquals(await Deno.readTextFile(invocationLog), callsBeforeDrift);
      assertEquals(await Deno.readTextFile(downloads), downloadsBeforeDrift);
      // A miss and startup failure also stop on the computed key before compile/publication.
      await Deno.symlink(Deno.execPath(), resolve(tools, "deno"));
      await Deno.writeTextFile(
        resolve(fixture, "dependency.ts"),
        'export const marker = "changed";\n',
      );
      const shaForDriftStartup = await sha256Bytes(
        new TextEncoder().encode("#!/bin/bash\nexit 8\n"),
      );
      const runtimesBefore = [];
      for await (
        const entry of Deno.readDir(
          resolve(fixture, "test-cache/tsugiori/runtimes"),
        )
      ) runtimesBefore.push(entry.name);
      for (const damage of ["miss", "startup"]) {
        await removeIfPresent(delivery);
        if (damage === "startup") {
          await Deno.mkdir(delivery);
          await Deno.writeTextFile(
            resolve(delivery, "task-runtime"),
            "#!/bin/bash\nexit 8\n",
          );
          await Deno.chmod(resolve(delivery, "task-runtime"), 0o755);
        }
        const drift = await prepare();
        assertEquals(drift.code, 1, drift.stderr);
        assertStringIncludes(drift.stderr, "source key is stale");
        assertEquals(await Deno.readTextFile(output), "");
        await assertRejects(
          () => Deno.stat(resolve(delivery, "manifest.json")),
          Deno.errors.NotFound,
        );
      }
      const runtimesAfter = [];
      for await (
        const entry of Deno.readDir(
          resolve(fixture, "test-cache/tsugiori/runtimes"),
        )
      ) runtimesAfter.push(entry.name);
      assertEquals(runtimesAfter.sort(), runtimesBefore.sort());
      await assertRejects(
        () =>
          Deno.stat(
            resolve(
              fixture,
              "test-cache/tsugiori/runtimes/.rejected",
              key,
              shaForDriftStartup,
            ),
          ),
        Deno.errors.NotFound,
      );
      await assertRejects(
        () => Deno.stat(resolve(fixture, "task-result.txt")),
        Deno.errors.NotFound,
      );
      // Removing the last task is drift too, before registry validation.
      const authored = await Deno.readTextFile(
        resolve(fixture, "workflows.ts"),
      );
      await Deno.writeTextFile(
        resolve(fixture, "workflows.ts"),
        `
import { defineProject, defineWorkflow, runProject } from "./src/github_actions.ts";
const project = defineProject({ localTaskPrepareAction: "./.github/actions/task-prepare", workflows: [
  defineWorkflow("workflows/ci.yml", { on: { push: {} } }).job("test", ({ job }) =>
    job.runsOn("ubuntu-latest").run({ name: "Native", run: "true" }))] });
export default project;
if (import.meta.main) Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });
`,
      );
      await removeIfPresent(delivery);
      const removedTasks = await prepare();
      assertEquals(removedTasks.code, 1, removedTasks.stderr);
      assertStringIncludes(removedTasks.stderr, "source key is stale");
      assertEquals(await Deno.readTextFile(output), "");
      await assertRejects(() => Deno.stat(delivery), Deno.errors.NotFound);
      await Deno.writeTextFile(resolve(fixture, "workflows.ts"), authored);
      const records = [];
      for await (
        const entry of Deno.readDir(
          resolve(fixture, "test-cache/tsugiori/diagnostics"),
        )
      ) {
        records.push(
          JSON.parse(
            await Deno.readTextFile(
              resolve(fixture, "test-cache/tsugiori/diagnostics", entry.name),
            ),
          ),
        );
      }
      assert(
        records.some((record) =>
          record.operations.some((op: { errorType?: string }) =>
            op.errorType === "source_drift"
          )
        ),
      );
      const driftRecords = records.filter((record) =>
        record.operations.some((op: { errorType?: string }) =>
          op.errorType === "source_drift"
        )
      );
      assert(driftRecords.length >= 4);
      assert(
        driftRecords.every((record) =>
          !record.operations.some((op: { name: string }) =>
            ["artifact.build", "artifact.materialize", "cache.store"].includes(
              op.name,
            )
          )
        ),
      );
      assert(
        records.every((record) =>
          !JSON.stringify(record).includes("task-failure-private")
        ),
      );
      // Failed acquisition is terminal and leaves the application binary alone.
      const appBinary = await Deno.readLink(resolve(tools, "deno"));
      await Deno.remove(resolve(tools, "deno"));
      await removeIfPresent(delivery);
      await Deno.writeTextFile(
        resolve(tools, "curl"),
        "#!/bin/bash\nexit 22\n",
      );
      await Deno.chmod(resolve(tools, "curl"), 0o755);
      const failedDownload = await prepare();
      assertEquals(failedDownload.code, 1);
      assertStringIncludes(
        failedDownload.stderr,
        "Failed to download Tsugiori's fallback Deno",
      );
      assertEquals((await Deno.stat(appBinary)).isFile, true);
      for await (const entry of Deno.readDir(fixture)) {
        assert(!entry.name.startsWith("tsugiori-deno."));
      }
    } finally {
      await Deno.remove(fixture, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "artifact key tracks project-external local source and explicit cache version",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const repositoryRoot = Deno.cwd();
    const fixture = await Deno.makeTempDir({ prefix: "tsugiori-key-" });
    const external = await Deno.makeTempDir({ prefix: "tsugiori-external-" });
    let remoteSource = 'export const remoteMarker = "first";\n';
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen: () => {} },
      async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/dependency.ts") {
          return new Response(remoteSource, {
            headers: { "content-type": "application/typescript" },
          });
        }
        if (pathname !== "/deno.json" && !pathname.startsWith("/src/")) {
          return new Response("Not found", { status: 404 });
        }
        return new Response(
          await Deno.readFile(resolve(repositoryRoot, `.${pathname}`)),
          {
            headers: {
              "content-type": pathname.endsWith(".json")
                ? "application/json"
                : "application/typescript",
            },
          },
        );
      },
    );
    try {
      const rootModule =
        `http://127.0.0.1:${server.addr.port}/src/github_actions.ts`;
      const externalModule = resolve(external, "dependency.ts");
      const externalUrl = pathToFileURL(externalModule).href;
      const remoteUrl = `http://127.0.0.1:${server.addr.port}/dependency.ts`;
      await Deno.writeTextFile(
        resolve(fixture, "deno.json"),
        `${
          JSON.stringify(
            {
              lock: false,
              imports: {
                "@atty303/tsugiori/github-actions": rootModule,
              },
            },
            null,
            2,
          )
        }\n`,
      );
      await Deno.writeTextFile(
        externalModule,
        'export const cacheVersion = 1;\nexport const externalMarker = "first";\n',
      );
      const entrypointSource =
        `import { defineProject, defineWorkflow, runProject } from "@atty303/tsugiori/github-actions";
import { cacheVersion, externalMarker } from ${JSON.stringify(externalUrl)};
import { remoteMarker } from ${JSON.stringify(remoteUrl)};
void externalMarker;
void remoteMarker;
const ci = defineWorkflow("workflows/ci.yml", {
  on: { push: {  } },
}).job("test", ({ job }) =>
  job.runsOn("ubuntu-latest").task({ name: "Test", inputs: {}, outputs: {}, run: () => {} })
);
const project = defineProject({ localTaskPrepareAction: "./.github/actions/task-prepare", cacheVersion, workflows: [ci] });
export default project;
if (import.meta.main) Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });
`;
      await Deno.writeTextFile(
        resolve(fixture, "workflows.ts"),
        entrypointSource,
      );

      const firstDenoDirectory = resolve(fixture, "deno-cache-first");
      const secondDenoDirectory = resolve(fixture, "deno-cache-second");
      const baseline = await resolveSourceArtifactKey(
        fixture,
        firstDenoDirectory,
      );

      remoteSource = 'export const remoteMarker = "second";\n';
      const remoteChanged = await resolveSourceArtifactKey(
        fixture,
        secondDenoDirectory,
      );
      assertEquals(remoteChanged, baseline);

      await Deno.writeTextFile(
        externalModule,
        'export const cacheVersion = 1;\nexport const externalMarker = "second";\n',
      );
      const externalChanged = await resolveSourceArtifactKey(
        fixture,
        secondDenoDirectory,
      );
      assert(externalChanged !== baseline);

      await Deno.writeTextFile(
        externalModule,
        'export const cacheVersion = 2;\nexport const externalMarker = "second";\n',
      );
      const cacheVersionChanged = await resolveSourceArtifactKey(
        fixture,
        secondDenoDirectory,
      );
      assert(cacheVersionChanged !== baseline);

      await Deno.writeTextFile(
        externalModule,
        'export const cacheVersion = 1;\nexport const externalMarker = "second";\n',
      );
      await Deno.writeTextFile(
        resolve(fixture, "workflows.ts"),
        `${entrypointSource}\n// repository-local source edit\n`,
      );
      const localSourceChanged = await resolveSourceArtifactKey(
        fixture,
        secondDenoDirectory,
      );
      assert(localSourceChanged !== baseline);

      await Deno.writeTextFile(
        resolve(fixture, "workflows.ts"),
        entrypointSource,
      );
      const targetChanged = await resolveSourceArtifactKey(
        fixture,
        secondDenoDirectory,
        Deno.build.target === "x86_64-unknown-linux-gnu"
          ? "aarch64-apple-darwin"
          : "x86_64-unknown-linux-gnu",
      );
      assertEquals(targetChanged, externalChanged);
    } finally {
      await server.shutdown();
      await Deno.remove(fixture, { recursive: true });
      await Deno.remove(external, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "nested workflow project resolves one package for generation and artifact preparation",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const repositoryRoot = Deno.cwd();
    const fixture = await Deno.makeTempDir({ prefix: "tsugiori-nested-" });
    const project = resolve(fixture, "ci/workflows");
    try {
      await copyDirectory(
        resolve(repositoryRoot, "src"),
        resolve(fixture, "src"),
      );
      const rootConfig = JSON.parse(
        await Deno.readTextFile(resolve(repositoryRoot, "deno.json")),
      ) as Record<string, unknown>;
      rootConfig.workspace = ["ci/workflows"];
      await Deno.writeTextFile(
        resolve(fixture, "deno.json"),
        JSON.stringify(rootConfig),
      );
      await Deno.copyFile(
        resolve(repositoryRoot, "deno.lock"),
        resolve(fixture, "deno.lock"),
      );
      await Deno.mkdir(project, { recursive: true });
      await Deno.writeTextFile(
        resolve(project, "deno.json"),
        JSON.stringify({
          imports: {
            "@atty303/tsugiori": "workspace:*",
            "consumer-only": "./consumer-only.ts",
          },
          tasks: {
            tsugiori: "deno run --frozen=true -A ./workflows.ts",
          },
        }),
      );
      await Deno.writeTextFile(
        resolve(project, "consumer-only.ts"),
        "export const consumerMarker = true;\n",
      );
      await Deno.writeTextFile(
        resolve(project, "workflows.ts"),
        `import { consumerMarker } from "consumer-only";
void consumerMarker;
import { defineProject, defineWorkflow, runProject } from "@atty303/tsugiori/github-actions";
const project = defineProject({ localTaskPrepareAction: "./.github/actions/task-prepare", workingDirectory: "ci/workflows", workflows: [defineWorkflow("workflows/ci.yml", { on: { push: {  } },
}).job("test", ({ job }) => job.runsOn("ubuntu-latest").task({
  name: "Test", inputs: {}, outputs: {}, run: () => {},
}))] });
export default project;
if (import.meta.main) Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });\n`,
      );
      const environment = {
        ...Deno.env.toObject(),
        XDG_CACHE_HOME: resolve(fixture, "test-cache"),
      };
      const generated = await run(
        Deno.execPath(),
        ["task", "tsugiori", "generate"],
        project,
        environment,
      );
      assertEquals(generated.code, 0, generated.stderr);
      const checked = await run(
        Deno.execPath(),
        ["task", "tsugiori", "generate", "--check"],
        project,
        environment,
      );
      assertEquals(checked.code, 0, checked.stderr);
      const workflow = await Deno.readTextFile(
        resolve(project, "workflows/ci.yml"),
      );
      assertStringIncludes(workflow, "project-directory: ci/workflows");
      assertStringIncludes(workflow, "./workflows.ts");
      const githubOutput = resolve(fixture, "github-output");
      await Deno.writeTextFile(githubOutput, "");
      const artifactKey = await resolveSourceArtifactKey(
        project,
        resolve(fixture, "deno-cache"),
      );
      await Deno.writeTextFile(githubOutput, "");
      const prepared = await run(
        Deno.execPath(),
        [
          "run",
          "--frozen=true",
          "-A",
          "./workflows.ts",
          "github-actions",
          "task",
          "prepare",
          "--expected-key",
          artifactKey,
        ],
        project,
        { ...environment, GITHUB_OUTPUT: githubOutput },
      );
      assertEquals(prepared.code, 0, prepared.stderr);
      assertEquals(
        (await Deno.stat(
          parseGitHubOutputs(
            await Deno.readTextFile(githubOutput),
          )["runtime-path"],
        )).isFile,
        true,
      );
    } finally {
      await Deno.remove(fixture, { recursive: true });
    }
  },
});

Deno.test("local graph keys remain portable when the project and outside imports move together", async () => {
  const original = await Deno.makeTempDir({ prefix: "tsugiori-portable-" });
  const moved = `${original}-moved`;
  const project = resolve(original, "project");
  try {
    await Deno.mkdir(project);
    await copyDirectory(resolve(Deno.cwd(), "src"), resolve(project, "src"));
    const denoConfig = JSON.parse(await Deno.readTextFile("deno.json"));
    delete denoConfig.workspace;
    await Deno.writeTextFile(
      resolve(project, "deno.json"),
      JSON.stringify(denoConfig),
    );
    await Deno.copyFile("deno.lock", resolve(project, "deno.lock"));
    await Deno.writeTextFile(
      resolve(original, "outside.ts"),
      'export const marker = "first";\n',
    );
    await Deno.writeTextFile(
      resolve(project, "definition.ts"),
      `
import { marker } from "../outside.ts";
import { defineProject, defineWorkflow } from "./src/github_actions.ts";
void marker;
export default defineProject({ localTaskPrepareAction: "./.github/actions/task-prepare", workflows: [defineWorkflow("workflows/ci.yml", { on: { push: {} } })
  .job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Test", inputs: {}, outputs: {}, run: () => {} }))] });
`,
    );
    await Deno.writeTextFile(
      resolve(project, "workflows.ts"),
      `
import project from "./definition.ts";
import { runProject } from "./src/github_actions.ts";
export default project;
if (import.meta.main) Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });
`,
    );
    const generated = await run(
      Deno.execPath(),
      ["run", "--frozen=true", "-A", "./workflows.ts", "generate"],
      project,
      { ...Deno.env.toObject(), DENO_DIR: resolve(original, "deno-cache") },
    );
    assertEquals(generated.code, 0, generated.stderr);
    const yaml = await Deno.readTextFile(resolve(project, "workflows/ci.yml"));
    assert(yaml.startsWith("# Generated by Tsugiori from workflows.ts\n"));
    assertStringIncludes(yaml, "entrypoint: ./workflows.ts");
    assert(!yaml.includes("definition.ts"));
    const baseline = await resolveSourceArtifactKey(
      project,
      resolve(original, "deno-cache"),
    );
    await Deno.rename(original, moved);
    assertEquals(
      await resolveSourceArtifactKey(
        resolve(moved, "project"),
        resolve(moved, "deno-cache"),
      ),
      baseline,
    );
    await Deno.writeTextFile(
      resolve(moved, "outside.ts"),
      'export const marker = "second";\n',
    );
    assert(
      await resolveSourceArtifactKey(
        resolve(moved, "project"),
        resolve(moved, "deno-cache"),
      ) !== baseline,
    );
  } finally {
    await removeIfPresent(original);
    await removeIfPresent(moved);
  }
});

async function resolveSourceArtifactKey(
  fixture: string,
  _denoDirectory: string,
  _target?: string,
): Promise<string> {
  // Import the consumer so cacheVersion comes from the actual project value.
  const result = await run(
    Deno.execPath(),
    ["run", "--frozen=true", "-A", "./workflows.ts", "generate"],
    fixture,
    {
      ...Deno.env.toObject(),
      DENO_DIR: _denoDirectory,
    },
  );
  assertEquals(result.code, 0, result.stderr);
  const yaml = await Deno.readTextFile(resolve(fixture, "workflows/ci.yml"));
  const key = yaml.match(/tsugiori-task-(S[0-9A-Z]{50})/)?.[1];
  assert(key !== undefined);
  return key;
}

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

function parseGitHubOutputs(content: string): Readonly<Record<string, string>> {
  return Object.fromEntries(
    content.trim().split("\n").filter((line) => line.length > 0).map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
  );
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
