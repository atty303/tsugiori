import { configuration, workflows } from "./templates.ts";
import { TSUGIORI_PACKAGE_VERSION } from "../package_identity.ts";
import {
  DiagnosticRecorder,
  diagnosticsEnabled,
} from "../task-runtime/diagnostics.ts";

class InitError extends Error {
  constructor(readonly errorType: string, message: string) {
    super(message);
  }
}

function errorType(error: unknown): string {
  if (error instanceof InitError) return error.errorType;
  if (error instanceof Deno.errors.AlreadyExists) return "init_conflict";
  if (error instanceof Deno.errors.NotCapable) return "permission_denied";
  if (error instanceof Deno.errors.PermissionDenied) return "permission_denied";
  return "init_io_failed";
}

export async function initialize(args: readonly string[]): Promise<number> {
  const recorder = new DiagnosticRecorder(
    "init",
    TSUGIORI_PACKAGE_VERSION,
    diagnosticsEnabled(),
  );
  async function operation<T>(name: string, run: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await run();
      recorder.operation({
        name,
        status: "success",
        durationMs: performance.now() - start,
      });
      return result;
    } catch (cause) {
      recorder.operation({
        name,
        status: "error",
        errorType: errorType(cause),
        durationMs: performance.now() - start,
      });
      throw cause;
    }
  }
  const created: { name: string; identity: Deno.FileInfo }[] = [];
  try {
    await operation("init.preflight", async () => {
      if (args.length) {
        throw new InitError(
          "usage_invalid",
          "The init command takes no arguments.",
        );
      }
      for (
        const name of ["deno.json", "deno.jsonc", "deno.lock", "workflows.ts"]
      ) {
        try {
          await Deno.lstat(name);
        } catch (cause) {
          if (cause instanceof Deno.errors.NotFound) continue;
          throw cause;
        }
        throw new InitError(
          "init_conflict",
          `Cannot initialize: ${name} already exists.`,
        );
      }
    });
    for (
      const [name, text, stage] of [
        ["deno.json", configuration, "init.config.write"],
        ["workflows.ts", workflows, "init.workflow.write"],
      ]
    ) {
      await operation(stage, async () => {
        const file = await Deno.open(name, { write: true, createNew: true });
        try {
          created.push({ name, identity: await file.stat() });
          const bytes = new TextEncoder().encode(text);
          let offset = 0;
          while (offset < bytes.length) {
            offset += await file.write(bytes.subarray(offset));
          }
        } finally {
          file.close();
        }
      });
    }
    console.log("Created deno.json and workflows.ts. Next, run:");
    console.log("deno install -P");
    console.log("deno task tsugiori generate");
    await recorder.finish("success");
    return 0;
  } catch (cause) {
    console.error(
      cause instanceof Error ? cause.message : "Initialization failed.",
    );
    for (const { name, identity } of created.reverse()) {
      try {
        await operation("init.cleanup", async () => {
          const current = await Deno.lstat(name);
          if (
            !current.isFile || current.dev !== identity.dev ||
            current.ino !== identity.ino
          ) {
            throw new InitError(
              "init_cleanup_changed",
              "Created file was replaced; leaving it intact.",
            );
          }
          await Deno.remove(name);
        });
      } catch (cleanup) {
        console.error(
          `Could not clean up ${name}: ${
            cleanup instanceof Error ? cleanup.message : "I/O failure"
          }`,
        );
      }
    }
    console.error(`Diagnostic run: ${recorder.runId}`);
    await recorder.finish("error");
    return 1;
  }
}
