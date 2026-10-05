import { argumentsForRelease, publish } from "./package.ts";
import { main, type Recording } from "./diagnostics.ts";
import { deployWorker, workerArtifact } from "./worker.ts";

export async function publishRelease(
  version: string,
  directory: string,
  record: Recording,
  deploy = deployWorker,
): Promise<void> {
  await publish(version, directory, record);
  await deploy(workerArtifact, record);
}

if (import.meta.main) {
  await main(async (record) => {
    const { version, directory } = argumentsForRelease(Deno.args);
    await publishRelease(version, directory, record);
  });
}
