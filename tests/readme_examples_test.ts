import { assert, assertEquals } from "@std/assert";

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
  assertEquals(blocks.length, 5);
  for (const [index, chapter] of chapters.slice(0, 5).entries()) {
    const source = await Deno.readTextFile(
      new URL(`examples/${chapter}/.github/workflows.ts`, root),
    );
    assert(lines(source).includes(lines(blocks[index][1])), chapter);
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
  await run(testing, ["test", "-A"]);
});
