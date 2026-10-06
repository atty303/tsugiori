import { relative, resolve, sep } from "node:path";
import {
  sha256File,
  sourceArtifactKey,
  type SourceIdentity,
  TASK_ARTIFACT_FORMAT_VERSION,
} from "./artifact.ts";
import { TSUGIORI_PACKAGE_IDENTITY } from "../package_identity.ts";
import { runDeno } from "./deno.ts";

export async function computeSourceIdentity(
  input: Readonly<{
    projectDirectory: string;
    entrypointPath: string;
    cacheVersion: number;
  }>,
): Promise<SourceIdentity> {
  const output = await runDeno(
    ["info", "--json", "--frozen=true", input.entrypointPath],
    input.projectDirectory,
    "module_graph_failed",
  );
  const graph = JSON.parse(output) as {
    modules?: readonly { local?: string; specifier?: string }[];
  };
  const paths = new Map<string, string>();
  for (const module of graph.modules ?? []) {
    if (module.local === undefined || !module.specifier?.startsWith("file:")) {
      continue;
    }
    const path = resolve(module.local);
    paths.set(
      relative(input.projectDirectory, path).split(sep).join("/"),
      path,
    );
  }
  const modules = [];
  for (
    const [path, absolute] of [...paths].sort(([a], [b]) => a.localeCompare(b))
  ) {
    modules.push({ path, sha256: await sha256File(absolute) });
  }
  return {
    modules,
    sourceKey: await sourceArtifactKey({
      artifactFormatVersion: TASK_ARTIFACT_FORMAT_VERSION,
      cacheVersion: input.cacheVersion,
      modules,
      tsugioriPackage: TSUGIORI_PACKAGE_IDENTITY,
    }),
  };
}
