import { assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import {
  artifactKey,
  sourceArtifactKey,
  TASK_ARTIFACT_FORMAT_VERSION,
} from "../src/task-runtime/artifact.ts";

Deno.test("source artifact key changes only across explicit identity axes", async () => {
  const baseline = {
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    cacheVersion: 1,
    modules: [{ path: ".github/tsugiori.ts", sha256: "local-source" }],
    tsugioriPackage: "@atty303/tsugiori@0.1.0",
  } as const;
  const key = await sourceArtifactKey(baseline);

  assertEquals(await sourceArtifactKey({ ...baseline }), key);
  assertThrows(() => artifactKey(key, "../../outside"));
  assertThrows(() => artifactKey("../../outside", "aarch64-apple-darwin"));
  assertNotEquals(
    await sourceArtifactKey({ ...baseline, cacheVersion: 2 }),
    key,
  );
  assertNotEquals(
    await sourceArtifactKey({
      ...baseline,
      modules: [{ ...baseline.modules[0], sha256: "changed-source" }],
    }),
    key,
  );
  assertNotEquals(
    artifactKey(key, "aarch64-apple-darwin"),
    artifactKey(key, "x86_64-unknown-linux-gnu"),
  );
  assertNotEquals(
    await sourceArtifactKey({ ...baseline, artifactFormatVersion: "next" }),
    key,
  );
  assertNotEquals(
    await sourceArtifactKey({
      ...baseline,
      tsugioriPackage: "@atty303/tsugiori@0.1.1",
    }),
    key,
  );
});
