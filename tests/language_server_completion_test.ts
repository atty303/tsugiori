import { generateG1 } from "../services/type-service/src/github/actions/g1.ts";
import { yaml } from "../services/type-service/tests/fixtures.ts";
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
        `import { definePipeline } from "../src/github_actions/mod.ts";
const empty = definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },});
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
        `import { definePipeline } from "../src/github_actions/mod.ts";
const empty = definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },});
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
        `import { definePipeline } from "../src/github_actions/mod.ts";
const empty = definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },});
empty.job("test", ({ job }) => {
  const execution = job.runsOn("ubuntu-latest");
  execution./*completion*/
  return execution.run({ name: "Test", run: "true" });
});`,
      );
      assertRelevantExactly(
        executionLabels,
        ["run", "runsOn", "task", "uses"],
        [
          "needs",
          "run",
          "runsOn",
          "steps",
          "task",
          "uses",
        ],
      );

      const stepLabels = await sourceCompletionLabels(
        writer,
        stream,
        7,
        "step-state",
        `import { definePipeline } from "../src/github_actions/mod.ts";
const empty = definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },});
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
        `import { definePipeline } from "../src/github_actions/mod.ts";
const base = definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },});
const withTest = base.job("test", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" }));
withTest.job("build", ({ job, jobs }) => {
  jobs./*completion*/
  return job.needs(jobs.test).runsOn("ubuntu-latest").run({ name: "Build", run: "true" });
});`,
      );
      assertRelevantExactly(priorJobLabels, ["test"], ["build", "test"]);

      const jobConditionLabels = await sourceCompletionLabels(
        writer,
        stream,
        9,
        "typed-job-if",
        `import { definePipeline } from "../src/github_actions/mod.ts";
definePipeline("ci", { output: ".github/workflows/ci.yml", on: { push: {  } },})
  .job("test", ({ job }) => job.runsOn("ubuntu-latest")
    .when((context) => { context./*completion*/; return context.github.ref.eq("main"); })
    .run({ name: "Test", run: "true" }));`,
      );
      assertIncludesExactly(jobConditionLabels, [
        "always",
        "cancelled",
        "failure",
        "github",
        "inputs",
        "needs",
        "success",
        "vars",
      ]);

      const triggerNames = [
        "push",
        "pull_request",
        "pull_request_target",
        "workflow_dispatch",
        "workflow_call",
      ];
      const importPipeline =
        'import { definePipeline } from "../src/github_actions/mod.ts";';
      for (
        const [index, [name, source, expected]] of [
          [
            "trigger",
            `definePipeline("ci", { output: "ci.yml", on: { /*completion*/ } });`,
            triggerNames,
          ],
          [
            "push-settings",
            `definePipeline("ci", { output: "ci.yml", on: { push: { /*completion*/ } } });`,
            ["branches", "tags"],
          ],
          [
            "pr-settings",
            `definePipeline("ci", { output: "ci.yml", on: { pull_request: { /*completion*/ } } });`,
            ["types"],
          ],
          [
            "dispatch-settings",
            `definePipeline("ci", { output: "ci.yml", on: { workflow_dispatch: { /*completion*/ } } });`,
            ["inputs"],
          ],
          [
            "call-settings",
            `definePipeline("ci", { output: "ci.yml", on: { workflow_call: { /*completion*/ } } });`,
            ["inputs", "secrets", "outputs"],
          ],
          [
            "dispatch-input",
            `definePipeline("ci", { output: "ci.yml", on: { workflow_dispatch: { inputs: { stage: { /*completion*/ } } } } });`,
            ["type", "description", "required", "default", "options"],
          ],
          [
            "call-input",
            `definePipeline("ci", { output: "ci.yml", on: { workflow_call: { inputs: { flag: { /*completion*/ } } } } });`,
            ["type", "description", "required", "default"],
          ],
        ].entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          20 + index,
          name as string,
          `${importPipeline}\n${source}`,
        );
        assertEquals([...labels].sort(), [...expected].sort(), name as string);
      }
      const inputSource = `${importPipeline}
const flow = definePipeline("ci", { output: "ci.yml", on: {
  push: {},
  workflow_dispatch: { inputs: { shared: { type: "choice", options: ["x"] }, dispatchOnly: { type: "string" } } },
  workflow_call: { inputs: { shared: { type: "boolean" }, callOnly: { type: "number" } } }
} });`;
      for (
        const [index, source] of [
          "flow.inputs./*completion*/",
          'flow.job("run", ({job}) => job.runsOn("ubuntu-latest").run({name: "Run", run: "true", env: { VALUE: ({inputs}) => inputs./*completion*/ }}));',
        ].entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          30 + index,
          `input-names-${index}`,
          `${inputSource}\n${source}`,
        );
        assertEquals(
          labels.filter((label) =>
            ["shared", "dispatchOnly", "callOnly", "missing"].includes(label)
          ).sort(),
          ["callOnly", "dispatchOnly", "shared"],
        );
      }
      for (
        const [index, [key, expected]] of [
          ["shared", ["string", "false", "true"]],
          ["dispatchOnly", ["string"]],
          ["callOnly", ['""', "number"]],
        ].entries()
      ) {
        const hover = await sourceHover(
          writer,
          stream,
          40 + index,
          `input-value-${index}`,
          `${inputSource}\nflow.inputs.${key}/*completion*/;`,
        );
        assertEquals(
          [...hover.matchAll(/Ref<([^,]+),/g)].map((match) => match[1]).sort(),
          [...expected].sort(),
          hover,
        );
      }

      const metadataUri =
        new URL("./__action_metadata.ts", import.meta.url).href;
      await writeMessage(writer, {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: metadataUri,
            languageId: "typescript",
            version: 1,
            text: generateG1(
              yaml,
              "acme/publish@v3",
              "https://github.com/acme/publish/blob/sha/action.yml",
            ),
          },
        },
      });
      await notificationFor(
        stream,
        "textDocument/publishDiagnostics",
        metadataUri,
      );
      const actionSource =
        `import { definePipeline } from "../src/github_actions/mod.ts";
import contract from "./__action_metadata.ts";
const publish = contract;`;
      const actionLabels = await sourceCompletionLabels(
        writer,
        stream,
        60,
        "action-input-completion",
        `${actionSource}\ndefinePipeline("ci", { output: "ci.yml", on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { /*completion*/ } }));`,
      );
      assertEquals(
        actionLabels.filter((key) => ["destination", "mode"].includes(key))
          .sort(),
        ["destination", "mode"],
      );
      for (
        const [index, [source, expected]] of [
          [
            `${actionSource}\ndefinePipeline("ci", { output: "ci.yml", on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { destination/*completion*/: "web" } }));`,
            "Publish destination.",
          ],
          [
            `${actionSource}\ndefinePipeline("ci", { output: "ci.yml", on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { destination: "web", mode/*completion*/: "fast" } }));`,
            "Use destination instead.",
          ],
          [`${actionSource}\ncontract/*completion*/;`, "Publish artifacts"],
          [
            `${actionSource}\ndefinePipeline("ci", { output: "ci.yml", on: { push: {} } }).job("publish", ({ job }) => { const state = job.runsOn("ubuntu-latest").uses(publish, { id: "publish", name: "Publish", with: { destination: "web" } }); state.steps.publish.outputs.url/*completion*/; return state; });`,
            "Published URL.",
          ],
          [
            `${actionSource}\ndefinePipeline("ci", { output: "ci.yml", on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { id: "publish", name: "Publish", with: { destination: "web" } }).run({ name: "Consume", run: "true", env: { URL: ({ steps }) => steps.publish.outputs.url/*completion*/ } }));`,
            "Published URL.",
          ],
        ].entries()
      ) {
        const hover = await sourceHover(
          writer,
          stream,
          61 + index,
          `action-doc-${index}`,
          source,
        );
        assert(hover.includes(expected), `Expected ${expected} in ${hover}`);
      }

      await writeMessage(writer, {
        jsonrpc: "2.0",
        id: 10,
        method: "shutdown",
        params: null,
      });
      await responseFor(stream, 10);
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

async function sourceHover(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  stream: LanguageServerStream,
  id: number,
  fixtureName: string,
  source: string,
): Promise<string> {
  const before = source.slice(0, source.indexOf("/*completion*/"));
  const lines = before.split("\n");
  const uri = new URL(`./__${fixtureName}.ts`, import.meta.url).href;
  await writeMessage(writer, {
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "typescript",
        version: 1,
        text: source.replace("/*completion*/", ""),
      },
    },
  });
  await notificationFor(stream, "textDocument/publishDiagnostics", uri);
  await writeMessage(writer, {
    jsonrpc: "2.0",
    id,
    method: "textDocument/hover",
    params: {
      textDocument: { uri },
      position: {
        line: lines.length - 1,
        character: (lines.at(-1)?.length ?? 0) - 2,
      },
    },
  });
  const response = await responseFor(stream, id);
  assert(response.error === undefined, JSON.stringify(response.error));
  return (response.result as { contents: { value: string } }).contents.value;
}

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
      'import type { ExpressionEnvironment } from "../src/github_actions/expression_scope.ts";',
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
  return items.map((item) => item.label.replace(/\?$/, ""));
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
