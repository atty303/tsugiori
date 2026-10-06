import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
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

  // Independent SHA-256 vectors also cover a leading zero in the Base36 source key.
  assertEquals(key, "S04CA83LCO8A8U19XC1ING401RJNEKUWCL8ZQC19HWBQLVRRF93");
  assertEquals(
    await artifactKey(key, "aarch64-apple-darwin"),
    "A58SWS2Z0OZA1ECGS5ZYS5L8V1UFXXPUKMV5CGV76FYXKX31BO1",
  );
  assertEquals(await sourceArtifactKey({ ...baseline }), key);
  await assertRejects(() => artifactKey(key, "../../outside"));
  await assertRejects(() =>
    artifactKey("../../outside", "aarch64-apple-darwin")
  );
  for (const invalid of [key.toLowerCase(), key.slice(1), `${key}0`]) {
    await assertRejects(() => artifactKey(invalid, "aarch64-apple-darwin"));
  }
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
    await artifactKey(key, "aarch64-apple-darwin"),
    await artifactKey(key, "x86_64-unknown-linux-gnu"),
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
