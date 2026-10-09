import { activities } from "../src/github_actions/events.ts";
import { generateV1 } from "../services/type-service/src/github/actions/v1.ts";
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
  fn: async (t) => {
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

      const emptyWorkflowLabels = await sourceCompletionLabels(
        writer,
        stream,
        4,
        "empty-workflow",
        `import { workflow } from "../src/github_actions/mod.ts";
const empty = workflow(".github/workflows/ci.yml", { on: { push: {  } },});
empty./*completion*/`,
      );
      assertRelevantExactly(emptyWorkflowLabels, ["job"], [
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
        `import { workflow } from "../src/github_actions/mod.ts";
const empty = workflow(".github/workflows/ci.yml", { on: { push: {  } },});
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
        `import { workflow } from "../src/github_actions/mod.ts";
const empty = workflow(".github/workflows/ci.yml", { on: { push: {  } },});
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
        `import { workflow } from "../src/github_actions/mod.ts";
const empty = workflow(".github/workflows/ci.yml", { on: { push: {  } },});
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
        `import { workflow } from "../src/github_actions/mod.ts";
const base = workflow(".github/workflows/ci.yml", { on: { push: {  } },});
const withTest = base.job("test", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" }));
withTest.job("build", ({ job, jobs }) => {
  jobs./*completion*/
  return job.needs(jobs.test).runsOn("ubuntu-latest").run({ name: "Build", run: "true" });
});`,
      );
      assertRelevantExactly(priorJobLabels, ["test"], ["build", "test"]);

      const jobOutputLabels = await sourceCompletionLabels(
        writer,
        stream,
        80,
        "job-output",
        `import { workflow } from "../src/github_actions/mod.ts";
const source = workflow(".github/workflows/ci.yml", { on: { push: {} } })
  .job("hello", ({ job }) => job.runsOn("ubuntu-latest")
    .run({ id: "greet", name: "Greet", run: "true", outputs: ["message"] })
    .outputs(({ steps }) => ({ message: steps.greet.outputs.message })));
source.job("follow-up", ({ job, jobs }) => job.needs(jobs.hello)
  .runsOn("ubuntu-latest").run({ name: "Show", run: "true", env: ({ needs }) => {
    needs.hello.outputs./*completion*/
    return { MESSAGE: needs.hello.outputs.message };
  } }));`,
      );
      assertRelevantExactly(jobOutputLabels, ["message"], [
        "message",
        "greeting",
      ]);

      const jobConditionLabels = await sourceCompletionLabels(
        writer,
        stream,
        9,
        "typed-job-if",
        `import { workflow } from "../src/github_actions/mod.ts";
workflow(".github/workflows/ci.yml", { on: { push: {  } },})
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

      const triggerNames = Object.keys(activities);
      const importWorkflow =
        'import { workflow } from "../src/github_actions/mod.ts";';
      for (
        const [index, [name, source, expected]] of [
          [
            "trigger",
            `workflow("ci.yml", { on: { /*completion*/ } });`,
            triggerNames,
          ],
          [
            "push-settings",
            `workflow("ci.yml", { on: { push: { /*completion*/ } } });`,
            [
              "branches",
              '"branches-ignore"',
              "tags",
              '"tags-ignore"',
              "paths",
              '"paths-ignore"',
            ],
          ],
          [
            "pr-settings",
            `workflow("ci.yml", { on: { pull_request: { /*completion*/ } } });`,
            [
              "types",
              "branches",
              '"branches-ignore"',
              "paths",
              '"paths-ignore"',
            ],
          ],
          [
            "dispatch-settings",
            `workflow("ci.yml", { on: { workflow_dispatch: { /*completion*/ } } });`,
            ["inputs"],
          ],
          [
            "call-settings",
            `workflow("ci.yml", { on: { workflow_call: { /*completion*/ } } });`,
            ["inputs", "secrets", "outputs"],
          ],
          [
            "dispatch-input",
            `workflow("ci.yml", { on: { workflow_dispatch: { inputs: { stage: { /*completion*/ } } } } });`,
            ["type", "description", "required", "default", "options"],
          ],
          [
            "call-input",
            `workflow("ci.yml", { on: { workflow_call: { inputs: { flag: { /*completion*/ } } } } });`,
            ["type", "description", "required", "default"],
          ],
        ].entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          20 + index,
          name as string,
          `${importWorkflow}\n${source}`,
        );
        assertEquals([...labels].sort(), [...expected].sort(), name as string);
      }
      const inputSource = `${importWorkflow}
const flow = workflow("ci.yml", { on: {
  push: {},
  workflow_dispatch: { inputs: { shared: { type: "choice", options: ["x"] }, dispatchOnly: { type: "string" } } },
  workflow_call: { inputs: { shared: { type: "boolean" }, callOnly: { type: "number" } } }
} });`;
      for (
        const [index, source] of [
          "flow.inputs./*completion*/",
          'flow.job("run", ({job}) => job.runsOn("ubuntu-latest").run({name: "Run", run: "true", env: ({ inputs }) => ({ VALUE: inputs./*completion*/ })}));',
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
          ["shared", ["string | boolean"]],
          ["dispatchOnly", ["string"]],
          ["callOnly", ['number | ""']],
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

      const singleEventSource = `${importWorkflow}
workflow("ci.yml", {on:{push:{}}}).job("check",({job})=>job.runsOn("ubuntu-latest").run({name:"Check",run:"true",env:({github})=>{const payload=github.event; /*probe*/ return {REF:payload.ref};}}));`;
      const singleHover = await sourceHover(
        writer,
        stream,
        155,
        "single-event-payload",
        singleEventSource.replace("/*probe*/", "payload/*completion*/;"),
      );
      assert(
        singleHover.includes("EventRef<") && singleHover.length < 200 &&
          !singleHover.includes("..."),
        singleHover,
      );
      const singleLabels = await sourceCompletionLabels(
        writer,
        stream,
        156,
        "single-event-completion",
        singleEventSource.replace("/*probe*/", "payload./*completion*/"),
      );
      assert(
        singleLabels.includes("ref") && singleLabels.includes("commits") &&
          !singleLabels.includes("issue"),
      );
      const eventSource = `${
        importWorkflow.replace("workflow }", "workflow, eventIs }")
      }
workflow("ci.yml", { on: {push: {}, issues: {}} }).job("report", ({job}) => job.runsOn("ubuntu-latest")
  .when(({github}) => eventIs(github,"issues"))
  .run({id:"report", name:"Report", run:"true", env: ({github}) => {
    const issue = github.event.issue;
    /*probe*/
    return { TITLE: issue.title };
  } }));`;
      const eventCompletion = await sourceCompletionLabels(
        writer,
        stream,
        150,
        "event-payload",
        eventSource.replace("/*probe*/", "issue./*completion*/"),
      );
      assert(eventCompletion.includes("title"));
      assert(!eventCompletion.includes("ref"));
      const eventHover = await sourceHover(
        writer,
        stream,
        151,
        "event-payload-hover",
        eventSource.replace("/*probe*/", "issue.title/*completion*/;"),
      );
      const payloadHover = await sourceHover(
        writer,
        stream,
        153,
        "principal-payload-hover",
        eventSource.replace("/*probe*/", "github.event/*completion*/;"),
      );
      assert(
        payloadHover.length < 400 && payloadHover.includes("EventRef<") &&
          !payloadHover.includes("..."),
        payloadHover,
      );
      const issueHover = await sourceHover(
        writer,
        stream,
        154,
        "nested-payload-hover",
        eventSource.replace("/*probe*/", "issue/*completion*/;"),
      );
      assert(
        issueHover.length < 400 && !issueHover.includes("..."),
        issueHover,
      );
      assert(
        eventHover.includes("EventRef<") && eventHover.includes("title"),
        eventHover,
      );
      assert(!eventHover.includes("any"), eventHover);
      const guardSignature = await sourceHover(
        writer,
        stream,
        152,
        "event-guard-signature",
        `${importWorkflow.replace("workflow }", "workflow, eventIs }")}
workflow("ci.yml", {on:{push:{},issues:{}}}).job("report",({job})=>job.runsOn("ubuntu-latest").when(({github})=>eventIs(github,/*completion*/)).run({name:"Report",run:"true"}));`,
        false,
        "signatureHelp",
      );
      assert(
        guardSignature.includes("push") && guardSignature.includes("issues"),
        guardSignature,
      );
      assert(!guardSignature.includes("..."), guardSignature);

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
            text: generateV1(
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
        `import { workflow } from "../src/github_actions/mod.ts";
import contract from "./__action_metadata.ts";
const publish = contract;`;
      const actionLabels = await sourceCompletionLabels(
        writer,
        stream,
        60,
        "action-input-completion",
        `${actionSource}\nworkflow("ci.yml", { on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { /*completion*/ } }));`,
      );
      assertEquals(
        actionLabels.filter((key) => ["destination", "mode"].includes(key))
          .sort(),
        ["destination", "mode"],
      );
      for (
        const [index, [source, expected]] of [
          [
            `${actionSource}\nworkflow("ci.yml", { on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { destination/*completion*/: "web" } }));`,
            "Publish destination.",
          ],
          [
            `${actionSource}\nworkflow("ci.yml", { on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { with: { destination: "web", mode/*completion*/: "fast" } }));`,
            "Use destination instead.",
          ],
          [`${actionSource}\ncontract/*completion*/;`, "Publish artifacts"],
          [
            `${actionSource}\nworkflow("ci.yml", { on: { push: {} } }).job("publish", ({ job }) => { const state = job.runsOn("ubuntu-latest").uses(publish, { id: "publish", name: "Publish", with: { destination: "web" } }); state.steps.publish.outputs.url/*completion*/; return state; });`,
            "Published URL.",
          ],
          [
            `${actionSource}\nworkflow("ci.yml", { on: { push: {} } }).job("publish", ({ job }) => job.runsOn("ubuntu-latest").uses(publish, { id: "publish", name: "Publish", with: { destination: "web" } }).run({ name: "Consume", run: "true", env: ({ steps }) => ({ URL: steps.publish.outputs.url/*completion*/ }) }));`,
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

      const emptyTaskSource =
        `import { workflow } from "../src/github_actions/mod.ts";
const flow = workflow("empty.yml", { on: { push: {} } });`;
      const emptyHover = await sourceHover(
        writer,
        stream,
        80,
        "empty-task-context",
        `${emptyTaskSource} flow.job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Empty", run: (context) => { context/*completion*/; } }));`,
        true,
      );
      assert(emptyHover.includes("TaskContext<E, E,"), emptyHover);
      const emptySignature = await sourceHover(
        writer,
        stream,
        81,
        "empty-task-signature",
        `${emptyTaskSource} flow.job("test", ({ job }) => job.runsOn("ubuntu-latest").task(/*completion*/{ name: "Empty", run: () => {} }));`,
        true,
        "signatureHelp",
      );
      assert(
        emptySignature.includes("TaskOptions<undefined, E, E,"),
        emptySignature,
      );

      const defaultTextHover = await sourceHover(
        writer,
        stream,
        82,
        "default-text-input",
        `${emptyTaskSource} flow.job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Text", inputs: ({ github }) => ({ sha: { from: github.sha } }), outputs: { text: { required: true } }, run: async ({ inputs, outputs }) => { const value = inputs.sha; value/*completion*/; await outputs.set("text", value); } }));`,
        true,
      );
      assert(
        defaultTextHover.includes("const value: string"),
        defaultTextHover,
      );
      const inheritedJsonHover = await sourceHover(
        writer,
        stream,
        83,
        "inherited-json-input",
        `import { workflow, jsonValue } from "../src/github_actions/mod.ts";
const items = jsonValue({ parse(value: unknown): string[] { return value as string[]; } });
workflow("json.yml", { on: { push: {} } }).job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "make", name: "Make", if: undefined, outputs: { items: { contract: items, required: true } }, run: () => {} }).task({ name: "Read", inputs: ({ steps }) => ({ items: { from: steps.make.outputs.at("items") } }), run: ({ inputs }) => { const value = inputs.items; value/*completion*/; } }));`,
        true,
      );
      assert(
        inheritedJsonHover.includes("const value: string[]"),
        inheritedJsonHover,
      );
      const namedHandlerHover = await sourceHover(
        writer,
        stream,
        87,
        "named-handler-input",
        `import { workflow, jsonValue, present } from "../src/github_actions/mod.ts";
const items = jsonValue({ parse(value: unknown): readonly string[] { return value as string[]; } });
const consume = (_: { inputs: { items: readonly string[] } }) => {};
workflow("named.yml", { on: { push: {} } }).job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "make", name: "Make", outputs: { items: { contract: items, required: false } }, run: () => {} }).task({ name: "Read", if: ({ steps }) => present(steps.make.outputs.items), inputs: ({ steps }) => { const value = steps.make.outputs.items; value/*completion*/; return { items: { from: value } }; }, run: consume }));`,
        true,
      );
      assert(
        namedHandlerHover.includes("TypedReference<readonly string[]"),
        namedHandlerHover,
      );
      const widenedJsonHover = await sourceHover(
        writer,
        stream,
        84,
        "widened-json-input",
        `import { workflow, jsonValue, type Expression } from "../src/github_actions/mod.ts";
const items = jsonValue({ parse(value: unknown): string[] { return value as string[]; } });
const widen = (source: Expression<string>): Expression<string> => source;
workflow("json.yml", { on: { push: {} } }).job("make", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "make", name: "Make", outputs: { items: { contract: items, required: true } }, run: () => {} }).outputs(({ steps }) => ({ items: widen(steps.make.outputs.items) }))).job("read", ({ job, jobs }) => job.needs(jobs.make).runsOn("ubuntu-latest").task({ name: "Read", inputs: ({ needs }) => ({ items: { from: needs.make.outputs.items } }), run: ({ inputs }) => { const value = inputs.items; value/*completion*/; } }));`,
        true,
      );
      assert(
        widenedJsonHover.includes("const value: unknown"),
        widenedJsonHover,
      );

      const computedPropertyHover = await sourceHover(
        writer,
        stream,
        85,
        "computed-property-input",
        `import { workflow, fromJSON, literal } from "../src/github_actions/mod.ts";
workflow("computed.yml", { on: { push: {} } }).job("test", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Read", inputs: { version: { from: fromJSON(literal('{"version":"v1"}')).as<{ version: string }>().at("version") } }, run: ({ inputs }) => { const value = inputs.version; value/*completion*/; } }));`,
        true,
      );
      assert(
        computedPropertyHover.includes("const value: string"),
        computedPropertyHover,
      );

      const displays: Record<string, string> = {};
      for (const [index, fixture] of displayFixtures().entries()) {
        const hover = await sourceHover(
          writer,
          stream,
          100 + index,
          `display-${fixture.name}`,
          fixture.source,
          true,
          fixture.kind,
        );
        const code = fixture.kind === "signatureHelp"
          ? hover
          : hover.match(/```(?:typescript|tsx)\n([\s\S]*?)```/)?.[1]?.trim();
        assert(code, hover);
        displays[fixture.name] = code;
      }
      // These inferred states must stay fully visible, rather than appearing
      // shorter because TypeScript hit its display truncation limit.
      for (
        const name of [
          "workflow-draft",
          "workflow",
          "job-callback",
          "job-needs",
          "execution",
          "steps",
          "typed-task",
          "task-callback",
          "composite-start",
          "composite-steps",
          "expression-callback",
          "simple-step-signature",
        ]
      ) {
        assert(!displays[name].includes("..."), `${name}: ${displays[name]}`);
      }
      for (
        const [name, limit] of [["workflow", 500], ["steps", 500], [
          "typed-task",
          400,
        ], ["composite-steps", 550]] as const
      ) {
        assert(
          displays[name].length <= limit,
          `${name}: ${displays[name].length} characters exceeds ${limit}`,
        );
      }
      const settingsPrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
const ci = workflow(".github/workflows/settings.yml", { on: { push: {} } });
`;
      for (
        const [index, [field, expected]] of ([
          ["name", ["github", "inputs", "vars", "needs", "strategy", "matrix"]],
          ["url", [
            "github",
            "inputs",
            "vars",
            "needs",
            "strategy",
            "matrix",
            "job",
            "runner",
            "env",
            "steps",
          ]],
        ] as const).entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          310 + index,
          `environment-${field}`,
          settingsPrefix +
            `ci.job("deploy", ({ job }) => job.runsOn("ubuntu-latest").environment({ ${
              field === "url" ? 'name: "dev", ' : ""
            }${field}: context => context./*completion*/ }));`,
        );
        assertIncludesExactly(labels, [...expected]);
      }
      const settingHover = await sourceHover(
        writer,
        stream,
        312,
        "structured-environment-state",
        settingsPrefix +
          `const built = ci.job("deploy", ({ job }) => job.runsOn({ group: "deploy", labels: ["linux"] }).run({ id: "deploy", name: "Deploy", run: "true", outputs: ["url"] }).environment({ name: "dev", url: ({ steps }) => steps.deploy.outputs.url }));
built/*completion*/;`,
      );
      assert(settingHover.includes("Workflow<"), settingHover);
      assert(!settingHover.includes("..."), settingHover);
      const environmentSignature = await sourceHover(
        writer,
        stream,
        313,
        "environment-signature",
        settingsPrefix +
          `ci.job("deploy", ({ job }) => job.runsOn("ubuntu-latest").run({ id: "deploy", name: "Deploy", run: "true", outputs: ["url"] }).environment(/*completion*/));`,
        false,
        "signatureHelp",
      );
      assert(
        environmentSignature.includes("EnvironmentValue<"),
        environmentSignature,
      );
      const matrixPrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
const ci = workflow("matrix.yml", { on: { push: {} } });
`;
      const matrixSource = matrixPrefix +
        `ci.job("test", ({ job }) => job.runsOn("ubuntu-latest")
.strategy({ matrix: { target: [{ version: 20 }, { version: 22, experimental: true }], os: ["ubuntu-latest"], include: [{ target: { version: 24 } }] }, maxParallel: 2 })
.continueOnError(({ matrix }) => matrix.target.experimental.or(false))
.run({ name: "Test", run: "true", env: ({ matrix }) => { BODY return {}; } }));`;
      const matrixLabels = await sourceCompletionLabels(
        writer,
        stream,
        350,
        "object-matrix",
        matrixSource.replace("BODY", "matrix.target./*completion*/;"),
      );
      assert(matrixLabels.includes("version"), JSON.stringify(matrixLabels));
      assert(
        matrixLabels.includes("experimental"),
        JSON.stringify(matrixLabels),
      );
      for (
        const [index, [field, value]] of [["version", "20 | 22 | 24"], [
          "experimental",
          "undefined",
        ]].entries()
      ) {
        const hover = await sourceHover(
          writer,
          stream,
          351 + index,
          `matrix-${field}`,
          matrixSource.replace(
            "BODY",
            `const value = matrix.target.${field}; value/*completion*/;`,
          ),
          true,
        );
        assert(hover.includes(value), hover);
        assert(!hover.includes("..."), hover);
      }
      const matrixSignature = await sourceHover(
        writer,
        stream,
        353,
        "matrix-strategy-signature",
        matrixPrefix +
          `ci.job("test", ({ job }) => job.runsOn("ubuntu-latest").strategy(/*completion*/{ matrix: { target: [{ version: 22 }] }, maxParallel: 2 }).run({ name: "Test", run: "true" }));`,
        true,
        "signatureHelp",
      );
      assert(matrixSignature.includes("Strategy<"), matrixSignature);
      assert(!matrixSignature.includes("..."), matrixSignature);
      const toleranceLabels = await sourceCompletionLabels(
        writer,
        stream,
        354,
        "job-tolerance",
        matrixPrefix +
          `ci.job("test", ({ job }) => job.runsOn("ubuntu-latest").continueOnError(context => context./*completion*/).run({ name: "Test", run: "true" }));`,
      );
      assertIncludesExactly(toleranceLabels, [
        "github",
        "needs",
        "strategy",
        "matrix",
        "vars",
        "inputs",
      ]);
      const servicesPrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
const ci = workflow("containers.yml", { on: { push: {} } });
`;
      const serviceBody = servicesPrefix + `ci.job("test", ({ job }) => {
const state = job.runsOn("ubuntu-latest").services({ db: { image: "postgres:17", ports: [5432] }, cache: { image: "redis:7" } });
BODY
return state.run({ name: "Test", run: "true", env: ({ job }) => { EXPRESSION return {}; } });
});`;
      const serviceLabels = await sourceCompletionLabels(
        writer,
        stream,
        370,
        "declared-services",
        serviceBody.replace("BODY", "").replace(
          "EXPRESSION",
          "job.services./*completion*/;",
        ),
      );
      assertRelevantExactly(serviceLabels, ["db", "cache"], [
        "db",
        "cache",
        "missing",
      ]);
      const containerHover = await sourceHover(
        writer,
        stream,
        371,
        "container-services-state",
        serviceBody.replace("BODY", "state/*completion*/;").replace(
          "EXPRESSION",
          "",
        ),
      );
      assert(
        /services: "(?:db" \| "cache|cache" \| "db)"/.test(containerHover),
        containerHover,
      );
      assert(!containerHover.includes("..."), containerHover);
      const serviceSignature = await sourceHover(
        writer,
        stream,
        372,
        "services-signature",
        servicesPrefix +
          `ci.job("test", ({ job }) => job.runsOn("ubuntu-latest").services(/*completion*/{ db: { image: "postgres:17" } }).run({ name: "Test", run: "true" }));`,
        false,
        "signatureHelp",
      );
      assert(serviceSignature.includes("ServiceDefinition"), serviceSignature);
      assert(!serviceSignature.includes("..."), serviceSignature);
      const servicePortHover = await sourceHover(
        writer,
        stream,
        373,
        "service-port-hover",
        serviceBody.replace("BODY", "").replace(
          "EXPRESSION",
          'const port = job.services.db.ports["5432"]; port/*completion*/;',
        ),
      );
      assert(servicePortHover.includes("string"), servicePortHover);
      const snapshotPrefix =
        `import { workflow, startsWith } from "../src/github_actions/mod.ts";
const ci = workflow("ci.yml", { on: { push: {} } });
`;
      const cacheLabels = await sourceCompletionLabels(
        writer,
        stream,
        374,
        "cache-mode-enum",
        snapshotPrefix +
          `ci.job("image", ({ job }) => job.runsOn("image-generation").cacheMode(/*completion*/).run({ name: "Build", run: "true" }));`,
      );
      for (const mode of ["read", "write", "write-only", "none"]) {
        assert(cacheLabels.includes(`"${mode}"`), cacheLabels.join(","));
      }
      const snapshotLabels = await sourceCompletionLabels(
        writer,
        stream,
        375,
        "snapshot-context",
        snapshotPrefix +
          `ci.job("image", ({ job }) => job.runsOn("image-generation").snapshot({ imageName: "ci", if: context => { context./*completion*/; return startsWith(context.github.ref, "refs/heads/"); } }).run({ name: "Build", run: "true" }));`,
      );
      assertRelevantExactly(snapshotLabels, ["github"], [
        "github",
        "secrets",
        "steps",
        "matrix",
        "needs",
        "runner",
        "vars",
        "inputs",
      ]);
      const snapshotSignature = await sourceHover(
        writer,
        stream,
        376,
        "snapshot-signature",
        snapshotPrefix +
          `ci.job("image", ({ job }) => job.runsOn("image-generation").snapshot(/*completion*/{ imageName: "ci" }).run({ name: "Build", run: "true" }));`,
        false,
        "signatureHelp",
      );
      assert(
        snapshotSignature.includes("SnapshotDefinition"),
        snapshotSignature,
      );
      assert(!snapshotSignature.includes("..."), snapshotSignature);
      const cacheHover = await sourceHover(
        writer,
        stream,
        377,
        "cache-mode-hover",
        snapshotPrefix +
          `ci.job("image", ({ job }) => job.runsOn("image-generation").cacheMode/*completion*/("read").run({ name: "Build", run: "true" }));`,
      );
      assert(cacheHover.includes("CacheMode"), cacheHover);
      assert(!cacheHover.includes("..."), cacheHover);
      const backgroundPrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
workflow("background.yml", { on: { push: {} } }).job("build", ({ job }) => {
const started = job.runsOn("ubuntu-latest").run({ id: "build", name: "Build", run: "true", outputs: ["version"], background: true });
const joined = started.wait(started.steps.build);
`;
      for (
        const [index, [name, expression, outputs]] of ([
          ["pending-background", "started.steps.build", false],
          ["joined-background", "joined.steps.build", true],
        ] as const).entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          390 + index,
          name,
          backgroundPrefix + `${expression}./*completion*/; return joined; });`,
        );
        assertEquals(labels.includes("outputs"), outputs, labels.join(","));
      }
      const backgroundHover = await sourceHover(
        writer,
        stream,
        392,
        "background-state-hover",
        backgroundPrefix + `started/*completion*/; return joined; });`,
        true,
      );
      assert(backgroundHover.includes("Background<"), backgroundHover);
      assert(!backgroundHover.includes("..."), backgroundHover);
      const waitSignature = await sourceHover(
        writer,
        stream,
        393,
        "wait-signature",
        backgroundPrefix +
          `started.wait(/*completion*/started.steps.build); return joined; });`,
        false,
        "signatureHelp",
      );
      assert(waitSignature.includes("Background<"), waitSignature);
      assert(!waitSignature.includes("..."), waitSignature);
      const groupLabels = await sourceCompletionLabels(
        writer,
        stream,
        394,
        "parallel-builder",
        `import { workflow } from "../src/github_actions/mod.ts";
workflow("parallel.yml", { on: { push: {} } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").parallel(group => { group./*completion*/; return [group.run({ id: "one", name: "One", run: "true" })]; }));`,
      );
      assertEquals([...groupLabels].sort(), ["run", "task", "uses"]);
      const groupHover = await sourceHover(
        writer,
        stream,
        395,
        "parallel-group-hover",
        `import { workflow } from "../src/github_actions/mod.ts";
workflow("parallel.yml", { on: { push: {} } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").parallel(group => { group/*completion*/; return [group.run({ id: "one", name: "One", run: "true" })]; }));`,
        true,
      );
      assert(groupHover.includes("Parallel<"), groupHover);
      assert(!groupHover.includes("..."), groupHover);
      const contextPrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
workflow("context.yml", { on: { push: {} } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Check", run: "true", env: ({ github, job, runner, secrets }) => { `;
      for (
        const [index, [namespace, fields]] of ([
          ["github", ["artifacts", "artifacts_list"]],
          ["job", [
            "check_run_id",
            "workflow_ref",
            "workflow_sha",
            "workflow_repository",
            "workflow_file_path",
          ]],
          ["runner", ["environment"]],
          ["secrets", ["GITHUB_TOKEN"]],
        ] as const).entries()
      ) {
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          410 + index,
          `context-${namespace}`,
          contextPrefix + `${namespace}./*completion*/; return {}; } }));`,
        );
        for (const field of fields) {
          assert(labels.includes(field), `${namespace}.${field}`);
        }
      }
      for (
        const [index, [name, property, expected]] of ([
          ["check-run-hover", "job.check_run_id", "number"],
          ["runner-environment-hover", "runner.environment", "github-hosted"],
          ["token-hover", "secrets.GITHUB_TOKEN", "string"],
        ] as const).entries()
      ) {
        const hover = await sourceHover(
          writer,
          stream,
          414 + index,
          name,
          contextPrefix + `${property}/*completion*/; return {}; } }));`,
          true,
        );
        assert(hover.includes(expected), hover);
        assert(!hover.includes("..."), hover);
      }
      const strategyLabels = await sourceCompletionLabels(
        writer,
        stream,
        430,
        "native-strategy-context",
        contextPrefix.replace("runner, secrets", "runner, secrets, strategy") +
          `strategy./*completion*/; return {}; } }));`,
      );
      for (
        const key of ["fail-fast", "job-index", "job-total", "max-parallel"]
      ) assert(strategyLabels.includes(key), key);
      for (
        const key of ["fail_fast", "job_index", "job_total", "max_parallel"]
      ) assert(!strategyLabels.includes(key), key);
      for (const [index, field] of ["job", "token"].entries()) {
        const runnerHover = await sourceHover(
          writer,
          stream,
          431 + index,
          `runner-github-${field}`,
          contextPrefix + `github.${field}/*completion*/; return {}; } }));`,
          true,
        );
        assert(
          runnerHover.includes(`Ref<string, "github.${field}">`),
          runnerHover,
        );
        const serverHover = await sourceHover(
          writer,
          stream,
          433 + index,
          `server-github-${field}`,
          `import { workflow } from "../src/github_actions/mod.ts";
workflow("phase.yml", { on: { push: {} }, concurrency: ({github}) => { github.${field}/*completion*/; return {group:"test",cancelInProgress:false}; } });`,
          true,
        );
        assert(
          serverHover.includes(`Ref<null, "github.${field}">`),
          serverHover,
        );
      }
      const fixturePrefix =
        `import { workflow } from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";
const flow = workflow("context.yml", { on: { push: {} } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ id: "check", name: "Check", run: "true" }));
scenario(flow, test => test.job("build", job => { `;
      for (
        const [index, [method, type]] of ([
          ["jobRuntime", "JobRuntime"],
          ["runner", "RunnerRuntime"],
        ] as const).entries()
      ) {
        const signature = await sourceHover(
          writer,
          stream,
          417 + index,
          `${method}-signature`,
          fixturePrefix + `job.${method}(/*completion*/{}); }));`,
          true,
          "signatureHelp",
        );
        assert(signature.includes(type), signature);
        assert(!signature.includes("..."), signature);
      }
      const stepSignature = await sourceHover(
        writer,
        stream,
        419,
        "step-github-signature",
        fixturePrefix + `job.step("check").github(/*completion*/{}); }));`,
        true,
        "signatureHelp",
      );
      assert(stepSignature.includes("StepGitHub"), stepSignature);
      assert(!stepSignature.includes("..."), stepSignature);
      await t.assertSnapshot(displays);
      assert(
        await t.step(
          "workflow env completion, hover and signature",
          async () => {
            const workflowEnvPrefix =
              `import { workflow } from "../src/github_actions/mod.ts";
  workflow("env.yml", {
    on: { workflow_dispatch: { inputs: {
      dry_run: { type: "boolean", default: false },
      count: { type: "number", default: 1 },
    } } },
    vars: ["REGION"],
    secrets: ["DEPLOY_TOKEN"],
    env: (context) => { `;
            const workflowEnvLabels = await sourceCompletionLabels(
              writer,
              stream,
              430,
              "workflow-env-context",
              workflowEnvPrefix + `context./*completion*/; return {}; } });`,
            );
            assertIncludesExactly(workflowEnvLabels, [
              "github",
              "vars",
              "secrets",
              "inputs",
            ]);
            for (
              const [index, [namespace, names]] of ([
                ["vars", ["REGION"]],
                ["secrets", ["DEPLOY_TOKEN", "GITHUB_TOKEN"]],
                ["inputs", ["dry_run", "count"]],
              ] as const).entries()
            ) {
              const labels = await sourceCompletionLabels(
                writer,
                stream,
                431 + index,
                `workflow-env-${namespace}`,
                workflowEnvPrefix +
                  `context.${namespace}./*completion*/; return {}; } });`,
              );
              assertRelevantExactly(labels, names, [...names, "UNKNOWN"]);
            }
            for (
              const [index, [property, expected]] of ([
                ["inputs.dry_run", "boolean"],
                ["inputs.count", "number"],
                ["vars.REGION", "string"],
                ["secrets.DEPLOY_TOKEN", "string"],
                ["secrets.GITHUB_TOKEN", "string"],
                ["github.job", "string"],
                ["github.token", "string"],
              ] as const).entries()
            ) {
              const hover = await sourceHover(
                writer,
                stream,
                435 + index,
                `workflow-env-hover-${index}`,
                workflowEnvPrefix +
                  `return { VALUE: context.${property}/*completion*/ }; } });`,
                true,
              );
              assert(hover.includes(expected), hover);
              assert(!hover.includes("..."), hover);
            }
            const workflowEnvSignature = await sourceHover(
              writer,
              stream,
              442,
              "workflow-env-signature",
              `import { workflow } from "../src/github_actions/mod.ts";
workflow(/*completion*/"env.yml", {
  on: { push: {} },
  vars: ["REGION"],
  secrets: ["DEPLOY_TOKEN"],
  env: ({ github, vars, secrets }) => ({
    SHA: github.sha, REGION: vars.REGION, TOKEN: secrets.DEPLOY_TOKEN,
  }),
});`,
              true,
              "signatureHelp",
            );
            assert(
              workflowEnvSignature.includes("WorkflowArgs"),
              workflowEnvSignature,
            );
            assert(
              workflowEnvSignature.includes('"REGION"'),
              workflowEnvSignature,
            );
            assert(
              workflowEnvSignature.includes('"DEPLOY_TOKEN"'),
              workflowEnvSignature,
            );
            assert(!workflowEnvSignature.includes("..."), workflowEnvSignature);
          },
        ),
      );

      assert(
        await t.step(
          "scenario value fixture completion, hover and signatures",
          async () => {
            const prefix =
              `import { workflow } from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";
const flow = workflow("fixtures.yml", { on: { push: {} } }).job("build", ({job}) =>
  job.runsOn("ubuntu-latest").strategy({matrix:{stage:["dev", "prd"]}})
    .task({id:"read",name:"Read",inputs:({github})=>({text:{from:github.sha}}),outputs:{},run:()=>{}}));
scenario(flow, test => { test.job("build", job => { `;
            const contextPrefix = prefix +
              `job.step("read").fixture(context => { `;
            const end = `return {}; }); }); });`;
            const labels = await sourceCompletionLabels(
              writer,
              stream,
              6000,
              "scenario-fixture-context",
              contextPrefix + `context./*completion*/; ` + end,
            );
            assertEquals(
              [...labels].sort(),
              [
                "inputs",
                "env",
                "matrix",
                "run",
                "strategy",
                "tokenPermissions",
              ].sort(),
            );
            const strategyLabels = await sourceCompletionLabels(
              writer,
              stream,
              6001,
              "scenario-fixture-strategy",
              contextPrefix + `context.strategy./*completion*/; ` + end,
            );
            assertEquals(
              [...strategyLabels].sort(),
              [
                "fail-fast",
                "job-index",
                "job-total",
                "max-parallel",
              ].sort(),
            );
            const matrixLabels = await sourceCompletionLabels(
              writer,
              stream,
              6002,
              "scenario-fixture-matrix",
              contextPrefix + `context.matrix./*completion*/; ` + end,
            );
            assertEquals(matrixLabels, ["stage"]);
            const jobLabels = await sourceCompletionLabels(
              writer,
              stream,
              6003,
              "scenario-fixture-job",
              prefix + `job./*completion*/; }); });`,
            );
            assert(jobLabels.includes("completionOrder"));
            assert(!jobLabels.includes("expression"));
            const stepLabels = await sourceCompletionLabels(
              writer,
              stream,
              6004,
              "scenario-fixture-step",
              prefix + `job.step("read")./*completion*/; }); });`,
            );
            assert(stepLabels.includes("hashFiles"));
            assert(stepLabels.includes("replaceInherited"));
            assert(!stepLabels.includes("expression"));
            for (
              const [i, [property, expected]] of ([
                ["strategy", "ResolvedStrategy"],
                ["tokenPermissions", "TokenPermissions"],
                ["inputs.text", "string"],
                ["matrix.stage", '"dev" | "prd"'],
              ] as const).entries()
            ) {
              const hover = await sourceHover(
                writer,
                stream,
                6010 + i,
                `scenario-fixture-hover-${i}`,
                contextPrefix +
                  `const value = context.${property}/*completion*/; ` + end,
                true,
              );
              assert(hover.includes(expected), hover);
              assert(!hover.includes("..."), hover);
            }
            for (
              const [i, [call, expected]] of ([
                [
                  `job.step("read").hashFiles(/*completion*/["deno.lock"], "hash");`,
                  "readonly [string, ...string[]]",
                ],
                [
                  `job.completionOrder(/*completion*/[1,0]);`,
                  "readonly number[]",
                ],
              ] as const).entries()
            ) {
              const signature = await sourceHover(
                writer,
                stream,
                6020 + i,
                `scenario-fixture-signature-${i}`,
                prefix + call + ` }); });`,
                true,
                "signatureHelp",
              );
              assert(signature.includes(expected), signature);
            }
            const permissionSignature = await sourceHover(
              writer,
              stream,
              6022,
              "scenario-permissions-signature",
              `import { workflow } from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";
const flow = workflow("permission.yml", {on:{push:{}}}).job("build",({job})=>job.runsOn("ubuntu-latest").run({id:"read",name:"Read",run:"true"}));
scenario(flow, test => { test.tokenPermissions(/*completion*/{defaults:{contents:"read"},restrictWrites:false}); });`,
              true,
              "signatureHelp",
            );
            assert(
              permissionSignature.includes("TokenPermissionFixture"),
              permissionSignature,
            );
            assert(!permissionSignature.includes("..."), permissionSignature);
          },
        ),
      );

      for (
        const [index, [name, expected]] of ([
          ["composite-start", ["run", "uses", "task"]],
          ["composite-steps", ["run", "uses", "task", "outputs", "steps"]],
        ] as const).entries()
      ) {
        const fixture = displayFixtures().find((fixture) =>
          fixture.name === name
        );
        assert(fixture);
        const labels = await sourceCompletionLabels(
          writer,
          stream,
          200 + index,
          `completion-${name}`,
          fixture.source.replace("/*completion*/", "./*completion*/"),
        );
        assertRelevantExactly(labels, expected, [
          "run",
          "uses",
          "task",
          "outputs",
          "steps",
          "needs",
          "runsOn",
          "strategy",
        ]);
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
  valid = false,
  kind: "hover" | "signatureHelp" = "hover",
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
  const diagnostic = await notificationFor(
    stream,
    "textDocument/publishDiagnostics",
    uri,
  );
  if (valid) {
    assertEquals(
      (diagnostic.params as { diagnostics: { severity: number }[] }).diagnostics
        .filter((diagnostic) => diagnostic.severity === 1),
      [],
      source,
    );
  }
  await writeMessage(writer, {
    jsonrpc: "2.0",
    id,
    method: `textDocument/${kind}`,
    params: {
      textDocument: { uri },
      position: {
        line: lines.length - 1,
        character: (lines.at(-1)?.length ?? 0) - (kind === "hover" ? 2 : 0),
      },
    },
  });
  const response = await responseFor(stream, id);
  assert(response.error === undefined, JSON.stringify(response.error));
  if (kind === "signatureHelp") {
    const result = response.result as { signatures: { label: string }[] };
    assert(result?.signatures.length, JSON.stringify(response));
    return result.signatures.map((signature) => signature.label).join("\n");
  }
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

function displayFixtures(): readonly {
  name: string;
  source: string;
  kind?: "signatureHelp";
}[] {
  const imports =
    `import { workflow, compositeAction, project, textValue, literal, present } from "../src/github_actions/mod.ts";`;
  const base = `const draft = workflow("ci.yml", { on: { push: {} } });`;
  const build =
    `const flow = draft.job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ id: "build", name: "Build", run: "true", outputs: ["version"] }).outputs(({ steps }) => ({ version: steps.build.outputs.version })))`;
  const job = `${build}; flow.job("test", ({ job, jobs }) => { BODY });`;
  const sequence =
    `const state = job.needs(jobs.build).runsOn("ubuntu-latest").strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] } }).run({ id: "test", name: "Test", run: "true" }).run({ id: "report", name: "Report", run: "true" });`;
  const composite =
    `const actionDraft = compositeAction("actions/greet/action.yml", { name: "Greet", description: "Greeting", inputs: { who: { description: "Recipient", required: true } }, outputs: { greeting: { description: "Greeting" } } });`;
  const compositeBody =
    `${composite} const action = actionDraft.steps(({ step }) => { BODY });`;
  const compositeSequence =
    `const state = step.run({ id: "one", name: "First", shell: "bash", run: "true", outputs: ["value"] }).task({ id: "two", name: "Second", inputs: { who: { contract: textValue(), from: actionDraft.inputs.who } }, outputs: { value: { contract: textValue(), required: true } }, run: async ({ inputs, outputs }) => { await outputs.set("value", inputs.who); } });`;
  const cases: readonly [string, string][] = [
    ["workflow-draft", `${base} draft/*completion*/;`],
    [
      "workflow",
      `${base} ${build}.job("test", ({ job, jobs }) => job.needs(jobs.build).runsOn("ubuntu-latest").run({ id: "test", name: "Test", run: "true" })); flow/*completion*/;`,
    ],
    ["workflow-method", `${base} ${build}; flow.job/*completion*/;`],
    [
      "job-callback",
      `${base} ${
        job.replace(
          "BODY",
          `job/*completion*/; return job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" });`,
        )
      }`,
    ],
    [
      "job-needs",
      `${base} ${
        job.replace(
          "BODY",
          `const dependent = job.needs(jobs.build); dependent/*completion*/; return dependent.runsOn("ubuntu-latest").run({ name: "Test", run: "true" });`,
        )
      }`,
    ],
    [
      "execution",
      `${base} ${
        job.replace(
          "BODY",
          `const execution = job.needs(jobs.build).runsOn("ubuntu-latest").strategy({ matrix: { os: ["ubuntu-latest", "macos-latest"] } }); execution/*completion*/; return execution.run({ name: "Test", run: "true" });`,
        )
      }`,
    ],
    [
      "steps",
      `${base} ${
        job.replace("BODY", `${sequence} state/*completion*/; return state;`)
      }`,
    ],
    [
      "step-method",
      `${base} ${
        job.replace(
          "BODY",
          `${sequence} state.run/*completion*/; return state;`,
        )
      }`,
    ],
    [
      "expression-callback",
      `${base} ${
        job.replace(
          "BODY",
          `${sequence} return state.run({ name: "Consume", run: "true", env: (context) => { context/*completion*/; return { OS: context.matrix.os }; } });`,
        )
      }`,
    ],
    [
      "typed-task",
      `${base} draft.job("task", ({ job }) => { const state = job.runsOn("ubuntu-latest").task({ id: "emit", name: "Emit", inputs: { who: { from: literal("world") } }, outputs: { greeting: { required: true } }, run: async ({ inputs, outputs }) => { await outputs.set("greeting", inputs.who); } }); state/*completion*/; return state; });`,
    ],
    [
      "task-callback",
      `${base} draft.job("task", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "emit", name: "Emit", inputs: { who: { from: literal("world") } }, outputs: { greeting: { required: true } }, run: async (context) => { context/*completion*/; await context.outputs.set("greeting", context.inputs.who); } }));`,
    ],
    ["composite-draft", `${composite} actionDraft/*completion*/;`],
    [
      "composite-start",
      compositeBody.replace(
        "BODY",
        `step/*completion*/; return step.run({ name: "Test", shell: "bash", run: "true" }).outputs(() => ({ greeting: literal("hello") }));`,
      ),
    ],
    [
      "composite-steps",
      compositeBody.replace(
        "BODY",
        `${compositeSequence} state/*completion*/; return state.outputs(({ steps }) => ({ greeting: steps.two.outputs.value }));`,
      ),
    ],
    [
      "composite-method",
      compositeBody.replace(
        "BODY",
        `${compositeSequence} state.task/*completion*/; return state.outputs(({ steps }) => ({ greeting: steps.two.outputs.value }));`,
      ),
    ],
    [
      "composite",
      `${
        compositeBody.replace(
          "BODY",
          `${compositeSequence} return state.outputs(({ steps }) => ({ greeting: steps.two.outputs.value }));`,
        )
      } action/*completion*/;`,
    ],
  ];
  const reusable =
    `const reusable = workflow("called.yml", { on: { workflow_call: { inputs: { version: { type: "string", required: true } } } } }).job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }));`;
  const extra: readonly [string, string][] = [
    [
      "task-cache-job",
      `${base} const ci = draft.job("cache", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Task", run: () => {} })); project({ workflows: [ci], taskArtifactCache: ({ job, path, key }) => { job/*completion*/; return job.uses("acme/cache@v1", { with: { directory: path, identity: key } }); } });`,
    ],
    [
      "job-scope",
      `${base} ${build}; flow.job("scope", (context) => { context/*completion*/; return context.job.runsOn("ubuntu-latest").run({ name: "Test", run: "true" }); });`,
    ],
    [
      "reusable-job",
      `${base} ${reusable} draft.job("caller", ({ job }) => { const caller = job.reusable(); caller/*completion*/; return caller.call("./called.yml", reusable, { with: { version: "1" } }); });`,
    ],
    [
      "presence-proof",
      `${base} const source = draft.job("source", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "emit", name: "Emit", inputs: {}, outputs: { value: { contract: textValue(), required: false } }, run: () => {} }).outputs(({ steps }) => ({ value: steps.emit.outputs.value }))); source.job("read", ({ job, jobs }) => { const state = job.needs(jobs.source).runsOn("ubuntu-latest").when(({ needs }) => present(needs.source.outputs.value)).task({ id: "read", name: "Read", inputs: ({ needs }) => ({ value: { contract: textValue(), from: needs.source.outputs.value } }), outputs: {}, run: ({ inputs }) => { const value: string = inputs.value; void value; } }); state/*completion*/; return state; });`,
    ],
  ];
  const signatures: readonly [string, string][] = [
    [
      "task-cache-run-signature",
      `${base} const ci = draft.job("cache", ({ job }) => job.runsOn("ubuntu-latest").task({ name: "Task", run: () => {} })); project({ workflows: [ci], taskArtifactCache: ({ job }) => job.run(/*completion*/{ name: "Check", run: "true", shell: "bash" }) });`,
    ],
    [
      "simple-step-signature",
      `${base} draft.job("simple", ({ job }) => job.runsOn("ubuntu-latest").run(/*completion*/{ id: "one", name: "One", run: "true" }));`,
    ],

    [
      "workflow-signature",
      `${base} ${build}; flow.job("next", /*completion*/({ job }) => job.runsOn("ubuntu-latest").run({ name: "Next", run: "true" }));`,
    ],
    [
      "step-signature",
      `${base} ${
        job.replace(
          "BODY",
          `${sequence} return state.run(/*completion*/{ name: "Next", run: "true" });`,
        )
      }`,
    ],
    [
      "composite-signature",
      compositeBody.replace(
        "BODY",
        `${compositeSequence} return state.run(/*completion*/{ name: "Next", shell: "bash", run: "true" }).outputs(({ steps }) => ({ greeting: steps.two.outputs.value }));`,
      ),
    ],
  ];
  return [
    ...[...cases, ...extra].map(([name, source]) => ({
      name,
      source: `${imports}\n${source}`,
    })),
    ...signatures.map(([name, source]) => ({
      name,
      source: `${imports}\n${source}`,
      kind: "signatureHelp" as const,
    })),
  ];
}
