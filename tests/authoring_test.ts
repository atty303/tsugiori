import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  actionInput,
  defineAction,
  defineTsugiori,
  pipeline,
  rawAction,
  rawExpression,
} from "@atty303/tsugiori/github-actions";
import {
  AuthoringValidationError,
  lowerConfig,
} from "../packages/compiler/src/authoring.ts";
import { emitWorkflow } from "../packages/compiler/src/github_actions/emitter.ts";
import { loadConfig } from "../packages/compiler/src/source.ts";
import { writeGeneratedFiles } from "../packages/compiler/src/write.ts";

Deno.test("native deployment fields remain visible in generated Actions YAML", async () => {
  const deploy = pipeline("deploy", {
    output: ".github/workflows/deploy.yml",
    events: ["push"],
    pushBranches: ["master"],
    permissions: { contents: "read" },
  }).job("deploy-dev", ({ job }) =>
    job.runsOn("ubuntu-24.04", {
      if: rawExpression("needs.detect.outputs.selected == 'true'"),
      timeoutMinutes: 60,
      environment: "dev",
      outputs: { result: rawExpression("steps.deploy.outputs.result") },
      concurrency: {
        group: "signage-plugin-webview-cz-dev",
        cancelInProgress: false,
      },
    }).run({
      id: "deploy",
      name: "Deploy",
      run: "./scripts/deploy.sh",
      workingDirectory: "deploy/signage-plugin-webview-cz",
      env: { AWS_REGION: "ap-northeast-1" },
    }));
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
      "environment: dev",
      "cancel-in-progress: false",
      "working-directory: deploy/signage-plugin-webview-cz",
      "AWS_REGION: ap-northeast-1",
    ]
  ) assertStringIncludes(yaml, field);
  assertStringIncludes(yaml, "${{ steps.deploy.outputs.result }}");
  assertThrows(() => rawExpression("  "), TypeError);
});

Deno.test("task-backed steps lower to visible preparation and runtime steps", async () => {
  const checkout = defineAction({
    uses: "actions/checkout@v4",
    inputs: {
      "persist-credentials": actionInput.boolean(),
    },
    outputs: [],
  });
  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
    permissions: { contents: "read" },
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .uses({
        name: "Checkout",
        uses: checkout({ "persist-credentials": false }),
      })
      .task({ name: "Test", task: () => {} })
      .run({ name: "Inspect", run: "echo inspected" })
      .task({ name: "Report", task: async () => {} }));

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
  assertStringIncludes(yaml, "name: Restore task artifact cache");
  assertStringIncludes(yaml, "name: Prepare task artifact");
  assertStringIncludes(yaml, "name: Save task artifact cache");
  assertStringIncludes(yaml, "permissions:\n  contents: read");
  assertStringIncludes(yaml, "persist-credentials: false");
  assertStringIncludes(
    yaml,
    "deno run --frozen=true -A @atty303/tsugiori/cli github-actions task cache-key --config ''./tsugiori.ts'' --root ''.'' --expect-layout ''ci/test=sha256:",
  );
  assertStringIncludes(
    yaml,
    "uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  );
  assertStringIncludes(
    yaml,
    "deno run --frozen=true -A @atty303/tsugiori/cli github-actions task prepare --config ''./tsugiori.ts'' --root ''.'' --expect-layout ''ci/test=sha256:",
  );
  assertStringIncludes(
    yaml,
    "uses: actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  );
  assertStringIncludes(yaml, "run: ./.tsugiori/task-runtime ci/test/task-1");
  assertStringIncludes(yaml, "run: ./.tsugiori/task-runtime ci/test/task-2");
  assertEquals(yaml.match(/name: Prepare task artifact/g)?.length, 1);
  assertEquals(yaml.match(/name: Restore task artifact cache/g)?.length, 1);
  assertEquals(yaml.match(/name: Save task artifact cache/g)?.length, 1);
});

Deno.test("duplicate pipeline outputs fail before generation", async () => {
  const first = pipeline("first", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  }).job(
    "first",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );
  const second = pipeline("second", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
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
  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  }).job(
    "test",
    ({ job }) =>
      job.runsOn("windows-latest").task({ name: "Test", task: () => {} }),
  );

  await assertRejects(
    () => lowerConfig(defineTsugiori({ pipelines: [ci] }), "./tsugiori.ts"),
    AuthoringValidationError,
    "unsupported Windows runner",
  );
});

Deno.test("compiler-owned task step IDs avoid authored step IDs", async () => {
  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .run({
        id: "tsugiori-task-artifact",
        name: "Authored",
        run: "true",
      })
      .task({ name: "Task", task: () => {} }));

  const lowered = await lowerConfig(
    defineTsugiori({ pipelines: [ci] }),
    "./tsugiori.ts",
  );
  const steps = lowered.pipelines[0].workflow.jobs[0].steps;
  assertEquals(steps.map((step) => step.id).filter(Boolean), [
    "tsugiori-task-artifact",
    "tsugiori-task-artifact-2",
    "tsugiori-task-cache-restore",
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
  const base = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
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

Deno.test("typed actions validate declared inputs at runtime", () => {
  const action = defineAction({
    uses: "owner/action@revision",
    inputs: {
      required: actionInput.string({ required: true }),
      count: actionInput.number(),
    },
    outputs: ["result"],
  });

  assertThrows(
    () => action({} as never),
    TypeError,
    'Required action input "required" is missing.',
  );
  assertThrows(
    () => action({ required: "value", count: Infinity }),
    TypeError,
    'Action input "count" must be finite.',
  );
  assertThrows(
    () => action({ required: "value", extra: true } as never),
    TypeError,
    'Action input "extra" is not declared.',
  );
  assertThrows(
    () =>
      defineAction({
        uses: "owner/action@revision",
        inputs: {},
        outputs: ["bad output"],
      }),
    TypeError,
    "Action output names must start with a letter or underscore",
  );

  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  }).job("action-output", ({ job }) => {
    const invoked = job.runsOn("ubuntu-latest").uses({
      id: "action",
      name: "Action",
      uses: action({ required: "value" }),
    });
    assertEquals(
      invoked.steps.action.outputs.result,
      "${{ steps.action.outputs.result }}",
    );
    return invoked;
  });
  assertEquals(
    defineTsugiori({ pipelines: [ci] }).pipelines[0].jobs[0].id,
    "action-output",
  );
});

Deno.test("authoring rejects runtime-invalid provider-native values", () => {
  const ci = pipeline("cache-version", {
    output: ".github/workflows/cache-version.yml",
    events: ["push"],
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
      pipeline("ci", {
        output: ".github/workflows/ci.yml",
        events: ["push"],
        permissions: [] as never,
      }),
    TypeError,
    "Workflow permissions must be an object.",
  );

  assertThrows(
    () =>
      rawAction(
        "actions/checkout@v7",
        new (class Inputs {
          token = "value";
        })() as never,
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

Deno.test("source loading preserves invalid provider-native values for validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config",
  pipelines: [{
    id: "ci",
    name: "ci",
    output: ".github/workflows/ci.yml",
    events: ["push"],
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
    const loaded = await loadConfig("./tsugiori.ts", root);
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

Deno.test("source loading preserves deployment workflow fields", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-deploy-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
      kind: "tsugiori.config", cacheVersion: 1,
      pipelines: [{ id: "deploy", name: "Deploy", output: ".github/workflows/deploy.yml",
        events: ["push"], pushBranches: ["master"],
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
    const loaded = await loadConfig("./tsugiori.ts", root);
    const lowered = await lowerConfig(loaded.config, loaded.argument);
    const yaml = emitWorkflow(lowered.pipelines[0].workflow);
    assertStringIncludes(yaml, "branches:\n      - master");
    assertStringIncludes(yaml, "cancel-in-progress: false");
    assertStringIncludes(yaml, "working-directory: scripts");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("source loading preserves task step ID and environment", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-task-step-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config", cacheVersion: 1,
  pipelines: [{ id: "ci", name: "CI", output: ".github/workflows/ci.yml",
    events: ["push"], jobs: [{ id: "test", runsOn: "ubuntu-latest", needs: [],
      steps: [{ type: "task", id: "plan", name: "Plan", task: () => {},
        env: { TOKEN: "\${{ secrets.TOKEN }}" } }]
    }]
  }]
};`,
    );
    const loaded = await loadConfig("./tsugiori.ts", root);
    const lowered = await lowerConfig(loaded.config, loaded.argument);
    const yaml = emitWorkflow(lowered.pipelines[0].workflow);
    assertStringIncludes(yaml, "id: plan");
    assertStringIncludes(yaml, "TOKEN: '${{ secrets.TOKEN }}'");
    assertStringIncludes(yaml, "run: ./.tsugiori/task-runtime ci/test/task-1");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("source loading does not let JSON-unsafe provider values bypass validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "tsugiori.config",
  pipelines: [{
    id: "ci",
    name: "ci",
    output: ".github/workflows/ci.yml",
    events: ["push"],
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
    const loaded = await loadConfig("./tsugiori.ts", root);
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
