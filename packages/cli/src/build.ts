import { dirname, resolve, sep } from "node:path";

const VERSION = "0.1.0";

if (import.meta.main) {
  const output = option(Deno.args, "output");
  if (output === undefined) {
    console.error(
      "Usage: deno run -A packages/cli/src/build.ts --output <path>",
    );
    Deno.exit(1);
  }
  await buildCli(resolve(Deno.cwd(), output));
}

export async function buildCli(output: string): Promise<void> {
  const root = Deno.cwd();
  const mainPath = resolve(root, "packages/cli/src/main.ts");
  const temporary = await Deno.makeTempDir({ prefix: "tsugiori-cli-build-" });
  try {
    const entrypoint = resolve(temporary, "main.ts");
    await Deno.writeTextFile(
      entrypoint,
      `import { main } from ${JSON.stringify(toFileUrl(mainPath))};\n` +
        `Deno.exitCode = await main(Deno.args, ${
          JSON.stringify({ version: VERSION })
        });\n`,
    );
    await Deno.mkdir(dirname(output), { recursive: true });
    const args = [
      "compile",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-import",
      "--allow-run=deno",
      "--config",
      resolve(root, "deno.json"),
      "--frozen=true",
      "--output",
      output,
      entrypoint,
    ];
    const result = await new Deno.Command("deno", {
      args,
      cwd: root,
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!result.success) {
      throw new Error(`deno compile failed with ${result.code}.`);
    }
  } finally {
    await Deno.remove(temporary, { recursive: true });
  }
}

function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
}

function toFileUrl(path: string): string {
  const normalized = path.split(sep).join("/");
  return encodeURI(
    `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`,
  );
}
