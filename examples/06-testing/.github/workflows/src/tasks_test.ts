import assert from "node:assert/strict";
// Import the same task functions passed to the workflow DSL.
import { collectFiles, countLines } from "./tasks.ts";

// Test the task body as an ordinary Deno function.
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
    // Capture task outputs with a local writer instead of a runner.
    const written = new Map<string, unknown>();
    // Call the task function directly with test inputs.
    await collectFiles({
      cwd,
      // Declare the outputs visible to later steps.
      outputs: {
        set: (name, value) => {
          written.set(name, value);
          return Promise.resolve();
        },
      },
    });
    // Check the values sent through the declared output names.
    assert.deepEqual(Object.fromEntries(written), {
      files: ["one.ts"],
      hasFiles: "true",
    });
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

// Test the second task body without evaluating a workflow.
Deno.test("countLines reads each typed path", async () => {
  const cwd = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${cwd}/one.ts`, "a\nb\n");
    await Deno.writeTextFile(`${cwd}/two.ts`, "c");
    const messages: string[] = [];
    // Pass the same parsed input shape received by the task at runtime.
    await countLines({
      cwd,
      // Declare inputs through typed contracts.
      inputs: { files: ["one.ts", "two.ts"] },
      logger: {
        info: (...values) => messages.push(values.join(" ")),
        warn: () => {},
        error: () => {},
      },
    });
    // Check the ordinary function's logged result.
    assert.deepEqual(messages, ["2 TypeScript files, 3 lines"]);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});
