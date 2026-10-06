import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "node:path";

const runner = new URL("../src/github_actions.ts", import.meta.url).href;

async function command(directory: string, args: string[]) {
  return await new Deno.Command(Deno.execPath(), {
    cwd: directory,
    args,
    env: { RUNNER_DEBUG: "0" },
    stdout: "piped",
    stderr: "piped",
  }).output();
}

async function fixture(run: (directory: string) => Promise<void>) {
  const directory = await Deno.makeTempDir({ prefix: "tsugiori-actions-" });
  try {
    await Deno.writeTextFile(
      join(directory, "workflows.ts"),
      `import {defineProject, runProject} from ${JSON.stringify(runner)};
const config = defineProject({workingDirectory: ".", cacheVersion: 1, workflows: []});
Deno.exitCode = await runProject({config, configUrl: import.meta.url});\n`,
    );
    const initialized = await command(directory, [
      "cache",
      "--frozen=false",
      "--lock=deno.lock",
      "./workflows.ts",
    ]);
    assertEquals(
      initialized.code,
      0,
      new TextDecoder().decode(initialized.stderr),
    );
    await run(directory);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

function add(directory: string, ...args: string[]) {
  // Existing entrypoint dependencies are cached; newly mapped Actions cannot fetch.
  return command(directory, [
    "run",
    "--cached-only",
    "--frozen=true",
    "--allow-read",
    "--allow-write",
    "--allow-env",
    "./workflows.ts",
    "actions",
    "add",
    ...args,
  ]);
}

Deno.test("actions add preserves JSONC, order and lockfile; handles idempotence and conflicts", async () => {
  await fixture(async (directory) => {
    const path = join(directory, "deno.jsonc");
    const initial = `{
  // project comment
  "tasks": {"tsugiori": "deno run --frozen=true -A ./workflows.ts"},
  "imports": {
    "custom": "./custom.ts", // keep custom
  },
  "compilerOptions": {"strict": true}
}\n`;
    await Deno.writeTextFile(path, initial);
    await Deno.writeTextFile(join(directory, "custom.ts"), "export {};\n");
    const beforeLock = await Deno.readTextFile(join(directory, "deno.lock"));
    const added = await add(directory, "actions/checkout@v4");
    assertEquals(added.code, 0, new TextDecoder().decode(added.stderr));
    const after = await Deno.readTextFile(path);
    for (
      const text of [
        "// project comment",
        "// keep custom",
        '"custom": "./custom.ts"',
        '"compilerOptions": {"strict": true}',
        '"#actions/actions/checkout"',
        "https://tsugiori.atty303.workers.dev/github/actions/v1/actions/checkout@v4",
      ]
    ) assertStringIncludes(after, text);
    assert(after.indexOf('"custom"') < after.indexOf('"#actions'));
    assert(after.indexOf('"tasks"') < after.indexOf('"imports"'));
    assert(after.indexOf('"imports"') < after.indexOf('"compilerOptions"'));
    assertEquals((await add(directory, "actions/checkout@v4")).code, 0);
    assertEquals(await Deno.readTextFile(path), after);
    assertEquals((await add(directory, "actions/checkout@v5")).code, 1);
    assertEquals(await Deno.readTextFile(path), after);
    assertEquals(
      await Deno.readTextFile(join(directory, "deno.lock")),
      beforeLock,
    );
    assertEquals(
      await Deno.readTextFile(join(directory, "workflows.ts")),
      `import {defineProject, runProject} from ${JSON.stringify(runner)};
const config = defineProject({workingDirectory: ".", cacheVersion: 1, workflows: []});
Deno.exitCode = await runProject({config, configUrl: import.meta.url});\n`,
    );
    assertEquals(
      [...Deno.readDirSync(directory)].filter((entry) =>
        entry.name.startsWith(".tsugiori-actions-")
      ).length,
      0,
    );
  });
});

Deno.test("actions add encodes subpaths and refs and rejects ambiguous or invalid input without writes", async () => {
  await fixture(async (directory) => {
    const path = join(directory, "deno.json");
    await Deno.writeTextFile(
      path,
      '{"tasks":{},"lint":{"rules":{"tags":["recommended"]}}}\n',
    );
    assertEquals(
      (await add(directory, "owner/repo/型+%/action@feature/日本語+%")).code,
      0,
    );
    const value = JSON.parse(await Deno.readTextFile(path));
    assertEquals(
      value.imports["#actions/owner/repo/型+%/action"],
      "https://tsugiori.atty303.workers.dev/github/actions/v1/owner/repo/%E5%9E%8B%2B%25/action@feature%2F%E6%97%A5%E6%9C%AC%E8%AA%9E%2B%25",
    );
    assertEquals(value.lint, { rules: { tags: ["recommended"] } });
    const after = await Deno.readTextFile(path);
    for (
      const args of [
        [],
        ["a/b@v1", "extra"],
        ["a/b@v1", "--check"],
        ["a/b@v1", "--expect-layout", "ignored"],
        ["a/b"],
        ["./b@v1"],
        ["a/b/../c@v1"],
        ["a/b@a//b"],
        ["a/b@a?b"],
        ["a/b@a@b"],
        ["a/b@a\nb"],
      ]
    ) {
      assertEquals(
        (await add(directory, ...args)).code,
        1,
        JSON.stringify(args),
      );
      assertEquals(await Deno.readTextFile(path), after);
    }
    for (
      const invalid of [
        '{"imports":',
        '{"imports":[]}',
        '{"importMap":"./map.json"}',
        '{"imports":{},"imports":{}}',
        '{"imports":{"x":"a","x":"b"}}',
        "[]",
      ]
    ) {
      await Deno.writeTextFile(path, invalid);
      assertEquals((await add(directory, "a/b@v1")).code, 1);
      assertEquals(await Deno.readTextFile(path), invalid);
    }
    await Deno.writeTextFile(path, "{}");
    await Deno.writeTextFile(join(directory, "deno.jsonc"), "{}");
    assertEquals((await add(directory, "a/b@v1")).code, 1);
    assertEquals(await Deno.readTextFile(path), "{}");
    await Deno.remove(path);
    await Deno.remove(join(directory, "deno.jsonc"));
    assertEquals((await add(directory, "a/b@v1")).code, 1);
  });
});

Deno.test("Deno task selects the workspace member; deno install fetches mapped Actions without entrypoint aliases", async () => {
  await fixture(async (directory) => {
    const member = join(directory, "member");
    await Deno.mkdir(member);
    await Deno.copyFile(
      join(directory, "workflows.ts"),
      join(member, "workflows.ts"),
    );
    await Deno.writeTextFile(
      join(directory, "deno.json"),
      JSON.stringify({ workspace: ["member"] }),
    );
    await Deno.writeTextFile(
      join(member, "deno.json"),
      JSON.stringify({
        tasks: {
          tsugiori: "deno run --cached-only --frozen=true -A ./workflows.ts",
        },
      }),
    );
    const task = await command(directory, [
      "task",
      "--cwd",
      "member",
      "tsugiori",
      "actions",
      "add",
      "actions/checkout@v4",
    ]);
    assertEquals(task.code, 0, new TextDecoder().decode(task.stderr));
    const root = await Deno.readTextFile(join(directory, "deno.json"));
    assertEquals(JSON.parse(root), { workspace: ["member"] });
    const config = JSON.parse(
      await Deno.readTextFile(join(member, "deno.json")),
    );
    assertEquals(
      config.imports["#actions/actions/checkout"],
      "https://tsugiori.atty303.workers.dev/github/actions/v1/actions/checkout@v4",
    );
    const sha = "a".repeat(40);
    const requests: string[] = [];
    const server = Deno.serve(
      { hostname: "127.0.0.1", port: 0, onListen() {} },
      (request) => {
        const url = new URL(request.url);
        requests.push(url.pathname + url.search);
        if (url.pathname.endsWith("@v4")) {
          return new Response(null, {
            status: 302,
            headers: {
              location: `/github/actions/v1/actions/checkout@${sha}?ref=v4`,
            },
          });
        }
        return new Response(
          `export default { uses: "actions/checkout@${sha}", originalRef: "v4", inputs: {}, outputs: {} };`,
          { headers: { "content-type": "application/typescript" } },
        );
      },
    );
    const cache = await Deno.makeTempDir({ prefix: "tsugiori-install-" });
    try {
      // The same mapping is served locally; the official new route is not deployed yet.
      const origin = `http://127.0.0.1:${server.addr.port}`;
      config.imports["#actions/actions/checkout"] = config
        .imports["#actions/actions/checkout"].replace(
          "https://tsugiori.atty303.workers.dev",
          origin,
        );
      await Deno.writeTextFile(
        join(member, "deno.json"),
        JSON.stringify(config),
      );
      const install = await new Deno.Command(Deno.execPath(), {
        cwd: member,
        args: ["install", `--allow-import=127.0.0.1:${server.addr.port}`],
        env: { DENO_DIR: cache },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(install.code, 0, new TextDecoder().decode(install.stderr));
      assertEquals(requests.length, 2);
      const lock = JSON.parse(
        await Deno.readTextFile(join(directory, "deno.lock")),
      );
      const source = `${origin}/github/actions/v1/actions/checkout@v4`;
      const resolved =
        `${origin}/github/actions/v1/actions/checkout@${sha}?ref=v4`;
      assertEquals(lock.redirects[source], resolved);
      assertEquals(typeof lock.remote[resolved], "string");
      const fetched = await new Deno.Command(Deno.execPath(), {
        cwd: member,
        args: [
          "eval",
          "--frozen=true",
          'import action from "#actions/actions/checkout"; console.log(action.originalRef);',
        ],
        env: { DENO_DIR: cache },
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(fetched.code, 0, new TextDecoder().decode(fetched.stderr));
      assertEquals(new TextDecoder().decode(fetched.stdout).trim(), "v4");
      assertEquals(requests.length, 2);
    } finally {
      await server.shutdown();
      await Deno.remove(cache, { recursive: true });
    }
  });
});
