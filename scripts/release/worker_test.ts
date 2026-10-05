import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "node:path";
import { Recording } from "./diagnostics.ts";
import { deployWorker } from "./worker.ts";

Deno.test("fnox decrypts for either recipient, forwards only deployment secrets and cleans failed uploads", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-release-test-" });
  try {
    const globalConfig = join(root, "global");
    const bin = join(root, "bin");
    await Deno.mkdir(globalConfig);
    await Deno.mkdir(bin);
    await Deno.mkdir(join(root, "services/type-service"), { recursive: true });
    await Deno.mkdir(join(root, "dist/type-service"), { recursive: true });
    await Deno.writeTextFile(
      join(root, "dist/type-service/worker.js"),
      "export default {};",
    );
    const env: Record<string, string> = {
      ...Deno.env.toObject(),
      FNOX_CONFIG_DIR: globalConfig,
      PATH: `${bin}:${Deno.env.get("PATH")}`,
      PROBE: join(root, "probe.json"),
      WRANGLER_WRITE_LOGS: "true",
      WRANGLER_LOG_SANITIZE: "false",
    };
    delete env.FNOX_AGE_KEY;
    delete env.FNOX_AGE_KEY_FILE;
    const keys: string[] = [];
    const recipients: string[] = [];
    for (const name of ["ci", "personal"]) {
      const path = join(root, `${name}.age`);
      const generated = await new Deno.Command("age-keygen", {
        args: ["-o", path],
        stdout: "null",
        stderr: "null",
      }).output();
      assert(generated.success);
      const publicKey = await new Deno.Command("age-keygen", {
        args: ["-y", path],
        stdout: "piped",
        stderr: "null",
      }).output();
      assert(publicKey.success);
      recipients.push(new TextDecoder().decode(publicKey.stdout).trim());
      keys.push(await Deno.readTextFile(path));
    }
    await Deno.writeTextFile(
      join(root, "fnox.toml"),
      `
root = true
if_missing = "error"
env = "exec"
[providers.age]
type = "age"
recipients = ${JSON.stringify(recipients)}
[secrets]
CLOUDFLARE_ACCOUNT_ID = { default = "fixture-account" }
GITHUB_OAUTH_CLIENT_ID = { default = "fixture-app" }
`,
    );
    for (
      const [name, value] of [
        ["CLOUDFLARE_API_TOKEN", "fixture-deploy-token"],
        ["GITHUB_OAUTH_CLIENT_SECRET", "fixture-oauth-secret"],
      ]
    ) {
      const child = new Deno.Command("fnox", {
        args: [
          "--config",
          join(root, "fnox.toml"),
          "--no-daemon",
          "set",
          name,
          "--provider",
          "age",
        ],
        env,
        clearEnv: true,
        stdin: "piped",
        stdout: "null",
        stderr: "null",
      }).spawn();
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(value));
      await writer.close();
      assert((await child.status).success);
    }
    // The fake upload reads the same file and environment as Wrangler, but saves only predicates.
    await Deno.writeTextFile(
      join(bin, "wrangler"),
      `#!/usr/bin/env -S deno run -A --ext=ts
const args = Deno.args;
const path = args[args.indexOf("--secrets-file") + 1];
const secrets = JSON.parse(await Deno.readTextFile(path));
const stat = await Deno.stat(path);
await Deno.writeTextFile(Deno.env.get("PROBE")!, JSON.stringify({
  path,
  artifact: args[1],
  mode: stat.mode! & 0o777,
  secret: secrets.GITHUB_OAUTH_CLIENT_SECRET === "fixture-oauth-secret",
  onlyRuntimeSecret: Object.keys(secrets).join() === "GITHUB_OAUTH_CLIENT_SECRET",
  token: Deno.env.get("CLOUDFLARE_API_TOKEN") === "fixture-deploy-token",
  account: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") === "fixture-account",
  client: args.includes("GITHUB_OAUTH_CLIENT_ID:fixture-app"),
  noIdentity: !Deno.env.has("FNOX_AGE_KEY") && !Deno.env.has("FNOX_AGE_KEY_FILE"),
  noRuntimeSecret: !Deno.env.has("GITHUB_OAUTH_CLIENT_SECRET"),
  prebuilt: Deno.env.get("TSUGIORI_WORKER_PREBUILT") === "true",
  noDiskLogs: Deno.env.get("WRANGLER_WRITE_LOGS") === "false",
  sanitizedLogs: Deno.env.get("WRANGLER_LOG_SANITIZE") === "true",
}));
console.log(secrets.GITHUB_OAUTH_CLIENT_SECRET);
console.error(Deno.env.get("CLOUDFLARE_API_TOKEN"));
Deno.exit(Deno.env.get("PROBE_FAIL") === "true" ? 1 : 0);
`,
      { mode: 0o700 },
    );
    for (const key of keys) {
      const record = new Recording(join(root, "diagnostics"));
      await deployWorker("dist/type-service/worker.js", record, {
        ...env,
        FNOX_AGE_KEY: key,
      }, root);
      await record.finish("ok");
      const probe = JSON.parse(await Deno.readTextFile(env.PROBE));
      assertEquals(probe.artifact, join(root, "dist/type-service/worker.js"));
      assertEquals(probe.mode, 0o600);
      for (
        const field of [
          "secret",
          "onlyRuntimeSecret",
          "token",
          "account",
          "client",
          "noIdentity",
          "noRuntimeSecret",
          "prebuilt",
          "noDiskLogs",
          "sanitizedLogs",
        ]
      ) {
        assertEquals(probe[field], true, field);
      }
      await assertRejects(() => Deno.stat(probe.path), Deno.errors.NotFound);
    }
    const failed = new Recording(join(root, "diagnostics"));
    await assertRejects(
      () =>
        deployWorker("dist/type-service/worker.js", failed, {
          ...env,
          FNOX_AGE_KEY: keys[0],
          PROBE_FAIL: "true",
        }, root),
      Error,
      "Worker deployment failed",
    );
    await failed.finish("error");
    const probe = JSON.parse(await Deno.readTextFile(env.PROBE));
    await assertRejects(() => Deno.stat(probe.path), Deno.errors.NotFound);
    await Deno.remove(env.PROBE);
    await assertRejects(() =>
      deployWorker("dist/type-service/worker.js", failed, env, root)
    );
    await assertRejects(() => Deno.stat(env.PROBE), Deno.errors.NotFound);
    const config = await Deno.readTextFile(join(root, "fnox.toml"));
    assert(!config.includes("fixture-deploy-token"));
    assert(!config.includes("fixture-oauth-secret"));
    for await (const entry of Deno.readDir(join(root, "diagnostics"))) {
      const diagnostic = await Deno.readTextFile(
        join(root, "diagnostics", entry.name),
      );
      assert(!diagnostic.includes("fixture-deploy-token"));
      assert(!diagnostic.includes("fixture-oauth-secret"));
      assert(!diagnostic.includes("AGE-SECRET-KEY"));
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
