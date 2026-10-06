import { assert, assertEquals } from "@std/assert";
import worker from "../src/worker.ts";
import { oauth, shaA, yaml } from "./fixtures.ts";

Deno.test("Worker bindings authenticate only GitHub API requests and never enter modules or errors", async () => {
  const original = globalThis.fetch;
  const requests: Request[] = [];
  let status = 200;
  try {
    globalThis.fetch = (input) => {
      const request = new Request(input);
      requests.push(request);
      assertEquals(new URL(request.url).origin, "https://api.github.com");
      assertEquals(request.redirect, "manual");
      assertEquals(
        request.headers.get("authorization"),
        `Basic ${btoa(`${oauth.clientId}:${oauth.clientSecret}`)}`,
      );
      assert(!request.headers.has("cookie"));
      return Promise.resolve(
        status !== 200
          ? new Response(oauth.clientSecret, { status })
          : request.url.includes("/commits/")
          ? Response.json({ sha: shaA })
          : new Response(yaml),
      );
    };
    const env = {
      GITHUB_OAUTH_CLIENT_ID: oauth.clientId,
      GITHUB_OAUTH_CLIENT_SECRET: oauth.clientSecret,
    };
    const entry = new Request("https://t/github/actions/v1/a/b@v4", {
      headers: { Authorization: "Bearer caller", Cookie: "caller" },
    });
    assertEquals((await worker.fetch(entry, env)).status, 302);
    const resolved = new Request(
      `https://t/github/actions/v1/a/b@${shaA}?ref=v4`,
    );
    const module = await (await worker.fetch(resolved, env)).text();
    assert(module.includes(`"a/b@${shaA}"`));
    assert(!module.includes(oauth.clientSecret));
    const before = requests.length;
    status = 401;
    const failure = await worker.fetch(entry, env);
    assertEquals(failure.status, 502);
    assertEquals(await failure.text(), "authentication_failed");
    assertEquals(requests.length, before + 1);
    const missing = await worker.fetch(entry, {});
    assertEquals(missing.status, 503);
    assertEquals(await missing.text(), "configuration_missing");
    assertEquals(requests.length, before + 1);
  } finally {
    globalThis.fetch = original;
  }
});
