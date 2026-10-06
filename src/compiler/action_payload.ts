import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonc } from "../runner/deps.ts";
import { runDeno } from "../task-runtime/deno.ts";
import {
  sha256Bytes,
  sourceArtifactKey,
  TASK_ARTIFACT_FORMAT_VERSION,
} from "../task-runtime/artifact.ts";
import { TSUGIORI_PACKAGE_IDENTITY } from "../package_identity.ts";
import type { GeneratedFile } from "./generator.ts";

export type ActionPayload = Readonly<{
  files: readonly GeneratedFile[];
  projectPath: string;
  entrypoint: string;
  sourceKey: string;
}>;

/** Preserve local module topology while relocating the reachable graph into the Action. */
export async function actionPayload(
  projectDirectory: string,
  entrypoint: string,
  cacheVersion: number,
): Promise<ActionPayload> {
  projectDirectory = await Deno.realPath(projectDirectory);
  const graph = JSON.parse(
    await runDeno(
      [
        "info",
        "--json",
        "--frozen=true",
        resolve(projectDirectory, entrypoint),
      ],
      projectDirectory,
      "module_graph_failed",
    ),
  ) as { modules: readonly { local?: string; specifier: string }[] };
  const localModules = graph.modules.filter((module) =>
    module.local && module.specifier.startsWith("file:")
  );
  let physicalRoot = projectDirectory;
  for (const module of localModules) {
    const path = resolve(
      await Deno.realPath(dirname(module.local!)),
      basename(module.local!),
    );
    while (outside(physicalRoot, path)) physicalRoot = dirname(physicalRoot);
  }
  const localAliases = new Map<string, string>();
  const directoryAliases = new Map<string, string>();
  for (const module of localModules) {
    const original = resolve(module.local!);
    let aliasRoot = dirname(original);
    let mappedRoot: string | undefined;
    while (true) {
      const physical = await Deno.realPath(aliasRoot);
      if (!outside(physicalRoot, physical)) mappedRoot = aliasRoot;
      if (physical === physicalRoot) break;
      const parent = dirname(aliasRoot);
      if (parent === aliasRoot) {
        if (mappedRoot === undefined) {
          throw new Error("Cannot relocate local module ancestry.");
        }
        aliasRoot = mappedRoot;
        break;
      }
      aliasRoot = parent;
    }
    // Normalize ancestor aliases such as macOS /var, but preserve the graph's
    // module aliases (link.ts and linked directories) as ordinary copied files.
    const destination = resolve(
      await Deno.realPath(aliasRoot),
      relative(aliasRoot, original),
    );
    localAliases.set(original, destination);
    localAliases.set(fileURLToPath(module.specifier), destination);
    let from = dirname(original);
    let to = dirname(destination);
    while (true) {
      directoryAliases.set(from, to);
      if (from === aliasRoot) break;
      from = dirname(from);
      to = dirname(to);
    }
  }
  const sources = [...new Set(localAliases.values())].sort();
  const paths = new Set(sources);
  let root = resolve(projectDirectory);
  while (sources.some((path) => outside(root, path))) root = dirname(root);
  // Preserve Deno's discovered project configuration, including an inherited
  // parent configuration, import maps, custom locks and workspace members.
  const configurations = new Set<string>();
  const addFile = async (path: string): Promise<boolean> => {
    try {
      if ((await Deno.stat(path)).isFile) {
        paths.add(path);
        return true;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return false;
  };
  const addConfiguration = async (directory: string): Promise<boolean> => {
    let found = false;
    for (const name of ["deno.json", "deno.jsonc"]) {
      const path = resolve(directory, name);
      if (await addFile(path)) {
        configurations.add(path);
        found = true;
      }
    }
    await addFile(resolve(directory, "deno.lock"));
    await addFile(resolve(directory, "package.json"));
    await addFile(resolve(directory, "package-lock.json"));
    return found;
  };
  let projectConfigDirectory = resolve(projectDirectory);
  while (!(await addConfiguration(projectConfigDirectory))) {
    const parent = dirname(projectConfigDirectory);
    if (parent === projectConfigDirectory) break;
    projectConfigDirectory = parent;
  }
  for (const path of sources) {
    let directory = dirname(path);
    while (!outside(root, directory)) {
      await addConfiguration(directory);
      if (directory === root) break;
      directory = dirname(directory);
    }
  }
  // Set iteration also visits newly discovered member configurations.
  for (const path of configurations) {
    const config = parseJsonc(await Deno.readTextFile(path)) as {
      importMap?: string;
      lock?: string | { path?: string };
      workspace?: readonly string[];
    };
    for (
      const reference of [
        config.importMap,
        typeof config.lock === "string"
          ? config.lock
          : typeof config.lock === "object"
          ? config.lock.path
          : undefined,
      ]
    ) {
      if (
        reference && !/^[a-z]+:/i.test(reference) &&
        !(await addFile(resolve(dirname(path), reference)))
      ) throw new Error(`Missing Action payload configuration: ${reference}`);
    }
    for (const member of config.workspace ?? []) {
      await addConfiguration(resolve(dirname(path), member));
    }
  }
  while ([...paths].some((path) => outside(root, path))) root = dirname(root);
  const files: GeneratedFile[] = [];
  const modules: { path: string; sha256: string }[] = [];
  for (const path of [...paths].sort()) {
    let content = await Deno.readFile(path);
    // Local absolute module specifiers and import-map targets must never retain
    // the author's machine path. Relative topology remains unchanged.
    if (/\.(?:[cm]?[jt]sx?|jsonc?)$/.test(path)) {
      let text = new TextDecoder().decode(content);
      text = text.replace(
        /(["'])(file:\/\/\/[^"']+|\/[^"']+)\1/g,
        (match, quote: string, target: string) => {
          let absolute: string;
          try {
            absolute = target.startsWith("file:")
              ? fileURLToPath(target)
              : target;
          } catch {
            return match;
          }
          const directory = target.endsWith("/")
            ? directoryAliases.get(resolve(absolute))
            : undefined;
          absolute = localAliases.get(absolute) ?? directory ?? absolute;
          if (!paths.has(absolute) && directory === undefined) return match;
          const local = portable(relative(dirname(path), absolute));
          return `${quote}${local.startsWith(".") ? local : `./${local}`}${
            directory === undefined ? "" : "/"
          }${quote}`;
        },
      );
      content = new TextEncoder().encode(text);
    }
    files.push({ path: `source/${portable(relative(root, path))}`, content });
    if (sources.includes(path)) {
      modules.push({
        path: portable(relative(projectDirectory, path)),
        sha256: await sha256Bytes(content),
      });
    }
  }
  modules.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    projectPath: `source/${portable(relative(root, projectDirectory)) || "."}`,
    entrypoint,
    sourceKey: await sourceArtifactKey({
      artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
      cacheVersion,
      modules,
      tsugioriPackage: TSUGIORI_PACKAGE_IDENTITY,
    }),
  };
}

function portable(path: string): string {
  return path.split(sep).join("/");
}
function outside(root: string, path: string): boolean {
  const result = relative(root, path);
  return result === ".." || result.startsWith(`..${sep}`) || isAbsolute(result);
}
