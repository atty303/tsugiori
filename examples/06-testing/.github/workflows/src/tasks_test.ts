import assert from "node:assert/strict";
import { collectFiles, countLines } from "./tasks.ts";

Deno.test("collectFiles writes a typed list and its presence flag", async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const init = await new Deno.Command("git", {
      args: ["init", "-q"],
      cwd,
    }).output();
    assert.equal(init.code, 0);
    await Deno.writeTextFile(`${cwd}/one.ts`, "const one = 1;\n");
    await Deno.writeTextFile(`${cwd}/two.txt`, "not TypeScript\n");
    const add = await new Deno.Command("git", {
      args: ["add", "one.ts", "two.txt"],
      cwd,
    }).output();
    assert.equal(add.code, 0);
    const written = new Map<string, unknown>();
    await collectFiles({
      cwd,
      outputs: {
        set: (name, value) => {
          written.set(name, value);
          return Promise.resolve();
        },
      },
    });
    assert.deepEqual(Object.fromEntries(written), {
      files: ["one.ts"],
      hasFiles: "true",
    });
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test("countLines reads each typed path", async () => {
  const cwd = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${cwd}/one.ts`, "a\nb\n");
    await Deno.writeTextFile(`${cwd}/two.ts`, "c");
    const messages: string[] = [];
    await countLines({
      cwd,
      inputs: { files: ["one.ts", "two.ts"] },
      logger: {
        info: (...values) => messages.push(values.join(" ")),
        warn: () => {},
        error: () => {},
      },
    });
    assert.deepEqual(messages, ["2 TypeScript files, 3 lines"]);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});
