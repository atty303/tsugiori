import { isAbsolute, join, resolve } from "node:path";
import { archive, digest, type Files, unarchive } from "./archive.ts";
import { main, type Recording } from "./diagnostics.ts";
import { buildEnvironment } from "./worker.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const packageName = "@atty303/tsugiori";
export function argumentsForRelease(
  args: readonly string[],
): { version: string; directory: string } {
  const [version, directory] = args;
  if (
    args.length !== 2 ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "") ||
    !isAbsolute(directory ?? "")
  ) {
    throw new Error(
      "Expected a stable SemVer and an absolute artifact directory",
    );
  }
  return { version, directory };
}
export function archiveName(version: string): string {
  return `tsugiori-${version}.tar.gz`;
}

export async function command(
  args: readonly string[],
  cwd = Deno.cwd(),
): Promise<void> {
  const result = await new Deno.Command(Deno.execPath(), {
    args: [...args],
    cwd,
    clearEnv: true,
    env: buildEnvironment(),
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) {
    throw new Error(`deno ${args[0]} failed with exit ${result.code}`);
  }
}

export async function withSource<T>(
  files: Files,
  fn: (directory: string) => Promise<T>,
): Promise<T> {
  // Keep extraction inside the Actions checkout so provenance finds its Git remote.
  await Deno.mkdir(".release", { recursive: true });
  const directory = await Deno.makeTempDir({
    dir: resolve(".release"),
    prefix: "source-",
  });
  try {
    for (const [path, bytes] of files) {
      const destination = join(directory, path);
      await Deno.mkdir(resolve(destination, ".."), { recursive: true });
      await Deno.writeFile(destination, bytes);
    }
    return await fn(directory);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

export function metadata(
  files: Files,
  version: string,
): { exports: Record<string, string> } {
  const bytes = files.get("deno.json");
  if (!bytes) throw new Error("Archive has no package metadata");
  const value = JSON.parse(decoder.decode(bytes));
  if (
    value.name !== packageName || value.version !== version ||
    value.workspace || value.imports || value.compilerOptions || value.tasks ||
    !value.exports || typeof value.exports !== "object"
  ) throw new Error("Unexpected package metadata");
  for (const path of Object.values(value.exports)) {
    if (
      typeof path !== "string" || !path.startsWith("./") ||
      !files.has(path.slice(2))
    ) throw new Error("Archive is missing an export");
  }
  const identity = decoder.decode(files.get("src/package_identity.ts"));
  if (
    !/export const TSUGIORI_RELEASE_COMMIT: string \| undefined = "[0-9a-f]{40}";/
      .test(identity)
  ) {
    throw new Error("Archive has no release source commit SHA");
  }
  const included = value.publish?.include;
  if (
    !Array.isArray(included) || included.length !== files.size ||
    included.some((path: unknown) =>
      typeof path !== "string" || !files.has(path)
    )
  ) throw new Error("Archive file set differs from publish include");
  return value;
}

export async function readSource(
  version: string,
  directory: string,
): Promise<Files> {
  const stat = await Deno.lstat(join(directory, archiveName(version)));
  if (!stat.isFile || stat.size > 16 * 1024 * 1024) {
    throw new Error("Invalid source artifact");
  }
  const files = unarchive(
    await Deno.readFile(join(directory, archiveName(version))),
  );
  metadata(files, version);
  return files;
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const result = await new Deno.Command("git", {
    args: [...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) throw new Error("Cannot read release source commit");
  return decoder.decode(result.stdout);
}

export async function releaseSource(
  version: string,
  cwd = Deno.cwd(),
): Promise<Files> {
  const commit = (await git(["rev-parse", "HEAD"], cwd)).trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Invalid release source commit SHA");
  }
  const workflowCommit = Deno.env.get("GITHUB_ACTIONS") === "true"
    ? Deno.env.get("GITHUB_SHA")
    : undefined;
  if (workflowCommit !== undefined && workflowCommit !== commit) {
    throw new Error("Release source commit differs from the workflow commit");
  }
  const paths = [
    "src",
    "README.md",
    "deno.json",
    ".github/actions/task-prepare",
    "mise.toml",
    "mise.lock",
  ];
  if (
    (await git([
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...paths,
    ], cwd)).trim()
  ) {
    throw new Error(
      "Release package and Action source must match the committed checkout",
    );
  }
  const files = new Map<string, Uint8Array>();
  for (
    const path
      of (await git(["ls-tree", "-r", "--name-only", commit, "src"], cwd))
        .trim().split("\n")
  ) {
    if (!/\.(ts|json)$/.test(path)) {
      throw new Error(`Unsupported package source: ${path}`);
    }
    files.set(
      path,
      encoder.encode(await git(["show", `${commit}:${path}`], cwd)),
    );
  }
  // Read the immutable Git tree, rather than possibly changing working files.
  files.set(
    "README.md",
    encoder.encode(await git(["show", `${commit}:README.md`], cwd)),
  );
  await git(["show", `${commit}:.github/actions/task-prepare/action.yml`], cwd);
  await git(["show", `${commit}:.github/actions/task-prepare/prepare.sh`], cwd);
  const identityPath = "src/package_identity.ts";
  const identity = decoder.decode(files.get(identityPath));
  const declaration =
    "export const TSUGIORI_RELEASE_COMMIT: string | undefined = undefined;";
  if (identity.split(declaration).length !== 2) {
    throw new Error("Missing release commit declaration");
  }
  files.set(
    identityPath,
    encoder.encode(
      identity.replace(
        declaration,
        `export const TSUGIORI_RELEASE_COMMIT: string | undefined = "${commit}";`,
      ),
    ),
  );
  const root = JSON.parse(await git(["show", `${commit}:deno.json`], cwd));
  if (root.name !== packageName || !root.license) {
    throw new Error("Package name/license is missing");
  }
  // Validate publication without the development workspace or import map.
  const value = {
    name: root.name,
    version,
    license: root.license,
    exports: root.exports,
    publish: { include: [...files.keys(), "deno.json"].sort() },
  };
  files.set("deno.json", encoder.encode(JSON.stringify(value, null, 2) + "\n"));
  metadata(files, version);
  return files;
}

export async function build(
  version: string,
  directory: string,
  record: Recording,
): Promise<void> {
  const files = await record.operation("build", () => releaseSource(version));
  await record.operation(
    "validate",
    () =>
      withSource(
        files,
        (cwd) => command(["publish", "--dry-run", "--allow-dirty"], cwd),
      ),
  );
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeFile(join(directory, archiveName(version)), archive(files));
}

export type RegistryMetadata = {
  manifest: Record<string, { size: number; checksum: string }>;
  exports: Record<string, string>;
};
export async function verifyContent(
  files: Files,
  registry: RegistryMetadata,
  version: string,
): Promise<void> {
  const local = metadata(files, version);
  if (
    !registry.manifest || !registry.exports ||
    Object.keys(registry.manifest).length !== files.size ||
    JSON.stringify(Object.entries(local.exports).sort()) !==
      JSON.stringify(Object.entries(registry.exports).sort())
  ) throw new Error("Published file set or exports differ");
  for (const [path, bytes] of files) {
    const remote = registry.manifest[`/${path}`];
    if (
      !remote || remote.size !== bytes.length ||
      remote.checksum !== await digest(bytes)
    ) throw new Error(`Published content differs: ${path}`);
  }
}

export async function registryMetadata(
  version: string,
): Promise<RegistryMetadata | undefined> {
  const response = await fetch(
    `https://jsr.io/${packageName}/${version}_meta.json`,
    {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
      cache: "no-store",
    },
  );
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Registry metadata request failed (${response.status})`);
  }
  return await response.json();
}

export async function publish(
  version: string,
  directory: string,
  record: Recording,
  dryRun = false,
): Promise<void> {
  const files = await record.operation(
    "archive_read",
    () => readSource(version, directory),
  );
  if (dryRun) {
    await record.operation(
      "validate",
      () =>
        withSource(
          files,
          (cwd) => command(["publish", "--dry-run", "--allow-dirty"], cwd),
        ),
    );
    return;
  }
  const existing = await record.operation(
    "registry_read",
    () => registryMetadata(version),
  );
  if (existing) {
    await record.operation(
      "registry_verify",
      () => verifyContent(files, existing, version),
    );
    console.log(`Verified existing ${packageName}@${version}`);
    return;
  }
  if (
    Deno.env.get("GITHUB_ACTIONS") !== "true" ||
    !Deno.env.get("ACTIONS_ID_TOKEN_REQUEST_URL") ||
    !Deno.env.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN") || Deno.env.get("JSR_TOKEN")
  ) {
    throw new Error(
      "Registry publishing requires GitHub Actions OIDC, without JSR_TOKEN",
    );
  }
  await record.operation(
    "registry_publish",
    () =>
      withSource(files, (cwd) => command(["publish", "--allow-dirty"], cwd)),
  );
  await record.operation("registry_verify", async () => {
    const remote = await registryMetadata(version);
    if (!remote) {
      throw new Error(
        "Published version is not visible; retry the same commit",
      );
    }
    await verifyContent(files, remote, version);
  });
}

if (import.meta.main) {
  await main(async (record) => {
    const [mode, ...args] = Deno.args;
    const dryRun = mode === "dry-run";
    const { version, directory } = argumentsForRelease(args);
    if (mode === "build") await build(version, directory, record);
    else if (mode === "publish" || dryRun) {
      await publish(version, directory, record, dryRun);
    } else throw new Error("Expected build, publish or dry-run");
  });
}
