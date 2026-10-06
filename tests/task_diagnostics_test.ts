import { assert, assertEquals } from "@std/assert";
import { resolve } from "node:path";
import { DiagnosticRecorder } from "../src/task-runtime/diagnostics.ts";

Deno.test("diagnostic recording retains bounded failures, supports opt-out and survives store failure", async () => {
  const fixture = await Deno.makeTempDir({ prefix: "tsugiori-diagnostics-" });
  const previous = Deno.env.get("XDG_CACHE_HOME");
  try {
    Deno.env.set("XDG_CACHE_HOME", fixture);
    const failed = new DiagnosticRecorder(
      "github-actions.task.restore",
      "test",
      true,
    );
    failed.operation({
      name: "artifact.validate",
      status: "error",
      errorType: "source_mismatch",
    });
    await failed.finish("error");
    for (let index = 0; index < 33; index++) {
      await new DiagnosticRecorder("task.dispatch", "test", true).finish(
        "success",
      );
    }
    const directory = resolve(fixture, "tsugiori/diagnostics");
    const names = [];
    for await (const entry of Deno.readDir(directory)) names.push(entry.name);
    assertEquals(names.length, 32);
    assert(names.includes(`${failed.runId}.json`));
    const disabled = new DiagnosticRecorder("task.dispatch", "test", false);
    await disabled.finish("success");
    assertEquals(names.includes(`${disabled.runId}.json`), false);
    const capped = new DiagnosticRecorder("task.dispatch", "test", true);
    for (let index = 0; index < 65; index++) {
      capped.operation({ name: "test.operation", status: "success" });
    }
    await capped.finish("success");
    const record = JSON.parse(
      await Deno.readTextFile(resolve(directory, `${capped.runId}.json`)),
    );
    assertEquals(record.completeness, "partial");
    assertEquals(record.operations.length, 64);
    await Deno.remove(resolve(fixture, "tsugiori"), { recursive: true });
    await Deno.writeTextFile(resolve(fixture, "tsugiori"), "unwritable store");
    // This is diagnostic-only degradation; finish must not reject.
    await new DiagnosticRecorder("task.dispatch", "test", true).finish(
      "success",
    );
  } finally {
    if (previous === undefined) Deno.env.delete("XDG_CACHE_HOME");
    else Deno.env.set("XDG_CACHE_HOME", previous);
    await Deno.remove(fixture, { recursive: true });
  }
});
