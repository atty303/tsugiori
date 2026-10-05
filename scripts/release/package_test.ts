import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { archive, digest, unarchive } from "./archive.ts";
import { verifyContent } from "./package.ts";

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
          exports: { ".": "./mod.ts" },
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
  const remote = { manifest, exports: { ".": "./mod.ts" } };
  await verifyContent(files, remote, "0.1.0");
  await assertRejects(() =>
    verifyContent(files, { ...remote, exports: { ".": "./else.ts" } }, "0.1.0")
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
