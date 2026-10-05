import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main, type Recording } from "./diagnostics.ts";

const buildExcluded = [
  "FNOX_AGE_KEY",
  "FNOX_AGE_KEY_FILE",
  "CLOUDFLARE_API_TOKEN",
  "GITHUB_OAUTH_CLIENT_SECRET",
  "TSUGIORI_WORKER_PREBUILT",
];

export function buildEnvironment(
  environment = Deno.env.toObject(),
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter(([key]) => !buildExcluded.includes(key)),
  );
}

export const workerArtifact = "dist/type-service/worker.js";

export async function buildWorker(
  artifact: string,
  record: Recording,
): Promise<void> {
  await record.operation("worker_build", async () => {
    const result = await new Deno.Command("mise", {
      args: ["run", "type-service:build", artifact],
      clearEnv: true,
      env: buildEnvironment(),
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!result.success) throw new Error("Worker build failed");
  });
}

export async function deployWorker(
  artifact: string,
  record: Recording,
  environment = Deno.env.toObject(),
  root = Deno.cwd(),
): Promise<void> {
  await record.operation("fnox_exec", async () => {
    const directory = await Deno.makeTempDir({ prefix: "tsugiori-fnox-" });
    try {
      // Explicit config plus an empty global config directory isolates release secrets.
      const env: Record<string, string> = {
        ...environment,
        FNOX_CONFIG_DIR: directory,
      };
      for (
        const key of [
          "CLOUDFLARE_API_TOKEN",
          "GITHUB_OAUTH_CLIENT_SECRET",
          "CLOUDFLARE_ACCOUNT_ID",
          "GITHUB_OAUTH_CLIENT_ID",
        ]
      ) delete env[key];
      const result = await new Deno.Command("fnox", {
        args: [
          "--config",
          resolve(root, "fnox.toml"),
          "--profile",
          "default",
          "--no-daemon",
          "--non-interactive",
          "--if-missing",
          "error",
          "exec",
          "--replace",
          "--",
          Deno.execPath(),
          "run",
          "-A",
          fileURLToPath(import.meta.url),
          "--resolved",
          resolve(root, artifact),
        ],
        cwd: root,
        clearEnv: true,
        env,
        stdout: "inherit",
        stderr: "inherit",
      }).output();
      if (!result.success) {
        throw new Error(
          `Worker deployment failed with exit ${result.code}`,
        );
      }
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  });
}

export async function uploadWorker(
  artifact: string,
  record: Recording,
  environment = Deno.env.toObject(),
): Promise<void> {
  let directory: string | undefined;
  try {
    const { path, clientId, token, accountId } = await record.operation(
      "worker_secret_prepare",
      async () => {
        function required(key: string): string {
          const value = environment[key];
          if (!value) throw new Error(`Missing release configuration: ${key}`);
          return value;
        }
        const token = required("CLOUDFLARE_API_TOKEN");
        const accountId = required("CLOUDFLARE_ACCOUNT_ID");
        const clientId = required("GITHUB_OAUTH_CLIENT_ID");
        const clientSecret = required("GITHUB_OAUTH_CLIENT_SECRET");
        directory = await Deno.makeTempDir({ prefix: "tsugiori-worker-" });
        const path = resolve(directory, "secrets.json");
        await Deno.writeTextFile(
          path,
          JSON.stringify({ GITHUB_OAUTH_CLIENT_SECRET: clientSecret }),
          { mode: 0o600, createNew: true },
        );
        return { path, clientId, token, accountId };
      },
    );
    await record.operation("worker_upload", async () => {
      const result = await new Deno.Command("wrangler", {
        args: [
          "deploy",
          artifact,
          "--cwd",
          "services/type-service",
          "--secrets-file",
          path,
          "--var",
          `GITHUB_OAUTH_CLIENT_ID:${clientId}`,
        ],
        clearEnv: true,
        env: {
          ...buildEnvironment(environment),
          CLOUDFLARE_ACCOUNT_ID: accountId,
          CLOUDFLARE_API_TOKEN: token,
          TSUGIORI_WORKER_PREBUILT: "true",
          WRANGLER_WRITE_LOGS: "false",
          WRANGLER_LOG_SANITIZE: "true",
        },
        stdout: "inherit",
        stderr: "inherit",
      }).output();
      if (!result.success) {
        throw new Error(`Worker upload failed with exit ${result.code}`);
      }
    });
  } finally {
    if (directory) await Deno.remove(directory, { recursive: true });
  }
}

if (import.meta.main) {
  await main(async (record) => {
    const [mode, artifact] = Deno.args;
    if (mode === "--resolved" && artifact) {
      await uploadWorker(artifact, record);
    } else if (mode && !artifact) {
      await deployWorker(resolve(mode), record);
    } else throw new Error("Expected a built Worker artifact path");
  });
}
