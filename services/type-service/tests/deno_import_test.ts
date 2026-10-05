import { assert, assertEquals } from "@std/assert";
import { GitHubClient } from "../src/github/client.ts";
import { createService } from "../src/service.ts";
import { MemoryCache, shaA, shaB, yaml } from "./fixtures.ts";

Deno.test("Deno URL import preserves redirects on cold locked fetch and supports explicit refresh", async () => {
  const directory = await Deno.makeTempDir({ prefix: "tsugiori-type-import-" });
  const controller = new AbortController();
  let sha = shaA;
  const requests: string[] = [];
  const cache = new MemoryCache();
  const service = createService({
    cache,
    github: new GitHubClient((request) =>
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
      )
    ),
  });
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    signal: controller.signal,
    onListen() {},
  }, (request) => {
    requests.push(new URL(request.url).pathname);
    return service.fetch(request);
  });
  try {
    const origin = `http://127.0.0.1:${server.addr.port}`;
    const entry = `${origin}/github/actions/acme/publish/sub@v3`;
    await Deno.writeTextFile(`${directory}/deno.json`, "{}");
    await Deno.writeTextFile(
      `${directory}/main.ts`,
      `import contract from ${
        JSON.stringify(entry)
      }; console.log(JSON.stringify({ uses: contract.uses, description: contract.description }));`,
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
      uses: "acme/publish/sub@v3",
      description: "Publish artifacts",
    });
    const lockBefore = await Deno.readTextFile(`${directory}/deno.lock`);
    const lock = JSON.parse(lockBefore);
    assert(lock.redirects[entry].includes(shaA));
    sha = shaB;
    cache.now = 301;
    requests.length = 0;
    const cold = await run("cache-b", "--frozen=true");
    assert(cold.success, new TextDecoder().decode(cold.stderr));
    assertEquals(
      JSON.parse(new TextDecoder().decode(cold.stdout)).description,
      "Publish artifacts",
    );
    assertEquals(requests, [
      `/_resolved/g1/${shaA}/github/actions/acme/publish/sub@v3`,
    ]);
    assertEquals(await Deno.readTextFile(`${directory}/deno.lock`), lockBefore);
    requests.length = 0;
    const reloadLocked = await run("cache-b", "--reload", "--frozen=false");
    assert(reloadLocked.success, new TextDecoder().decode(reloadLocked.stderr));
    assertEquals(requests, [
      `/_resolved/g1/${shaA}/github/actions/acme/publish/sub@v3`,
    ]);
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
    assertEquals(requests, [
      "/github/actions/acme/publish/sub@v3",
      `/_resolved/g1/${shaB}/github/actions/acme/publish/sub@v3`,
    ]);
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
