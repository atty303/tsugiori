import { assert, assertEquals } from "@std/assert";
import { cp } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  configuration as initConfiguration,
  workflows as initWorkflows,
} from "../src/init/templates.ts";

const root = new URL("../", import.meta.url);
const published = Deno.args.includes("--published");

async function withChapter<T>(
  chapter: string,
  check: (directory: string) => Promise<T>,
): Promise<T> {
  const original = new URL(`examples/${chapter}/.github/`, root).pathname;
  const fixture = await Deno.makeTempDir({ prefix: `tsugiori-${chapter}-` });
  try {
    const directory = `${fixture}/.github`;
    await cp(original, directory, { recursive: true });
    if (published) return await check(directory);
    const packageConfig = JSON.parse(
      await Deno.readTextFile(new URL("deno.json", root)),
    );
    const configPath = `${directory}/deno.json`;
    const config = JSON.parse(await Deno.readTextFile(configPath));
    for (const [name, path] of Object.entries(packageConfig.exports)) {
      config.imports[`${packageConfig.name}/${name.slice(2)}`] =
        new URL(path as string, root).href;
    }
    // Supply the documented checkout preparation prerequisite only in the harness.
    const api = new URL("src/github_actions.ts", root).href;
    await Deno.writeTextFile(
      `${directory}/local_api.ts`,
      `export * from ${JSON.stringify(api)};
import { project as nativeProject } from ${JSON.stringify(api)};
export const project: typeof nativeProject = (options) =>
  nativeProject({ ...options, localTaskPrepareAction: "./actions/task-prepare" });
`,
    );
    config.imports[`${packageConfig.name}/github-actions`] =
      pathToFileURL(`${directory}/local_api.ts`).href;
    await Deno.writeTextFile(
      configPath,
      JSON.stringify(config, null, 2) + "\n",
    );
    await cp(
      new URL("actions/task-prepare/", root).pathname,
      `${fixture}/actions/task-prepare`,
      { recursive: true },
    );
    return await check(directory);
  } finally {
    await Deno.remove(fixture, { recursive: true });
  }
}
const chapters = [
  "01-init",
  "02-typed-dsl",
  "03-actions-add",
  "04-task",
  "05-typed-io",
  "06-testing",
  "07-local-action",
] as const;
const snippetSources = [
  "examples/01-init/.github/workflows.ts",
  "examples/02-typed-dsl/.github/workflows/src/ci.ts",
  "examples/03-actions-add/.github/workflows/src/ci.ts",
  "examples/04-task/.github/workflows/src/ci.ts",
  "examples/05-typed-io/.github/workflows/src/ci.ts",
  "examples/06-testing/.github/workflows/src/ci_test.ts",
  "examples/06-testing/.github/workflows/src/ci_test.ts",
] as const;

function lines(text: string): string {
  return text.trim().split("\n").map((line) => line.trim()).join("\n");
}

async function run(directory: string, args: string[]): Promise<void> {
  const result = await new Deno.Command(Deno.execPath(), {
    cwd: directory,
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(
    result.code,
    0,
    `${args.join(" ")} in ${directory}: ${
      new TextDecoder().decode(result.stderr)
    }`,
  );
}

Deno.test("README TypeScript blocks are checked chapter source", async () => {
  const readme = await Deno.readTextFile(new URL("README.md", root));
  const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)];
  assertEquals(blocks.length, 8);
  const sourceBlockIndexes = [0, 1, 3, 4, 5, 6, 7];
  for (const [index, sourcePath] of snippetSources.entries()) {
    const source = await Deno.readTextFile(
      new URL(sourcePath, root),
    );
    assert(
      lines(source).includes(lines(blocks[sourceBlockIndexes[index]][1])),
      sourcePath,
    );
  }
});

Deno.test("README invalid output reference reports its documented type error", async () => {
  const readme = await Deno.readTextFile(new URL("README.md", root));
  const match = readme.match(
    /```ts\n(env: \(\{ needs \}\) => \(\{ MESSAGE: needs\.hello\.outputs\.greeting \}\),)\n```\n\n```text\n([^`]+)```/,
  );
  assert(match);
  await withChapter("02-typed-dsl", async (projectDirectory) => {
    const directory = `${projectDirectory}/workflows/src/`;
    const file = await Deno.makeTempFile({ dir: directory, suffix: ".ts" });
    try {
      const source = await Deno.readTextFile(`${directory}/ci.ts`);
      const validLine =
        "env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.message }),";
      assert(source.includes(validLine));
      await Deno.writeTextFile(file, source.replace(validLine, match[1]));
      const result = await new Deno.Command(Deno.execPath(), {
        cwd: projectDirectory,
        args: ["check", ...(published ? ["--frozen=true"] : []), file],
        env: { NO_COLOR: "1" },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assert(
        result.code !== 0,
        "the invalid README snippet must fail checking",
      );
      const diagnostic = new TextDecoder().decode(result.stderr);
      assert(
        diagnostic.includes(match[2].trim()),
        `README diagnostic differs from deno check:\n${diagnostic}`,
      );
    } finally {
      await Deno.remove(file);
    }
  });
});

Deno.test("chapter 01 matches init and every chapter uses the managed Deno and range", async () => {
  const rootMise = await Deno.readTextFile(new URL("mise.toml", root));
  const denoVersion = rootMise.match(/^deno = "[^"]+"$/m)?.[0];
  assert(denoVersion);
  const expected = JSON.parse(initConfiguration);
  expected.imports["@atty303/tsugiori"] = "jsr:@atty303/tsugiori@^0.12.0";
  const initSource = await Deno.readTextFile(
    new URL("examples/01-init/.github/workflows.ts", root),
  );
  assertEquals(initSource, initWorkflows);
  for (const chapter of chapters) {
    const project = `examples/${chapter}/`;
    assertEquals(
      await Deno.readTextFile(new URL(`${project}.github/mise.toml`, root)),
      `[tools]\n${denoVersion}\n`,
    );
    const config = JSON.parse(
      await Deno.readTextFile(new URL(`${project}.github/deno.json`, root)),
    );
    if (chapter === "01-init") assertEquals(config, expected);
    else {
      assertEquals(
        config.imports["@atty303/tsugiori"],
        "jsr:@atty303/tsugiori@^0.12.0",
      );
    }
  }
});

Deno.test(
  published
    ? "published examples typecheck and committed generated files are current"
    : "checkout examples typecheck, generate and run scenarios before publication",
  async () => {
    for (const chapter of chapters) {
      await withChapter(chapter, async (directory) => {
        await run(directory, [
          "check",
          ...(published ? ["--frozen=true"] : []),
          "--allow-import=jsr.io:443,tsugiori.atty303.workers.dev:443",
          "workflows.ts",
        ]);
        if (!published) await run(directory, ["task", "tsugiori", "generate"]);
        await run(directory, ["task", "tsugiori", "generate", "--check"]);
        if (chapter === "06-testing") {
          await run(directory, ["test", "-A", "workflows/src/"]);
        }
      });
    }
  },
);
