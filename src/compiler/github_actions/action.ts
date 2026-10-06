import { parse, stringify } from "../../deps.ts";
import type { LoweredCompositeAction } from "../authoring.ts";
import type { ActionPayload } from "../action_payload.ts";
import { emitStep } from "./emitter.ts";

export function emitCompositeAction(
  { action, steps, preparation }: LoweredCompositeAction,
  payload?: ActionPayload,
): string {
  const rendered = steps.map((step) => {
    if (
      payload && step.type === "uses" && step.id === preparation?.cacheStepId
    ) {
      const suffix =
        `${payload.sourceKey}-\${{ runner.os }}-\${{ runner.arch }}`;
      return emitStep({
        ...step,
        with: {
          path: `\${{ runner.temp }}/tsugiori-artifacts/${suffix}`,
          key: `tsugiori-task-${suffix}`,
        },
      });
    }
    if (
      payload && step.type === "uses" && step.id === preparation?.prepareStepId
    ) {
      const suffix =
        `${payload.sourceKey}-\${{ runner.os }}-\${{ runner.arch }}`;
      return {
        name: step.name,
        id: step.id,
        shell: "bash",
        env: {
          TSUGIORI_PROJECT_DIRECTORY:
            `\${{ github.action_path }}/.tsugiori/${payload.projectPath}`,
          TSUGIORI_ENTRYPOINT: payload.entrypoint,
          TSUGIORI_SOURCE_KEY: payload.sourceKey,
          TSUGIORI_ARTIFACT_CACHE:
            `\${{ runner.temp }}/tsugiori-artifacts/${suffix}`,
          TSUGIORI_RUNNER_OS: "${{ runner.os }}",
          TSUGIORI_RUNNER_ARCH: "${{ runner.arch }}",
          TSUGIORI_INSTALL_DENO_VERSION: "2.9.5",
          TSUGIORI_ACTION_PATH: "${{ github.action_path }}",
        },
        run: 'bash "$TSUGIORI_ACTION_PATH/.tsugiori/prepare.sh"',
      };
    }
    const emitted = emitStep(step);
    if (step.type === "run") {
      // Task invocation uses Bash; authored run steps require their own shell.
      emitted.shell = step.shell ?? "bash";
    }
    return emitted;
  });
  const outputs = Object.fromEntries(
    Object.entries(action.metadata.outputs ?? {}).map((
      [name, metadata],
    ) => [name, { ...metadata, value: action.outputValues[name] }]),
  );
  const object = {
    ...action.metadata,
    ...(action.metadata.outputs === undefined ? {} : { outputs }),
    runs: { using: "composite", steps: rendered },
  };
  const yaml = stringify(object, {
    lineWidth: 0,
    schema: "core",
    sortMapEntries: false,
    aliasDuplicateObjects: false,
  });
  // Round-trip commands through the same YAML implementation as workflows.
  const decoded = parse(yaml) as typeof object;
  if (JSON.stringify(decoded) !== JSON.stringify(object)) {
    throw new Error("Composite YAML changed metadata or step values.");
  }
  return yaml;
}
