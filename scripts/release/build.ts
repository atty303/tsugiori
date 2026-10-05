import { argumentsForRelease, build } from "./package.ts";
import { main } from "./diagnostics.ts";
import { buildWorker, workerArtifact } from "./worker.ts";

if (import.meta.main) {
  await main(async (record) => {
    const { version, directory } = argumentsForRelease(Deno.args);
    await build(version, directory, record);
    await buildWorker(workerArtifact, record);
  });
}
