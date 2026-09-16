import type { TsugioriConfig } from "@tsugiori/core";
import { lowerConfig } from "./authoring.ts";
import { emitWorkflow } from "./github_actions/emitter.ts";

export type GeneratedFile = Readonly<{
  path: string;
  content: string;
}>;

export async function generateFiles(
  config: TsugioriConfig,
  configArgument: string,
): Promise<readonly GeneratedFile[]> {
  const lowered = await lowerConfig(config, configArgument);
  return lowered.pipelines.map((pipeline) => ({
    path: pipeline.output,
    content: emitWorkflow(pipeline.workflow),
  }));
}
