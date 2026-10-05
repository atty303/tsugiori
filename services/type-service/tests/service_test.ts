import { assert, assertEquals, assertRejects } from "@std/assert";
import { GitHubClient } from "../src/github/client.ts";
import { createService } from "../src/service.ts";
import { Diagnostics, Recording } from "../src/diagnostics.ts";
import { generateG1 } from "../src/github/actions/g1.ts";
import { encodeUses, parseUses } from "../src/github/reference.ts";

import { MemoryCache, shaA, shaB, yaml } from "./fixtures.ts";

Deno.test("HTTP resolves refs before metadata, caches with TTL and regenerates immutable bytes", async () => {
  const cache = new MemoryCache();
  let sha = shaA;
  let fail = false;
  const urls: string[] = [];
  const service = createService({
    cache,
    github: new GitHubClient((request) => {
      urls.push(request.url);
      assert(!request.headers.has("authorization"));
      if (fail) return Promise.resolve(new Response(null, { status: 503 }));
      if (request.url.includes("/commits/")) {
        return Promise.resolve(Response.json({ sha }));
      }
      if (request.url.includes("action.yml?")) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(new Response(yaml));
    }),
  });
  const entry = new Request(
    "https://types.example/github/actions/acme/publish/sub@release%2Fv3",
  );
  const first = await service.fetch(entry);
  assertEquals(first.status, 302);
  const immutable = new Request(
    new URL(first.headers.get("location")!, entry.url),
  );
  assert(immutable.url.includes(shaA));
  const body = await (await service.fetch(immutable)).text();
  assert(body.includes('"acme/publish/sub@release/v3"'));
  assert(!body.includes('["runs"]'));
  assert(body.includes("@deprecated Use destination instead."));
  assert(urls.at(-1)?.includes(`contents/sub/action.yaml?ref=${shaA}`));
  sha = shaB;
  assertEquals(
    (await service.fetch(entry)).headers.get("location"),
    first.headers.get("location"),
  );
  cache.now = 301;
  const updated = await service.fetch(entry);
  assert(updated.headers.get("location")?.includes(shaB));
  cache.entries.clear();
  assertEquals(await (await service.fetch(immutable)).text(), body);
  fail = true;
  cache.now += 301;
  assertEquals((await service.fetch(entry)).status, 502);
  assertEquals(
    (await service.fetch(entry)).headers.get("cache-control"),
    "no-store",
  );
  const run = service.diagnostics.list().at(-1)!;
  assertEquals(run.status, "error");
  assert(
    run.operations.some((op) =>
      op.name === "resolve_ref" && op.errorType === "upstream_failure"
    ),
  );
});

Deno.test("failure contracts, encoding, recording bounds and opt-out", async () => {
  for (
    const uses of [
      "a/b@v3",
      "a/b/sub/path@branch/name",
      `a/b@${shaA}`,
      "a/b/sub@日本語",
    ]
  ) {
    assertEquals(
      parseUses(decodeURIComponent(encodeUses(parseUses(uses)))).uses,
      uses,
    );
  }
  const diagnostics = new Diagnostics(2);
  const service = createService({
    diagnostics,
    github: new GitHubClient(() =>
      Promise.resolve(new Response(null, { status: 429 }))
    ),
  });
  assertEquals(
    (await service.fetch(new Request("https://t/github/actions/a/b@v3")))
      .status,
    503,
  );
  const invalid = new Request("https://t/github/actions/a/b@%ZZ");
  assertEquals((await service.fetch(invalid)).status, 400);
  const enabled = await service.fetch(invalid);
  const disabled = await service.fetch(invalid, false);
  assertEquals(await disabled.text(), await enabled.text());
  assertEquals(diagnostics.list().length, 2);
  assertEquals(diagnostics.list()[0].completeness, "complete");
  assert(!JSON.stringify(diagnostics.list()).includes("https://"));
  diagnostics.delete(diagnostics.list()[0].id);
  assertEquals(diagnostics.list().length, 1);
  diagnostics.clear();
  assertEquals(diagnostics.list(), []);
  const broken = createService({
    cache: {
      match: () => Promise.reject(new Error("store")),
      put: () => Promise.reject(new Error("store")),
    },
    github: new GitHubClient(() =>
      Promise.resolve(Response.json({ sha: shaA }))
    ),
  });
  assertEquals(
    (await broken.fetch(new Request("https://t/github/actions/a/b@v3"))).status,
    302,
  );
  assert(
    broken.diagnostics.list()[0].operations.some((op) =>
      op.name === "cache_write" && op.status === "error"
    ),
  );
  const recording = diagnostics.begin();
  for (let i = 0; i < 35; i++) {
    await recording.operation("cache_read", () => undefined);
  }
  recording.finish("ok");
  assertEquals(diagnostics.list()[0].completeness, "partial");
  assertEquals(diagnostics.list()[0].operations.length, 32);
  const timeoutClient = new GitHubClient(() =>
    Promise.reject(new Error("network"))
  );
  await assertRejects(
    () => timeoutClient.resolve(parseUses("a/b@v1"), diagnostics.begin()),
    Error,
    "upstream_failure",
  );
});

Deno.test("generator faithfully roundtrips strings and escapes comment terminators", async () => {
  const dangerous = yaml.replace(
    "Publish artifacts",
    '"quotes \\" and */ and \\n new line"',
  );
  const source = generateG1(
    dangerous,
    "a/b@v1",
    "https://github.com/a/b/blob/sha/action.yml",
  );
  const module = await import(
    `data:application/typescript,${encodeURIComponent(source)}`
  );
  assertEquals(module.default.description, 'quotes " and */ and \n new line');
  assertEquals(module.default.inputs.mode.default, "");
  assertEquals(module.default.inputs.count.default, 1);
  assertEquals(module.default.inputs.empty.default, null);
  assertEquals(module.default.inputs.flag.default, false);
  assertEquals(module.default.branding, { color: "blue", icon: "upload" });
  assertEquals(
    module.default.outputs.url.value,
    "${{ steps.publish.outputs.url }}",
  );
  assert(!("runs" in module.default));
  assertEquals(
    generateG1(dangerous, "a/b@v1", "source"),
    generateG1(dangerous, "a/b@v1", "source"),
  );
});

Deno.test("invalid metadata, unknown versions and deadlines fail without contracts", async () => {
  let calls = 0;
  const service = createService({
    github: new GitHubClient(() => {
      calls++;
      return Promise.resolve(new Response("name: invalid"));
    }),
  });
  const immutable = `https://t/_resolved/g1/${shaA}/github/actions/a/b@v1`;
  assertEquals((await service.fetch(new Request(immutable))).status, 422);
  assert(
    service.diagnostics.list().at(-1)!.operations.some((op) =>
      op.name === "generate" && op.errorType === "metadata_invalid"
    ),
  );
  const before = calls;
  assertEquals(
    (await service.fetch(new Request(immutable.replace("/g1/", "/g2/"))))
      .status,
    404,
  );
  assertEquals(calls, before);
  const deadline = createService({
    github: new GitHubClient(
      (request) =>
        new Promise((_resolve, reject) =>
          request.signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          )
        ),
      5,
    ),
  });
  assertEquals(
    (await deadline.fetch(new Request("https://t/github/actions/a/b@v1")))
      .status,
    504,
  );
  assert(
    deadline.diagnostics.list()[0].operations.some((op) =>
      op.name === "resolve_ref" && op.errorType === "timeout"
    ),
  );
  const recording = new Recording(() => {
    throw new Error("recording failed");
  });
  assertEquals(await recording.operation("generate", () => "result"), "result");
  recording.finish("ok");
  const cache = new MemoryCache();
  const headService = createService({
    cache,
    github: new GitHubClient(() => Promise.resolve(new Response(yaml))),
  });
  const head = await headService.fetch(
    new Request(immutable, { method: "HEAD" }),
  );
  assertEquals(head.status, 200);
  assertEquals(await head.text(), "");
  assert(
    (await (await headService.fetch(new Request(immutable))).text()).includes(
      "const contract",
    ),
  );
});
