import { assertEquals } from "@std/assert";
import { Recording } from "./diagnostics.ts";

Deno.test("release recording retains safe complete/partial runs and bounds retention", async () => {
  const directory = await Deno.makeTempDir();
  try {
    const partial = new Recording(directory);
    await partial.save();
    assertEquals(
      JSON.parse(await Deno.readTextFile(`${directory}/${partial.id}.json`))
        .completeness,
      "partial",
    );
    const failed = new Recording(directory);
    await failed.operation("registry_publish", () => {
      throw new Error("private-fixture-value");
    }).catch(() => {});
    await failed.finish("error");
    const raw = await Deno.readTextFile(`${directory}/${failed.id}.json`);
    assertEquals(raw.includes("private-fixture-value"), false);
    const run = JSON.parse(raw);
    assertEquals(run.status, "error");
    assertEquals(run.completeness, "complete");
    assertEquals(run.operations[0].name, "registry_publish");
    assertEquals(run.operations[0].errorType, "operation_failed");
    for (let index = 0; index < 33; index++) {
      const success = new Recording(directory);
      await success.operation("build", () => Promise.resolve());
      await success.finish("ok");
    }
    const files = [];
    for await (const entry of Deno.readDir(directory)) files.push(entry.name);
    assertEquals(files.length, 32);
    assertEquals(files.includes(`${failed.id}.json`), true);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("release recording opt-out and store failure preserve operation results", async () => {
  const directory = await Deno.makeTempDir();
  const previous = Deno.env.get("RELEASE_DIAGNOSTICS");
  const consoleError = console.error;
  try {
    Deno.env.set("RELEASE_DIAGNOSTICS", "off");
    const off = new Recording(`${directory}/disabled`);
    assertEquals(await off.operation("build", () => Promise.resolve(42)), 42);
    await off.finish("ok");
    assertEquals(
      await Deno.stat(`${directory}/disabled`).then(() => true, () => false),
      false,
    );
    Deno.env.delete("RELEASE_DIAGNOSTICS");
    await Deno.writeTextFile(`${directory}/not-directory`, "fixture");
    let degraded = false;
    console.error = () => {
      degraded = true;
    };
    const broken = new Recording(`${directory}/not-directory`);
    assertEquals(
      await broken.operation("build", () => Promise.resolve(42)),
      42,
    );
    await broken.finish("ok");
    assertEquals(degraded, true);
  } finally {
    console.error = consoleError;
    if (previous === undefined) Deno.env.delete("RELEASE_DIAGNOSTICS");
    else Deno.env.set("RELEASE_DIAGNOSTICS", previous);
    await Deno.remove(directory, { recursive: true });
  }
});
