import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { archive, digest, unarchive } from "./archive.ts";
import { verifyContent } from "./package.ts";
import { publishRelease } from "./publish.ts";
import { Recording } from "./diagnostics.ts";

const encode = (value: string) => new TextEncoder().encode(value);
function source() {
  return new Map([
    [
      "deno.json",
      encode(
        JSON.stringify({
          name: "@atty303/tsugiori",
          version: "0.1.0",
          license: "MIT",
          exports: { "./github-actions": "./mod.ts" },
          publish: { include: ["deno.json", "mod.ts"] },
        }),
      ),
    ],
    ["mod.ts", encode("export const answer = 42;\n")],
  ]);
}
Deno.test("source archive is deterministic and rejects corruption/traversal", () => {
  const files = source();
  const packed = archive(files);
  assertEquals(packed, archive(new Map([...files].reverse())));
  assertEquals(unarchive(packed), files);
  assertThrows(() => archive(new Map([["../escape", encode("x")]])));
  assertThrows(() => unarchive(packed.subarray(0, packed.length - 8)));
  assertThrows(() => unarchive(new Uint8Array([1, 2, 3])));
});
Deno.test("registry comparison requires every byte, file and export to agree", async () => {
  const files = source();
  const manifest = Object.fromEntries(
    await Promise.all(
      [...files].map(async (
        [path, bytes],
      ) => [`/${path}`, { size: bytes.length, checksum: await digest(bytes) }]),
    ),
  );
  const remote = { manifest, exports: { "./github-actions": "./mod.ts" } };
  await verifyContent(files, remote, "0.1.0");
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      exports: { "./github-actions": "./else.ts" },
    }, "0.1.0")
  );
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      manifest: { ...manifest, "/extra": { size: 0, checksum: "" } },
    }, "0.1.0")
  );
  await assertRejects(() =>
    verifyContent(files, {
      ...remote,
      manifest: {
        ...manifest,
        "/mod.ts": { ...manifest["/mod.ts"], checksum: "sha256-different" },
      },
    }, "0.1.0")
  );
  await assertRejects(() => verifyContent(files, remote, "0.1.1"));
});

Deno.test("release publication verifies JSR before deployment, propagates failure and retries the same source", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "tsugiori-publish-test-",
  });
  const original = globalThis.fetch;
  try {
    const files = source();
    await Deno.writeFile(`${directory}/tsugiori-0.1.0.tar.gz`, archive(files));
    const manifest = Object.fromEntries(
      await Promise.all([...files].map(
        async (
          [path, bytes],
        ) => [`/${path}`, {
          size: bytes.length,
          checksum: await digest(bytes),
        }],
      )),
    );
    let mismatch = false;
    let registryReads = 0;
    let deployments = 0;
    globalThis.fetch = (input) => {
      assertEquals(
        String(input),
        "https://jsr.io/@atty303/tsugiori/0.1.0_meta.json",
      );
      registryReads++;
      return Promise.resolve(Response.json({
        manifest: mismatch ? {} : manifest,
        exports: { "./github-actions": "./mod.ts" },
      }));
    };
    const record = new Recording(`${directory}/diagnostics`);
    await assertRejects(
      () =>
        publishRelease("0.1.0", directory, record, (artifact) => {
          assertEquals(artifact, "dist/type-service/worker.js");
          assertEquals(registryReads, 1);
          deployments++;
          return Promise.reject(new Error("upload failed"));
        }),
      Error,
      "upload failed",
    );
    await publishRelease("0.1.0", directory, record, () => {
      assertEquals(registryReads, 2);
      deployments++;
      return Promise.resolve();
    });
    assertEquals(deployments, 2);
    mismatch = true;
    await assertRejects(
      () =>
        publishRelease("0.1.0", directory, record, () => {
          deployments++;
          return Promise.resolve();
        }),
      Error,
      "Published file set",
    );
    assertEquals(deployments, 2);
  } finally {
    globalThis.fetch = original;
    await Deno.remove(directory, { recursive: true });
  }
});
