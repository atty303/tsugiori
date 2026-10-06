import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { archive, digest, unarchive } from "./archive.ts";
import { releaseSource, verifyContent, withSource } from "./package.ts";
import { publishRelease } from "./publish.ts";
import { Recording } from "./diagnostics.ts";

const encode = (value: string) => new TextEncoder().encode(value);
function source() {
  return new Map([
    [
      "deno.json",
      encode(
        JSON.stringify({
          name: "@atty303/tsugiori",
          version: "0.1.0",
          license: "MIT",
          exports: { "./github-actions": "./mod.ts" },
          publish: {
            include: ["deno.json", "mod.ts", "src/package_identity.ts"],
          },
        }),
      ),
    ],
    [
      "src/package_identity.ts",
      encode(
        `export const TSUGIORI_RELEASE_COMMIT: string | undefined = "${
          "a".repeat(40)
        }";\n`,
      ),
    ],
    ["mod.ts", encode("export const answer = 42;\n")],
  ]);
}
Deno.test("source archive is deterministic and rejects corruption/traversal", () => {
  const files = source();
  const packed = archive(files);
  assertEquals(packed, archive(new Map([...files].reverse())));
  assertEquals(unarchive(packed), files);
  assertThrows(() => archive(new Map([["../escape", encode("x")]])));
  assertThrows(() => unarchive(packed.subarray(0, packed.length - 8)));
  assertThrows(() => unarchive(new Uint8Array([1, 2, 3])));
});
Deno.test("registry comparison requires every byte, file and export to agree", async () => {
  const files = source();
  const manifest = Object.fromEntries(
    await Promise.all(
      [...files].map(async (
        [path, bytes],
      ) => [`/${path}`, { size: bytes.length, checksum: await digest(bytes) }]),
    ),
  );
  const remote = { manifest, exports: { "./github-actions": "./mod.ts" } };
  await verifyContent(files, remote, "0.1.0");
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      exports: { "./github-actions": "./else.ts" },
    }, "0.1.0")
  );
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      manifest: { ...manifest, "/extra": { size: 0, checksum: "" } },
    }, "0.1.0")
  );
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      manifest: {
        ...manifest,
        "/mod.ts": { ...manifest["/mod.ts"], checksum: "sha256-different" },
      },
    }, "0.1.0")
  );
  await assertRejects(() => verifyContent(files, remote, "0.1.1"));
});

Deno.test("release publication verifies JSR before deployment, propagates failure and retries the same source", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "tsugiori-publish-test-",
  });
  const original = globalThis.fetch;
  try {
    const files = source();
    await Deno.writeFile(`${directory}/tsugiori-0.1.0.tar.gz`, archive(files));
    const manifest = Object.fromEntries(
      await Promise.all([...files].map(
        async (
          [path, bytes],
        ) => [`/${path}`, {
          size: bytes.length,
          checksum: await digest(bytes),
        }],
      )),
    );
    let mismatch = false;
    let registryReads = 0;
    let deployments = 0;
    globalThis.fetch = (input) => {
      assertEquals(
        String(input),
        "https://jsr.io/@atty303/tsugiori/0.1.0_meta.json",
      );
      registryReads++;
      return Promise.resolve(Response.json({
        manifest: mismatch ? {} : manifest,
        exports: { "./github-actions": "./mod.ts" },
      }));
    };
    const record = new Recording(`${directory}/diagnostics`);
    await assertRejects(
      () =>
        publishRelease("0.1.0", directory, record, (artifact) => {
          assertEquals(artifact, "dist/type-service/worker.js");
          assertEquals(registryReads, 1);
          deployments++;
          return Promise.reject(new Error("upload failed"));
        }),
      Error,
      "upload failed",
    );
    await publishRelease("0.1.0", directory, record, () => {
      assertEquals(registryReads, 2);
      deployments++;
      return Promise.resolve();
    });
    assertEquals(deployments, 2);
    mismatch = true;
    await assertRejects(
      () =>
        publishRelease("0.1.0", directory, record, () => {
          deployments++;
          return Promise.resolve();
        }),
      Error,
      "Published file set",
    );
    assertEquals(deployments, 2);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("release archive binds generation to its committed Action and rejects dirty or unrelated checkout identity", async () => {
  const workflowEnvironment = {
    GITHUB_ACTIONS: Deno.env.get("GITHUB_ACTIONS"),
    GITHUB_SHA: Deno.env.get("GITHUB_SHA"),
  };
  const cwd = await Deno.makeTempDir({ prefix: "tsugiori-release-source-" });
  const git = async (args: string[]) => {
    const result = await new Deno.Command("git", {
      args,
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
    return new TextDecoder().decode(result.stdout).trim();
  };
  const copy = async (source: string, destination: string) => {
    await Deno.mkdir(destination, { recursive: true });
    for await (const entry of Deno.readDir(source)) {
      if (entry.isDirectory) {
        await copy(`${source}/${entry.name}`, `${destination}/${entry.name}`);
      } else if (entry.isFile) {
        await Deno.copyFile(
          `${source}/${entry.name}`,
          `${destination}/${entry.name}`,
        );
      }
    }
  };
  try {
    await copy("src", `${cwd}/src`);
    await copy("actions", `${cwd}/actions`);
    for (const file of ["README.md", "deno.json", "mise.toml", "mise.lock"]) {
      await Deno.copyFile(file, `${cwd}/${file}`);
    }
    await git(["init", "-q"]);
    await git(["add", "."]);
    await git([
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    ]);
    const sha = await git(["rev-parse", "HEAD"]);
    Deno.env.set("GITHUB_ACTIONS", "true");
    Deno.env.set("GITHUB_SHA", "0".repeat(40));
    await assertRejects(
      () => releaseSource("0.2.0", cwd),
      Error,
      "differs from the workflow commit",
    );
    Deno.env.set("GITHUB_SHA", sha);
    const files = await releaseSource("0.2.0", cwd);
    await withSource(files, async (directory) => {
      const exported =
        JSON.parse(new TextDecoder().decode(files.get("deno.json"))).exports;
      assertEquals(exported["./init"], "./src/init.ts");
      const consumer = `${cwd}/consumer/.github`;
      await Deno.mkdir(consumer, { recursive: true });
      const run = async (args: string[]) => {
        const result = await new Deno.Command(Deno.execPath(), {
          cwd: consumer,
          args,
          env: { XDG_CACHE_HOME: `${cwd}/cache`, TSUGIORI_DIAGNOSTICS: "0" },
          stdout: "piped",
          stderr: "piped",
        }).output();
        assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
      };
      await run([
        "run",
        "--no-config",
        "--no-lock",
        "-A",
        `${directory}${exported["./init"].slice(1)}`,
      ]);
      const configuration = JSON.parse(
        await Deno.readTextFile(`${consumer}/deno.json`),
      );
      assertEquals(
        configuration.imports["@atty303/tsugiori"],
        "jsr:@atty303/tsugiori@^0.2.0",
      );
      assertEquals(
        (await Array.fromAsync(Deno.readDir(consumer))).map(({ name }) => name)
          .sort(),
        ["deno.json", "workflows.ts"],
      );
      // Resolve the unpublished release through its actual archived exports.
      configuration.imports = Object.fromEntries(
        Object.entries(exported).map(([name, path]) => [
          `@atty303/tsugiori/${name.slice(2)}`,
          new URL(path as string, `file://${directory}/`).href,
        ]),
      );
      await Deno.writeTextFile(
        `${consumer}/deno.json`,
        JSON.stringify(configuration),
      );
      await run(["install", "-P"]);
      await Deno.stat(`${consumer}/deno.lock`);
      await run(["task", "tsugiori", "generate"]);
      await run(["task", "tsugiori", "generate", "--check"]);
      const yaml = await Deno.readTextFile(
        `${consumer}/workflows/tsugiori.yml`,
      );
      assertEquals(yaml.includes("workflow_dispatch:"), true);
      assertEquals(yaml.includes("project-directory: .github"), true);
      assertEquals(
        yaml.includes(`uses: atty303/tsugiori/actions/task-prepare@${sha}`),
        true,
      );
      await run(["task", "tsugiori", "workflows/tsugiori.yml/hello/task-1"]);
      const { generateFiles }:
        typeof import("../../src/compiler/generator.ts") = await import(
          `file://${directory}/src/compiler/generator.ts`
        );
      const { defineProject, defineWorkflow }:
        typeof import("../../src/github_actions/mod.ts") = await import(
          `file://${directory}/src/github_actions/mod.ts`
        );
      const workflow = defineWorkflow("ci.yml", { on: { push: {} } }).job(
        "test",
        ({ job }) =>
          job.runsOn("ubuntu-latest").task({
            name: "Test",
            inputs: {},
            outputs: {},
            run: () => {},
          }),
      );
      const generated = await generateFiles(
        defineProject({ workflows: [workflow] }),
        "./workflows.ts",
        "source",
      );
      assertEquals(
        (typeof generated[0].content === "string"
          ? generated[0].content
          : new TextDecoder().decode(generated[0].content)).includes(
            `uses: atty303/tsugiori/actions/task-prepare@${sha}`,
          ),
        true,
      );
    });
    await Deno.writeTextFile(
      `${cwd}/actions/task-prepare/prepare.sh`,
      "changed",
    );
    await assertRejects(
      () => releaseSource("0.2.0", cwd),
      Error,
      "committed checkout",
    );
    await git(["checkout", "--", "actions/task-prepare/prepare.sh"]);
    await Deno.writeTextFile(`${cwd}/src/untracked.ts`, "changed");
    await assertRejects(
      () => releaseSource("0.2.0", cwd),
      Error,
      "committed checkout",
    );
  } finally {
    for (const [name, value] of Object.entries(workflowEnvironment)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
    await Deno.remove(cwd, { recursive: true });
  }
});
