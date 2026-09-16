import { assert, assertEquals } from "@std/assert";

type JsonRpcMessage = Readonly<{
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}>;

type CompletionList = Readonly<{
  items: readonly Readonly<{ label: string }>[];
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

Deno.test({
  name: "Deno language server exposes only context-valid authoring candidates",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const child = new Deno.Command(Deno.execPath(), {
      args: ["lsp", "--quiet"],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const writer = child.stdin.getWriter();
    const reader = child.stdout.getReader();
    const stderr = child.stderr.text();
    const stream = new LanguageServerStream(reader);
    try {
      const rootUri = new URL("../", import.meta.url).href;
      await writeMessage(writer, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          processId: null,
          rootUri,
          capabilities: {},
          initializationOptions: { enable: true },
          workspaceFolders: [{ uri: rootUri, name: "tsugiori" }],
        },
      });
      await responseFor(stream, 1);
      await writeMessage(writer, {
        jsonrpc: "2.0",
        method: "initialized",
        params: {},
      });

      const jobIfLabels = await completionLabels(
        writer,
        stream,
        2,
        "job-if",
        "jobs.<job_id>.if",
      );
      assertIncludesExactly(jobIfLabels, [
        "always",
        "cancelled",
        "failure",
        "github",
        "inputs",
        "needs",
        "success",
        "vars",
      ]);

      const stepRunLabels = await completionLabels(
        writer,
        stream,
        3,
        "step-run",
        "jobs.<job_id>.steps.run",
      );
      assertIncludesExactly(stepRunLabels, [
        "env",
        "github",
        "hashFiles",
        "inputs",
        "job",
        "matrix",
        "needs",
        "runner",
        "secrets",
        "steps",
        "strategy",
        "vars",
      ]);

      const emptyPipelineLabels = await sourceCompletionLabels(
        writer,
        stream,
        4,
        "empty-pipeline",
        `import { pipeline } from "../packages/core/src/github_actions/mod.ts";
const empty = pipeline("ci", { output: ".github/workflows/ci.yml", events: ["push"] });
empty./*completion*/`,
      );
      assertRelevantExactly(emptyPipelineLabels, ["job"], [
        "job",
        "needs",
        "run",
        "runsOn",
        "steps",
        "task",
        "uses",
      ]);

      const jobLabels = await sourceCompletionLabels(
        writer,
        stream,
        5,
        "job-state",
        `import { pipeline } from "../packages/core/src/github_actions/mod.ts";
const empty = pipeline("ci", { output: ".github/workflows/ci.yml", events: ["push"] });
empty.job("test", ({ job }) => {
  job./*completion*/
  return job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" });
});`,
      );
      assertRelevantExactly(jobLabels, ["runsOn"], [
        "needs",
        "run",
        "runsOn",
        "steps",
        "task",
        "uses",
      ]);

      const executionLabels = await sourceCompletionLabels(
        writer,
        stream,
        6,
        "execution-state",
        `import { pipeline } from "../packages/core/src/github_actions/mod.ts";
const empty = pipeline("ci", { output: ".github/workflows/ci.yml", events: ["push"] });
empty.job("test", ({ job }) => {
  const execution = job.runsOn("ubuntu-latest");
  execution./*completion*/
  return execution.run({ name: "Test", run: "true" });
});`,
      );
      assertRelevantExactly(executionLabels, ["run", "task", "uses"], [
        "needs",
        "run",
        "runsOn",
        "steps",
        "task",
        "uses",
      ]);

      const stepLabels = await sourceCompletionLabels(
        writer,
        stream,
        7,
        "step-state",
        `import { pipeline } from "../packages/core/src/github_actions/mod.ts";
const empty = pipeline("ci", { output: ".github/workflows/ci.yml", events: ["push"] });
empty.job("test", ({ job }) => {
  const configured = job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" });
  configured./*completion*/
  return configured;
});`,
      );
      assertRelevantExactly(stepLabels, ["run", "steps", "task", "uses"], [
        "needs",
        "run",
        "runsOn",
        "steps",
        "task",
        "uses",
      ]);

      const priorJobLabels = await sourceCompletionLabels(
        writer,
        stream,
        8,
        "prior-jobs",
        `import { pipeline } from "../packages/core/src/github_actions/mod.ts";
const base = pipeline("ci", { output: ".github/workflows/ci.yml", events: ["push"] });
const withTest = base.job("test", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" }));
withTest.job("build", ({ job, jobs }) => {
  jobs./*completion*/
  return job.needs(jobs.test).runsOn("ubuntu-latest").run({ name: "Build", run: "true" });
});`,
      );
      assertRelevantExactly(priorJobLabels, ["test"], ["build", "test"]);

      await writeMessage(writer, {
        jsonrpc: "2.0",
        id: 9,
        method: "shutdown",
        params: null,
      });
      await responseFor(stream, 9);
      await writeMessage(writer, {
        jsonrpc: "2.0",
        method: "exit",
        params: null,
      });
      await writer.close();
      const status = await child.status;
      assertEquals(status.code, 0, await stderr);
    } finally {
      try {
        writer.releaseLock();
      } catch {
        // The stream was already closed after the orderly LSP shutdown.
      }
      try {
        reader.releaseLock();
      } catch {
        // The process closed stdout during the orderly LSP shutdown.
      }
      try {
        child.kill("SIGKILL");
      } catch {
        // The process already exited.
      }
    }
  },
});

async function completionLabels(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  stream: LanguageServerStream,
  id: number,
  fixtureName: string,
  scope: string,
): Promise<readonly string[]> {
  return await sourceCompletionLabels(
    writer,
    stream,
    id,
    fixtureName,
    [
      'import type { ExpressionEnvironment } from "../packages/core/src/github_actions/expression_scope.ts";',
      `declare const scope: ExpressionEnvironment<${JSON.stringify(scope)}>;`,
      "scope./*completion*/",
    ].join("\n"),
  );
}

async function sourceCompletionLabels(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  stream: LanguageServerStream,
  id: number,
  fixtureName: string,
  source: string,
): Promise<readonly string[]> {
  const marker = "/*completion*/";
  const markerOffset = source.indexOf(marker);
  assert(markerOffset >= 0);
  const beforeMarker = source.slice(0, markerOffset);
  const lines = beforeMarker.split("\n");
  const text = source.replace(marker, "");
  const uri = new URL(`./__${fixtureName}.ts`, import.meta.url).href;
  await writeMessage(writer, {
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "typescript",
        version: 1,
        text,
      },
    },
  });
  await notificationFor(stream, "textDocument/publishDiagnostics", uri);
  await writeMessage(writer, {
    jsonrpc: "2.0",
    id,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: {
        line: lines.length - 1,
        character: lines.at(-1)?.length ?? 0,
      },
      context: { triggerKind: 2, triggerCharacter: "." },
    },
  });
  const response = await responseFor(stream, id);
  assert(response.error === undefined, JSON.stringify(response.error));
  const result = response.result as
    | CompletionList
    | readonly Readonly<{
      label: string;
    }>[]
    | null;
  assert(result !== null, JSON.stringify(response));
  const items = "items" in result ? result.items : result;
  return items.map((item) => item.label);
}

function assertRelevantExactly(
  actual: readonly string[],
  expected: readonly string[],
  relevantNames: readonly string[],
): void {
  assertEquals(
    actual.filter((label) => relevantNames.includes(label)).sort(),
    [...expected].sort(),
  );
}

async function notificationFor(
  stream: LanguageServerStream,
  method: string,
  uri: string,
): Promise<JsonRpcMessage> {
  return await withTimeout(
    (async () => {
      while (true) {
        const message = await stream.read();
        if (
          message.method === method && isUriNotification(message.params, uri)
        ) {
          return message;
        }
      }
    })(),
    15_000,
    `Timed out waiting for LSP notification ${method}.`,
  );
}

function isUriNotification(params: unknown, uri: string): boolean {
  return typeof params === "object" && params !== null &&
    "uri" in params && params.uri === uri;
}

function assertIncludesExactly(
  actual: readonly string[],
  expected: readonly string[],
): void {
  const relevant = actual.filter((label) => expected.includes(label)).sort();
  assertEquals(relevant, [...expected].sort());
  const scopeNames = [
    "always",
    "cancelled",
    "env",
    "failure",
    "github",
    "hashFiles",
    "inputs",
    "job",
    "jobs",
    "matrix",
    "needs",
    "runner",
    "secrets",
    "steps",
    "strategy",
    "success",
    "vars",
  ];
  assertEquals(
    actual.filter((label) => scopeNames.includes(label)).sort(),
    [...expected].sort(),
  );
}

async function writeMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  message: unknown,
): Promise<void> {
  const body = encoder.encode(JSON.stringify(message));
  await writer.write(encoder.encode(`Content-Length: ${body.length}\r\n\r\n`));
  await writer.write(body);
}

async function responseFor(
  stream: LanguageServerStream,
  id: number,
): Promise<JsonRpcMessage> {
  return await withTimeout(
    (async () => {
      while (true) {
        const message = await stream.read();
        if (message.id === id) return message;
      }
    })(),
    15_000,
    `Timed out waiting for LSP response ${id}.`,
  );
}

class LanguageServerStream {
  readonly #reader: ReadableStreamDefaultReader<Uint8Array>;
  #buffer = new Uint8Array();

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.#reader = reader;
  }

  async read(): Promise<JsonRpcMessage> {
    while (true) {
      const headerEnd = indexOf(this.#buffer, encoder.encode("\r\n\r\n"));
      if (headerEnd >= 0) {
        const header = decoder.decode(this.#buffer.slice(0, headerEnd));
        const match = header.match(/(?:^|\r\n)Content-Length: (\d+)/i);
        if (match === null) {
          throw new Error("LSP response has no content length.");
        }
        const bodyLength = Number(match[1]);
        const bodyStart = headerEnd + 4;
        const bodyEnd = bodyStart + bodyLength;
        if (this.#buffer.length >= bodyEnd) {
          const body = this.#buffer.slice(bodyStart, bodyEnd);
          this.#buffer = this.#buffer.slice(bodyEnd);
          return JSON.parse(decoder.decode(body)) as JsonRpcMessage;
        }
      }
      const chunk = await this.#reader.read();
      if (chunk.done) throw new Error("Deno LSP closed stdout unexpectedly.");
      const next = new Uint8Array(this.#buffer.length + chunk.value.length);
      next.set(this.#buffer);
      next.set(chunk.value, this.#buffer.length);
      this.#buffer = next;
    }
  }
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer:
  for (let offset = 0; offset <= haystack.length - needle.length; offset++) {
    for (let index = 0; index < needle.length; index++) {
      if (haystack[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

async function withTimeout<Value>(
  operation: Promise<Value>,
  milliseconds: number,
  message: string,
): Promise<Value> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
