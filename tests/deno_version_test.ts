import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  MINIMUM_DENO_VERSION,
  supportedDenoVersion,
} from "../src/task-runtime/deno.ts";

Deno.test("Deno minimum rejects old and prerelease runtimes", () => {
  for (const version of ["1.46.0", "2.5.99", "2.6.0-rc.1", "unknown"]) {
    assertEquals(supportedDenoVersion(version), false);
  }
  for (const version of [MINIMUM_DENO_VERSION, "2.10.0", "3.0.0"]) {
    assertEquals(supportedDenoVersion(version), true);
  }
});

Deno.test("common entrypoint checks Deno before every source command or task", async () => {
  const runner = new URL("../src/runner/main.ts", import.meta.url).href;
  const script = `import { runProject } from ${JSON.stringify(runner)};
Object.defineProperty(Deno, "version", { value: { ...Deno.version, deno: "2.5.0" } });
for (const args of [["generate"], ["actions", "add", "owner/repo@ref"], ["workflow/test/task-1"]]) {
  const code = await runProject({ project: {} as never, entrypointUrl: import.meta.url }, args);
  if (code !== 1) throw new Error("Version check did not reject the command");
}`;
  const result = await new Deno.Command(Deno.execPath(), {
    args: ["eval", script],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
  assertStringIncludes(
    new TextDecoder().decode(result.stderr),
    `requires Deno >= ${MINIMUM_DENO_VERSION}; found 2.5.0`,
  );
});
