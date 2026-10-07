import { assert, assertEquals } from "@std/assert";
import {
  configuration as initConfiguration,
  workflows as initWorkflows,
} from "../src/init/templates.ts";

const root = new URL("../", import.meta.url);
const chapters = [
  "01-init",
  "02-typed-dsl",
  "03-actions-add",
  "04-task",
  "05-typed-io",
  "06-testing",
  "07-local-action",
] as const;
async function run(directory: string, args: string[]): Promise<void> {
  const result = await new Deno.Command("mise", {
    cwd: directory,
    args: ["exec", "--", "deno", ...args],
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

Deno.test("README starter block matches the initializer", async () => {
  const readme = await Deno.readTextFile(new URL("README.md", root));
  const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)];
  assertEquals(blocks.length, 6);
  assertEquals(blocks[0][1], initWorkflows);
});

Deno.test("README invalid output reference reports its documented type error", async () => {
  const readme = await Deno.readTextFile(new URL("README.md", root));
  const match = readme.match(
    /```ts\n(env: \(\{ needs \}\) => \(\{ MESSAGE: needs\.hello\.outputs\.greeting \}\),)\n```\n\n```text\n([^`]+)```/,
  );
  assert(match);
  const directory =
    new URL("examples/02-typed-dsl/.github/workflows/src/", root)
      .pathname;
  const file = await Deno.makeTempFile({ dir: directory, suffix: ".ts" });
  try {
    const source = await Deno.readTextFile(
      new URL("examples/02-typed-dsl/.github/workflows/src/ci.ts", root),
    );
    const validLine =
      "env: ({ needs }) => ({ MESSAGE: needs.hello.outputs.message }),";
    assert(source.includes(validLine));
    await Deno.writeTextFile(
      file,
      source.replace(validLine, match[1]),
    );
    const result = await new Deno.Command("mise", {
      cwd: new URL("examples/02-typed-dsl/.github/", root).pathname,
      args: ["exec", "--", "deno", "check", "--frozen=true", file],
      env: { NO_COLOR: "1" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert(result.code !== 0, "the invalid README snippet must fail checking");
    const diagnostic = new TextDecoder().decode(result.stderr);
    assert(
      diagnostic.includes(match[2].trim()),
      `README diagnostic differs from deno check:\n${diagnostic}`,
    );
  } finally {
    await Deno.remove(file);
  }
});

Deno.test("chapter 01 matches init and every chapter uses the managed Deno and range", async () => {
  const rootMise = await Deno.readTextFile(new URL("mise.toml", root));
  const denoVersion = rootMise.match(/^deno = "[^"]+"$/m)?.[0];
  assert(denoVersion);
  const expected = JSON.parse(initConfiguration);
  expected.imports["@atty303/tsugiori"] = "jsr:@atty303/tsugiori@^0.10.4";
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
        "jsr:@atty303/tsugiori@^0.10.4",
      );
    }
  }
});

Deno.test("each documented project typechecks and its generated files are current", async () => {
  for (const chapter of chapters) {
    const directory = new URL(`examples/${chapter}/.github/`, root).pathname;
    await run(directory, [
      "check",
      "--frozen=true",
      "--allow-import=jsr.io:443,tsugiori.atty303.workers.dev:443",
      "workflows.ts",
    ]);
    await run(directory, ["task", "tsugiori", "generate", "--check"]);
  }
  const testing = new URL("examples/06-testing/.github/", root).pathname;
  await run(testing, ["test", "-A", "workflows/src/"]);
});
