import { assertEquals, assertNotEquals } from "@std/assert";
import {
  sourceArtifactKey,
  TASK_ARTIFACT_FORMAT_VERSION,
} from "../packages/task-runtime/src/artifact.ts";

Deno.test("source artifact key changes only across explicit identity axes", async () => {
  const baseline = {
    artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
    cacheVersion: 1,
    modules: [{ path: ".github/tsugiori.ts", sha256: "local-source" }],
    target: "aarch64-apple-darwin",
  } as const;
  const key = await sourceArtifactKey(baseline);

  assertEquals(await sourceArtifactKey({ ...baseline }), key);
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
    await sourceArtifactKey({
      ...baseline,
      target: "x86_64-unknown-linux-gnu",
    }),
    key,
  );
  assertNotEquals(
    await sourceArtifactKey({ ...baseline, artifactFormatVersion: "next" }),
    key,
  );
});
