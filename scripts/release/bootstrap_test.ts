import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { assertAsset, assertRelease, Github } from "./bootstrap.ts";

Deno.test("bootstrap accepts only identical existing release and assets", () => {
  const release = {
    id: 1,
    body: "owned-marker",
    tag_name: "v0.1.0",
    draft: true,
    prerelease: false,
  };
  assertRelease(release, "owned-marker");
  assertThrows(() => assertRelease(release, "other-marker"));
  assertThrows(() =>
    assertRelease({ ...release, prerelease: true }, release.body)
  );
  assertEquals(
    assertAsset([], "source.tar.gz", 10, "sha256-abc", false),
    false,
  );
  assertThrows(() => assertAsset([], "source.tar.gz", 10, "sha256-abc", true));
  const asset = {
    name: "source.tar.gz",
    size: 10,
    digest: "sha256:abc",
    state: "uploaded",
  };
  assertEquals(
    assertAsset([asset], asset.name, asset.size, "sha256-abc", true),
    true,
  );
  assertThrows(() =>
    assertAsset(
      [{ ...asset, digest: "sha256:other" }],
      asset.name,
      asset.size,
      "sha256-abc",
      true,
    )
  );
  assertThrows(() =>
    assertAsset(
      [{ ...asset, state: "starter" }],
      asset.name,
      asset.size,
      "sha256-abc",
      false,
    )
  );
  assertThrows(() =>
    assertAsset(
      [asset, { ...asset, name: "extra" }],
      asset.name,
      asset.size,
      "sha256-abc",
      true,
    )
  );
});

Deno.test("bootstrap tag retries do not mutate existing tags and reject conflicts", async () => {
  const original = globalThis.fetch;
  const methods: string[] = [];
  let tagSha = "a".repeat(40);
  globalThis.fetch = (input, init) => {
    methods.push(init?.method ?? "GET");
    const url = String(input);
    const root = "https://api.github.com/repos/atty303/tsugiori";
    if (url === root) {
      return Promise.resolve(Response.json({ default_branch: "main" }));
    }
    if (url === `${root}/tags?per_page=100&page=1`) {
      return Promise.resolve(Response.json([{ name: "v0.1.0" }]));
    }
    if (url === `${root}/git/ref/tags/v0.1.0`) {
      return Promise.resolve(
        Response.json({ object: { type: "commit", sha: tagSha } }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  try {
    const github = new Github("a".repeat(40), "fixture-noncredential");
    await github.reserve();
    assertEquals(methods, ["GET", "GET", "GET"]);
    tagSha = "b".repeat(40);
    await assertRejects(() => github.reserve());
    assertEquals(methods.every((method) => method === "GET"), true);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("bootstrap discovers resumable drafts through release listing", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const draft = {
    id: 1,
    tag_name: "v0.1.0",
    body: "marker",
    draft: true,
    prerelease: false,
  };
  globalThis.fetch = (input) => {
    paths.push(String(input));
    return Promise.resolve(Response.json([draft]));
  };
  try {
    assertEquals(
      await new Github("a".repeat(40), "fixture-noncredential").release(),
      draft,
    );
    assertEquals(paths[0].includes("releases?"), true);
  } finally {
    globalThis.fetch = original;
  }
});
