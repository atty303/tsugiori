import { assert, assertEquals } from "@std/assert";
import { GitHubClient } from "../src/github/client.ts";
import { createService } from "../src/service.ts";
import { MemoryCache, oauth, shaA, shaB, yaml } from "./fixtures.ts";

Deno.test("Deno URL import preserves redirects on cold locked fetch and supports explicit refresh", async () => {
  const directory = await Deno.makeTempDir({ prefix: "tsugiori-type-import-" });
  const controller = new AbortController();
  let sha = shaA;
  const requests: string[] = [];
  const cache = new MemoryCache();
  const service = createService({
    cache,
    github: new GitHubClient(oauth, (request) =>
      Promise.resolve(
        request.url.includes("/commits/")
          ? Response.json({ sha })
          : new Response(
            yaml.replace(
              "Publish artifacts",
              request.url.includes(shaB)
                ? "Updated artifacts"
                : "Publish artifacts",
            ),
          ),
      )),
  });
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: controller.signal,
    onListen() {},
  }, (request) => {
    requests.push(new URL(request.url).pathname + new URL(request.url).search);
    return service.fetch(request);
  });
  try {
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const entry = `${origin}/github/actions/v1/acme/publish/sub@v3`;
    const direct = `${origin}/github/actions/v1/acme/publish/sub@${shaA}`;
    await Deno.writeTextFile(
      `${directory}/deno.json`,
      JSON.stringify({
        imports: {
          "#actions/acme/publish/sub": entry,
          "#actions/direct": direct,
        },
      }),
    );
    await Deno.writeTextFile(
      `${directory}/main.ts`,
      `import contract from "#actions/acme/publish/sub"; import direct from "#actions/direct"; if (direct.uses !== "acme/publish/sub@${shaA}") throw new Error("SHA mismatch"); console.log(JSON.stringify({ uses: contract.uses, description: contract.description, originalRef: contract.originalRef }));`,
    );
    const run = async (cacheName: string, ...flags: string[]) =>
      await new Deno.Command(Deno.execPath(), {
        args: ["run", "--allow-import=127.0.0.1", ...flags, "main.ts"],
        cwd: directory,
        env: { DENO_DIR: `${directory}/${cacheName}` },
        stdout: "piped",
        stderr: "piped",
      }).output();
    const first = await run("cache-a");
    assert(first.success, new TextDecoder().decode(first.stderr));
    assertEquals(JSON.parse(new TextDecoder().decode(first.stdout)), {
      uses: `acme/publish/sub@${shaA}`,
      description: "Publish artifacts",
      originalRef: "v3",
    });
    const lockBefore = await Deno.readTextFile(`${directory}/deno.lock`);
    const lock = JSON.parse(lockBefore);
    assertEquals(
      lock.redirects[entry],
      `${origin}/github/actions/v1/acme/publish/sub@${shaA}?ref=v3`,
    );
    assertEquals(lock.redirects[direct], undefined);
    assert(typeof lock.remote[direct] === "string");
    assert(typeof lock.remote[lock.redirects[entry]] === "string");
    sha = shaB;
    cache.now = 301;
    requests.length = 0;
    const cold = await run("cache-b", "--frozen=true");
    assert(cold.success, new TextDecoder().decode(cold.stderr));
    assertEquals(
      JSON.parse(new TextDecoder().decode(cold.stdout)).description,
      "Publish artifacts",
    );
    assertEquals(
      requests.sort(),
      [
        `/github/actions/v1/acme/publish/sub@${shaA}?ref=v3`,
        `/github/actions/v1/acme/publish/sub@${shaA}`,
      ].sort(),
    );
    assertEquals(await Deno.readTextFile(`${directory}/deno.lock`), lockBefore);
    requests.length = 0;
    const reloadLocked = await run("cache-b", "--reload", "--frozen=false");
    assert(reloadLocked.success, new TextDecoder().decode(reloadLocked.stderr));
    assertEquals(
      requests.sort(),
      [
        `/github/actions/v1/acme/publish/sub@${shaA}?ref=v3`,
        `/github/actions/v1/acme/publish/sub@${shaA}`,
      ].sort(),
    );
    assertEquals(
      JSON.parse(new TextDecoder().decode(reloadLocked.stdout)).description,
      "Publish artifacts",
    );
    // Explicit refresh discards the selected redirect entry, not all unrelated pins.
    delete lock.redirects[entry];
    await Deno.writeTextFile(
      `${directory}/deno.lock`,
      `${JSON.stringify(lock, null, 2)}\n`,
    );
    requests.length = 0;
    const refresh = await run("cache-b", "--reload", "--frozen=false");
    assert(refresh.success, new TextDecoder().decode(refresh.stderr));
    assertEquals(
      JSON.parse(new TextDecoder().decode(refresh.stdout)).description,
      "Updated artifacts",
    );
    assertEquals(
      requests.sort(),
      [
        "/github/actions/v1/acme/publish/sub@v3",
        `/github/actions/v1/acme/publish/sub@${shaB}?ref=v3`,
        `/github/actions/v1/acme/publish/sub@${shaA}`,
      ].sort(),
    );
    assert(
      JSON.parse(await Deno.readTextFile(`${directory}/deno.lock`))
        .redirects[entry].includes(shaB),
    );
  } finally {
    controller.abort();
    await server.finished;
    await Deno.remove(directory, { recursive: true });
  }
});
