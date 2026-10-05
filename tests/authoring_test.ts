import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  definePipeline,
  defineTsugiori,
  literal,
  rawExpression,
} from "@atty303/tsugiori/github-actions";
import {
  AuthoringValidationError,
  lowerConfig,
} from "../packages/compiler/src/authoring.ts";
import { emitWorkflow } from "../packages/compiler/src/github_actions/emitter.ts";
import { pathToFileURL } from "node:url";
import { writeGeneratedFiles } from "../packages/compiler/src/write.ts";

Deno.test("native deployment fields remain visible in generated Actions YAML", async () => {
  const deploy = definePipeline("deploy", {
    output: ".github/workflows/deploy.yml",
    on: { push: { branches: ["master"] } },

    permissions: { contents: "read" },
  }).job("deploy-dev", ({ job }) =>
    job.runsOn("ubuntu-24.04")
      .when(rawExpression("needs.detect.outputs.selected == 'true'"))
      .permissions({ contents: "read", "id-token": "write" })
      .timeoutMinutes(60)
      .environment("dev")
      .concurrency({
        group: literal("signage-plugin-webview-cz-dev"),
        cancelInProgress: false,
        queue: "max",
      })
      .run({
        id: "deploy",
        name: "Deploy",
        run: "./scripts/deploy.sh",
        workingDirectory: "deploy/signage-plugin-webview-cz",
        env: { AWS_REGION: "ap-northeast-1" },
      })
      .outputs(() => ({
        result: rawExpression("steps.deploy.outputs.result"),
      })));
  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [deploy] }),
    "./tsugiori.ts",
  );
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  for (
    const field of [
      "branches:",
      "master",
      "timeout-minutes: 60",
      "id-token: write",
      "environment: dev",
      "cancel-in-progress: false",
      "queue: max",
      "working-directory: deploy/signage-plugin-webview-cz",
      "AWS_REGION: ap-northeast-1",
    ]
  ) assertStringIncludes(yaml, field);
  assertStringIncludes(yaml, "${{ steps.deploy.outputs.result }}");
  assertThrows(() => rawExpression("  "), TypeError);
});

Deno.test("authored step conditions and failure policy survive task lowering", async () => {
  const ci = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { workflow_dispatch: {} },
  }).job("test", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .uses("actions/checkout@v4", {
        name: "Optional action",
        continueOnError: true,
      })
      .run({
        name: "Optional command",
        run: "false",
        continueOnError: true,
      })
      .task({
        name: "Conditional task",
        inputs: {},
        outputs: {},
        if: rawExpression("steps.source.outputs.sha != ''"),
        continueOnError: true,
        run: () => {},
      }));

  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [ci] }),
    "./tsugiori.ts",
  );
  const steps = lowered.pipelines[0].workflow.jobs[0].steps;
  assertEquals(
    steps.filter((step) =>
      step.name?.startsWith("Optional") ||
      step.name === "Conditional task"
    )
      .map((step) => ({
        name: step.name,
        if: step.if,
        continueOnError: step.continueOnError,
      })),
    [
      { name: "Optional action", if: undefined, continueOnError: true },
      { name: "Optional command", if: undefined, continueOnError: true },
      {
        name: "Conditional task",
        if: rawExpression("steps.source.outputs.sha != ''"),
        continueOnError: true,
      },
    ],
  );
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertEquals(yaml.match(/continue-on-error: true/g)?.length, 4);
  assertStringIncludes(yaml, "if: \"${{ steps.source.outputs.sha != '' }}\"");
});

Deno.test("workflow dispatch string inputs are emitted from authoring options", async () => {
  const deploy = definePipeline("deploy", {
    output: ".github/workflows/deploy.yml",
    on: {
      push: {},
      workflow_dispatch: {
        inputs: {
          commit: {
            description: "Commit SHA to deploy",
            required: true,
            type: "string",
            default: "4edf1f703629073845d31eb54fe659f46c1b704b",
          },
        },
      },
    },
  }).job(
    "deploy",
    ({ job }) =>
      job.runsOn("ubuntu-24.04").run({ name: "Deploy", run: "true" }),
  );
  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [deploy] }),
    "./tsugiori.ts",
  );
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertStringIncludes(yaml, "workflow_dispatch:\n    inputs:\n      commit:");
  assertStringIncludes(
    yaml,
    "default: 4edf1f703629073845d31eb54fe659f46c1b704b",
  );
});

Deno.test("task-backed steps lower to visible preparation and runtime steps", async () => {
  const checkout = {
    name: "Action",
    description: "Action metadata",
    uses: "actions/checkout@v4",
    inputs: {
      "persist-credentials": { description: "Input" },
    },
    outputs: {},
  } as const;
  const ci = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
    permissions: { contents: "read" },
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .uses(checkout, {
        name: "Checkout",
        with: { "persist-credentials": "false" },
      })
      .task({ name: "Test", inputs: {}, outputs: {}, run: () => {} })
      .run({ name: "Inspect", run: "echo inspected" })
      .task({ name: "Report", inputs: {}, outputs: {}, run: async () => {} }));

  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [ci] }),
    "./tsugiori.ts",
  );

  assertEquals(
    lowered.tasks.map((task) => task.entrypoint),
    ["ci/test/task-1", "ci/test/task-2"],
  );
  assertEquals(lowered.pipelines.length, 1);
  const yaml = emitWorkflow(lowered.pipelines[0].workflow);
  assertStringIncludes(yaml, "name: Resolve task artifact");
  assertStringIncludes(yaml, "name: Cache task artifact");
  assertStringIncludes(yaml, "name: Prepare task artifact");
  assertStringIncludes(yaml, "permissions:\n  contents: read");
  assertStringIncludes(yaml, 'persist-credentials: "false"');
  assertStringIncludes(
    yaml,
    "deno run --frozen=true -A './tsugiori.ts' github-actions task cache-key --expect-layout 'ci/test=sha256:",
  );
  assertStringIncludes(
    yaml,
    "uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  );
  assertStringIncludes(
    yaml,
    "deno run --frozen=true -A './tsugiori.ts' github-actions task prepare --expect-layout 'ci/test=sha256:",
  );
  assertStringIncludes(
    yaml,
    'key: "tsugiori-task-${{ steps.tsugiori-task-artifact.outputs.artifact-key }}"',
  );
  assertEquals(yaml.match(/uses: actions\/cache@/g)?.length, 1);
  assert(!yaml.includes("actions/cache/restore@"));
  assert(!yaml.includes("actions/cache/save@"));
  assert(!yaml.includes("github.run_id"));
  assert(!yaml.includes("github.run_attempt"));
  assertStringIncludes(
    yaml,
    "run: |-\n          ./.tsugiori/task-runtime ci/test/task-1",
  );
  assertStringIncludes(
    yaml,
    "run: |-\n          ./.tsugiori/task-runtime ci/test/task-2",
  );
  assertEquals(yaml.match(/name: Prepare task artifact/g)?.length, 1);
  assertEquals(yaml.match(/name: Cache task artifact/g)?.length, 1);
});

Deno.test("duplicate pipeline outputs fail before generation", async () => {
  const first = definePipeline("first", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  }).job(
    "first",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );
  const second = definePipeline("second", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  }).job(
    "second",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );

  await assertRejects(
    () =>
      lowerConfig(
        defineTsugiori({ pipelines: [first, second] }),
        "./tsugiori.ts",
      ),
    AuthoringValidationError,
    "Pipeline output",
  );
});

Deno.test("task-backed steps reject Windows runners", async () => {
  const ci = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  }).job(
    "test",
    ({ job }) =>
      job.runsOn("windows-latest").task({
        name: "Test",
        inputs: {},
        outputs: {},
        run: () => {},
      }),
  );

  await assertRejects(
    () => lowerConfig(defineTsugiori({ pipelines: [ci] }), "./tsugiori.ts"),
    AuthoringValidationError,
    "unsupported Windows runner",
  );
});

Deno.test("compiler-owned task step IDs avoid authored step IDs", async () => {
  const ci = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .run({
        id: "tsugiori-task-artifact",
        name: "Authored",
        run: "true",
      })
      .task({ name: "Task", inputs: {}, outputs: {}, run: () => {} }));

  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [ci] }),
    "./tsugiori.ts",
  );
  const steps = lowered.pipelines[0].workflow.jobs[0].steps;
  assertEquals(steps.map((step) => step.id).filter(Boolean), [
    "tsugiori-task-artifact",
    "tsugiori-task-artifact-2",
    "tsugiori-task-cache",
    "tsugiori-task-prepare",
  ]);
  const prepareStep = steps.find((step) =>
    step.name === "Prepare task artifact"
  );
  assert(prepareStep?.type === "run");
  assertStringIncludes(
    prepareStep.run,
    "steps.tsugiori-task-artifact-2.outputs.artifact-key",
  );
});

Deno.test("pipeline states are immutable and dependencies use prior job references", async () => {
  const base = definePipeline("ci", {
    output: ".github/workflows/ci.yml",
    on: { push: {} },
  });
  const testOnly = base.job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .run({ id: "verify", name: "Verify", run: "true" }));
  const complete = testOnly.job("build", ({ job, jobs }) =>
    job
      .needs(jobs.test)
      .runsOn("ubuntu-latest")
      .run({ name: "Build", run: "true" }));

  const first = await lowerConfig(
    defineTsugiori({ pipelines: [testOnly] }),
    "./tsugiori.ts",
  );
  const second = await lowerConfig(
    defineTsugiori({ pipelines: [complete] }),
    "./tsugiori.ts",
  );

  assertEquals(first.pipelines[0].workflow.jobs.map((job) => job.id), ["test"]);
  assertEquals(second.pipelines[0].workflow.jobs.map((job) => job.id), [
    "test",
    "build",
  ]);
  assertEquals(second.pipelines[0].workflow.jobs[1].needs, ["test"]);
  assertEquals(second.pipelines[0].workflow.jobs[0].steps[0].id, "verify");
});

Deno.test("authoring rejects runtime-invalid provider-native values", () => {
  const ci = definePipeline("cache-version", {
    output: ".github/workflows/cache-version.yml",
    on: { push: {} },
  }).job(
    "test",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );
  assertEquals(defineTsugiori({ pipelines: [ci] }).cacheVersion, 1);
  assertEquals(
    defineTsugiori({ cacheVersion: 2, pipelines: [ci] }).cacheVersion,
    2,
  );
  for (const cacheVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertThrows(
      () => defineTsugiori({ cacheVersion, pipelines: [ci] }),
      TypeError,
      "Cache version must be a positive safe integer.",
    );
  }

  assertThrows(
    () =>
      definePipeline("ci", {
        output: ".github/workflows/ci.yml",
        on: { push: {} },
        permissions: [] as never,
      }),
    TypeError,
    "Workflow permissions must be an object.",
  );

  assertThrows(
    () =>
      definePipeline("bad", { output: "bad.yml", on: { push: {} } }).job(
        "test",
        ({ job }) =>
          job.runsOn("ubuntu-latest").uses("actions/checkout@v7", {
            with: new (class Inputs {
              token = "value";
            })() as never,
          }),
      ),
    TypeError,
    "Action inputs must be an object.",
  );
});

Deno.test("normalized duplicate outputs fail before any file is written", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-output-" });
  try {
    await assertRejects(
      () =>
        writeGeneratedFiles(root, [
          { path: ".github/workflows/ci.yml", content: "name: first\n" },
          {
            path: ".github/workflows/sub/../ci.yml",
            content: "name: second\n",
          },
        ]),
      Error,
      "resolve to the same file",
    );
    await assertRejects(
      () => Deno.stat(`${root}/.github/workflows/ci.yml`),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct config preserves invalid provider-native values for validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config", cacheVersion: 1,
  pipelines: [{
    id: "ci",
    name: "ci",
    output: ".github/workflows/ci.yml",
    on: { push: {  } },
    permissions: [],
    jobs: [{
      id: "test",
      runsOn: "ubuntu-latest",
      needs: [],
      steps: [{
        type: "uses",
        name: "Checkout",
        uses: "actions/checkout@v7",
        with: { token: undefined },
      }],
    }],
  }],
};
`,
    );
    const configUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const loaded = {
      config: (await import(configUrl.href)).default,
      argument: "./tsugiori.ts",
    };
    const error = await assertRejects(
      () => lowerConfig(loaded.config, loaded.argument),
      AuthoringValidationError,
      "Workflow permissions must be an object.",
    );
    assertStringIncludes(error.message, "Action input must be a string");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct config preserves deployment workflow fields", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-deploy-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
      kind: "tsugiori.config", cacheVersion: 1,
      pipelines: [{ id: "deploy", name: "Deploy", output: ".github/workflows/deploy.yml",
        on: { push: { branches: ["master"] } },
        jobs: [{ id: "deploy", runsOn: "ubuntu-24.04", needs: [],
          if: "\${{ github.ref == 'refs/heads/master' }}", timeoutMinutes: 30,
          environment: "dev", concurrency: {group: "app-dev", cancelInProgress: false},
          outputs: {result: "\${{ steps.deploy.outputs.result }}"},
          steps: [{type: "run", id: "deploy", name: "Deploy", run: "./deploy.sh",
            env: {AWS_REGION: "ap-northeast-1"}, workingDirectory: "scripts"}]
        }]
      }]
    };`,
    );
    const configUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const loaded = {
      config: (await import(configUrl.href)).default,
      argument: "./tsugiori.ts",
    };
    const lowered = await lowerConfig(loaded.config, loaded.argument);
    const yaml = emitWorkflow(lowered.pipelines[0].workflow);
    assertStringIncludes(yaml, "branches:\n      - master");
    assertStringIncludes(yaml, "cancel-in-progress: false");
    assertStringIncludes(yaml, "working-directory: scripts");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct config preserves task step ID and environment", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-task-step-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config", cacheVersion: 1,
  pipelines: [{ id: "ci", name: "CI", output: ".github/workflows/ci.yml",
    on: { push: {  } }, jobs: [{ id: "test", runsOn: "ubuntu-latest", needs: [],
      steps: [{ type: "task", id: "plan", name: "Plan", inputs: {}, outputs: {}, run: () => {},
        env: { TOKEN: "\${{ secrets.TOKEN }}" } }]
    }]
  }]
};`,
    );
    const configUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const loaded = {
      config: (await import(configUrl.href)).default,
      argument: "./tsugiori.ts",
    };
    const lowered = await lowerConfig(loaded.config, loaded.argument);
    const yaml = emitWorkflow(lowered.pipelines[0].workflow);
    assertStringIncludes(yaml, "id: plan");
    assertStringIncludes(yaml, 'TOKEN: "${{ secrets.TOKEN }}"');
    assertStringIncludes(
      yaml,
      "run: |-\n          ./.tsugiori/task-runtime ci/test/task-1",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct config does not let JSON-unsafe provider values bypass validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config", cacheVersion: 1,
  pipelines: [{
    id: "ci",
    name: "ci",
    output: ".github/workflows/ci.yml",
    on: { push: {  } },
    permissions: {
      contents: () => "write",
      toJSON: () => ({}),
    },
    jobs: [{
      id: "test",
      runsOn: "ubuntu-latest",
      needs: [],
      steps: [{
        type: "uses",
        name: "Checkout",
        uses: "actions/checkout@v7",
        with: {
          token: Symbol("private"),
          toJSON: () => ({}),
        },
      }],
    }],
  }],
};
`,
    );
    const configUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const loaded = {
      config: (await import(configUrl.href)).default,
      argument: "./tsugiori.ts",
    };
    const error = await assertRejects(
      () => lowerConfig(loaded.config, loaded.argument),
      AuthoringValidationError,
      "Workflow permission must be",
    );
    assertStringIncludes(
      error.message,
      'Workflow permission "toJSON" is not supported.',
    );
    assertStringIncludes(error.message, "Action input must be a string");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("pipeline triggers reject shorthands and retired options at runtime", () => {
  for (const on of [undefined, null, {}, "push", ["push"]]) {
    assertThrows(
      () => definePipeline("bad", { output: "ci.yml", on } as never),
      TypeError,
      "nonempty",
    );
  }
  for (
    const field of [
      "events",
      "pushBranches",
      "pushTags",
      "pullRequestTypes",
      "pullRequestTargetTypes",
      "workflowDispatchInputs",
      "workflowCall",
      "workflowCallOutputs",
    ]
  ) {
    assertThrows(
      () =>
        definePipeline(
          "bad",
          { output: "ci.yml", on: { push: {} }, [field]: {} } as never,
        ),
      TypeError,
      "Unsupported pipeline option",
    );
  }
});

Deno.test("workflowOutputs replaces direct native outputs without mutating earlier definitions", async () => {
  const direct = definePipeline("outputs", {
    output: ".github/workflows/outputs.yml",
    on: {
      workflow_call: {
        outputs: {
          original: {
            description: "Original",
            value: "${{ jobs.run.outputs.value }}",
          },
        },
      },
    },
  }).job(
    "run",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "out",
        name: "Out",
        run: "true",
        outputs: ["value"],
      }).outputs(({ steps }) => ({ value: steps.out.outputs.value })),
  );
  const replacement = direct.workflowOutputs(({ jobs }) => ({
    replacement: jobs.run.outputs.value,
  }));
  const first = await lowerConfig(
    defineTsugiori({ pipelines: [direct] }),
    "config.ts",
  );
  const second = await lowerConfig(
    defineTsugiori({ pipelines: [replacement] }),
    "config.ts",
  );
  assertEquals(first.pipelines[0].workflow.on.workflow_call?.outputs, {
    original: {
      description: "Original",
      value: "${{ jobs.run.outputs.value }}",
    },
  });
  assertEquals(second.pipelines[0].workflow.on.workflow_call?.outputs, {
    replacement: { value: "${{ jobs.run.outputs.value }}" },
  });
});
