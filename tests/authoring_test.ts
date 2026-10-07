import { assertInlineSnapshot } from "@std/testing/unstable-snapshot";
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  literal,
  project,
  rawExpression,
  workflow as makeWorkflow,
} from "@atty303/tsugiori/github-actions";
import {
  AuthoringValidationError,
  lowerProject,
} from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { pathToFileURL } from "node:url";
import { writeGeneratedFiles } from "../src/compiler/write.ts";

Deno.test("native deployment fields remain visible in generated Actions YAML", async () => {
  const deploy = makeWorkflow(".github/workflows/deploy.yml", {
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
  const lowered = await lowerProject(
    project({ workflows: [deploy] }),
    "./tsugiori.ts",
  );
  const yaml = emitWorkflow(lowered.workflows[0].workflow);
  assertInlineSnapshot(
    yaml,
    `name: .github/workflows/deploy.yml
on:
  push:
    branches:
      - master
permissions:
  contents: read
jobs:
  deploy-dev:
    runs-on: ubuntu-24.04
    if: \${{ needs.detect.outputs.selected == 'true' }}
    permissions:
      contents: read
      id-token: write
    timeout-minutes: 60
    environment: dev
    outputs:
      result: \${{ steps.deploy.outputs.result }}
    concurrency:
      group: \${{ 'signage-plugin-webview-cz-dev' }}
      cancel-in-progress: false
      queue: max
    steps:
      - name: Deploy
        id: deploy
        env:
          AWS_REGION: ap-northeast-1
        working-directory: deploy/signage-plugin-webview-cz
        run: ./scripts/deploy.sh
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("blank raw expressions are rejected", () => {
  assertThrows(() => rawExpression("  "), TypeError);
});

Deno.test("authored step conditions and failure policy survive task lowering", async () => {
  const ci = makeWorkflow(".github/workflows/ci.yml", {
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

  const lowered = await lowerProject(
    project({
      workflows: [ci],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "./tsugiori.ts",
    "fixture-source",
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/ci.yml
on:
  workflow_dispatch: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Optional action
        continue-on-error: true
        uses: actions/checkout@v4

      - name: Optional command
        continue-on-error: true
        run: "false"

      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          project-directory: .
          entrypoint: ./tsugiori.ts
          source-key: fixture-source
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Conditional task
        if: \${{ steps.source.outputs.sha != '' }}
        continue-on-error: true
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/ci.yml/test/task-1'"
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("workflow dispatch string inputs are emitted from authoring options", async () => {
  const deploy = makeWorkflow(".github/workflows/deploy.yml", {
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
  const lowered = await lowerProject(
    project({ workflows: [deploy] }),
    "./tsugiori.ts",
  );
  const yaml = emitWorkflow(lowered.workflows[0].workflow);
  assertInlineSnapshot(
    yaml,
    `name: .github/workflows/deploy.yml
on:
  push: {}
  workflow_dispatch:
    inputs:
      commit:
        description: Commit SHA to deploy
        required: true
        type: string
        default: 4edf1f703629073845d31eb54fe659f46c1b704b
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - name: Deploy
        run: "true"
`,
    { serializer: (yaml) => yaml },
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
  const ci = makeWorkflow(".github/workflows/ci.yml", {
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

  const lowered = await lowerProject(
    project({
      workflows: [ci],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "./tsugiori.ts",
    "fixture-source",
  );

  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/ci.yml
on:
  push: {}
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: "false"

      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          project-directory: .
          entrypoint: ./tsugiori.ts
          source-key: fixture-source
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Test
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/ci.yml/test/task-1'"

      - name: Inspect
        run: echo inspected

      - name: Report
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/ci.yml/test/task-2'"
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("task registry retains invocation entrypoints", async () => {
  const ci = makeWorkflow(".github/workflows/ci.yml", {
    on: { push: {} },
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .task({ name: "Test", inputs: {}, outputs: {}, run: () => {} })
      .run({ name: "Inspect", run: "echo inspected" })
      .task({ name: "Report", inputs: {}, outputs: {}, run: async () => {} }));

  const lowered = await lowerProject(
    project({ workflows: [ci] }),
    "./tsugiori.ts",
  );

  assertEquals(lowered.workflows.length, 1);
  assertEquals(
    lowered.tasks.map((task) => task.entrypoint),
    [
      ".github/workflows/ci.yml/test/task-1",
      ".github/workflows/ci.yml/test/task-2",
    ],
  );
});

Deno.test("duplicate workflow outputs fail before generation", () => {
  const first = makeWorkflow(".github/workflows/ci.yml", {
    on: { push: {} },
  }).job(
    "first",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );
  const second = makeWorkflow(".github/workflows/ci.yml", {
    on: { push: {} },
  }).job(
    "second",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );

  assertThrows(
    () =>
      lowerProject(
        project({ workflows: [first, second] }),
        "./tsugiori.ts",
      ),
    AuthoringValidationError,
    "Workflow output",
  );
});

Deno.test("task-backed steps reject Windows runners", () => {
  const ci = makeWorkflow(".github/workflows/ci.yml", {
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

  assertThrows(
    () => lowerProject(project({ workflows: [ci] }), "./tsugiori.ts"),
    AuthoringValidationError,
    "unsupported Windows runner",
  );
});

Deno.test("compiler-owned task step IDs avoid authored step IDs", async () => {
  const ci = makeWorkflow(".github/workflows/ci.yml", {
    on: { push: {} },
  }).job("test", ({ job }) =>
    job
      .runsOn("ubuntu-latest")
      .run({
        id: "tsugiori-task-cache",
        name: "Authored",
        run: "true",
      })
      .task({ name: "Task", inputs: {}, outputs: {}, run: () => {} }));

  const lowered = await lowerProject(
    project({
      workflows: [ci],
      localTaskPrepareAction: "./actions/task-prepare",
    }),
    "./tsugiori.ts",
    "fixture-source",
  );
  assertInlineSnapshot(
    emitWorkflow(lowered.workflows[0].workflow),
    `name: .github/workflows/ci.yml
on:
  push: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Authored
        id: tsugiori-task-cache
        run: "true"

      - name: Cache task artifact
        id: tsugiori-task-cache-2
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          project-directory: .
          entrypoint: ./tsugiori.ts
          source-key: fixture-source
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Task
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/ci.yml/test/task-1'"
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("workflow states are immutable and dependencies use prior job references", async () => {
  const base = makeWorkflow(".github/workflows/ci.yml", {
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

  const first = await lowerProject(
    project({ workflows: [testOnly] }),
    "./tsugiori.ts",
  );
  const second = await lowerProject(
    project({ workflows: [complete] }),
    "./tsugiori.ts",
  );

  assertInlineSnapshot(
    emitWorkflow(first.workflows[0].workflow),
    `name: .github/workflows/ci.yml
on:
  push: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Verify
        id: verify
        run: "true"
`,
    { serializer: (yaml) => yaml },
  );
  assertInlineSnapshot(
    emitWorkflow(second.workflows[0].workflow),
    `name: .github/workflows/ci.yml
on:
  push: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Verify
        id: verify
        run: "true"

  build:
    runs-on: ubuntu-latest
    needs:
      - test
    steps:
      - name: Build
        run: "true"
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("authoring rejects runtime-invalid provider-native values", () => {
  const ci = makeWorkflow(".github/workflows/cache-version.yml", {
    on: { push: {} },
  }).job(
    "test",
    ({ job }) => job.runsOn("ubuntu-latest").run({ name: "Run", run: "true" }),
  );
  assertEquals(project({ workflows: [ci] }).cacheVersion, 1);
  assertEquals(
    project({ cacheVersion: 2, workflows: [ci] }).cacheVersion,
    2,
  );
  for (const cacheVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assertThrows(
      () => project({ cacheVersion, workflows: [ci] }),
      TypeError,
      "Cache version must be a positive safe integer.",
    );
  }

  assertThrows(
    () =>
      makeWorkflow(".github/workflows/ci.yml", {
        on: { push: {} },
        permissions: [] as never,
      }),
    TypeError,
    "Workflow permissions must be an object.",
  );

  assertThrows(
    () =>
      makeWorkflow("bad.yml", { on: { push: {} } }).job(
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

Deno.test("direct project preserves invalid provider-native values for validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-project-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "github-actions.project", cacheVersion: 1, workingDirectory: ".",
  workflows: [{
    name: "ci",
    path: ".github/workflows/ci.yml",
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
    const entrypointUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const source = {
      project: (await import(entrypointUrl.href)).default,
      entrypointArgument: "./tsugiori.ts",
    };
    const error = assertThrows(
      () => lowerProject(source.project, source.entrypointArgument),
      AuthoringValidationError,
      "Workflow permissions must be an object.",
    );
    assertStringIncludes(error.message, "Action input must be a string");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct project preserves deployment workflow fields", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-deploy-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
      kind: "github-actions.project", cacheVersion: 1, workingDirectory: ".",
      workflows: [{ name: "Deploy", path: ".github/workflows/deploy.yml",
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
    const entrypointUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const source = {
      project: (await import(entrypointUrl.href)).default,
      entrypointArgument: "./tsugiori.ts",
    };
    const lowered = await lowerProject(
      source.project,
      source.entrypointArgument,
    );
    const yaml = emitWorkflow(lowered.workflows[0].workflow);
    assertInlineSnapshot(
      yaml,
      `name: Deploy
on:
  push:
    branches:
      - master
jobs:
  deploy:
    runs-on: ubuntu-24.04
    if: \${{ github.ref == 'refs/heads/master' }}
    timeout-minutes: 30
    environment: dev
    outputs:
      result: \${{ steps.deploy.outputs.result }}
    concurrency:
      group: app-dev
      cancel-in-progress: false
    steps:
      - name: Deploy
        id: deploy
        env:
          AWS_REGION: ap-northeast-1
        working-directory: scripts
        run: ./deploy.sh
`,
      { serializer: (yaml) => yaml },
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct project preserves task step ID and environment", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-task-step-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "github-actions.project", cacheVersion: 1, workingDirectory: ".", localTaskPrepareAction: "./actions/task-prepare",
  workflows: [{ name: "CI", path: ".github/workflows/ci.yml",
    on: { push: {  } }, jobs: [{ id: "test", runsOn: "ubuntu-latest", needs: [],
      steps: [{ type: "task", id: "plan", name: "Plan", inputs: {}, outputs: {}, run: () => {},
        env: { TOKEN: "\${{ secrets.TOKEN }}" } }]
    }]
  }]
};`,
    );
    const entrypointUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const source = {
      project: (await import(entrypointUrl.href)).default,
      entrypointArgument: "./tsugiori.ts",
    };
    const lowered = await lowerProject(
      source.project,
      source.entrypointArgument,
      "fixture-source",
    );
    const yaml = emitWorkflow(lowered.workflows[0].workflow);
    assertInlineSnapshot(
      yaml,
      `name: CI
on:
  push: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Cache task artifact
        id: tsugiori-task-cache
        continue-on-error: true
        uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9
        with:
          path: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}
          key: tsugiori-task-fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Prepare task artifact
        id: tsugiori-task-prepare
        uses: ./actions/task-prepare
        with:
          project-directory: .
          entrypoint: ./tsugiori.ts
          source-key: fixture-source
          cache-directory: \${{ runner.temp }}/tsugiori-artifacts/fixture-source-\${{ runner.os }}-\${{ runner.arch }}

      - name: Plan
        id: plan
        env:
          TOKEN: \${{ secrets.TOKEN }}
        run: "\\"\${{ steps.tsugiori-task-prepare.outputs.runtime-path }}\\" '.github/workflows/ci.yml/test/task-1'"
`,
      { serializer: (yaml) => yaml },
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("direct project does not let JSON-unsafe provider values bypass validation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-project-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{}\n");
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      `export default {
  kind: "github-actions.project", cacheVersion: 1, workingDirectory: ".",
  workflows: [{
    name: "ci",
    path: ".github/workflows/ci.yml",
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
    const entrypointUrl = pathToFileURL(`${root}/tsugiori.ts`);
    const source = {
      project: (await import(entrypointUrl.href)).default,
      entrypointArgument: "./tsugiori.ts",
    };
    const error = assertThrows(
      () => lowerProject(source.project, source.entrypointArgument),
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

Deno.test("workflow triggers reject shorthands and retired options at runtime", () => {
  for (const on of [undefined, null, {}, "push", ["push"]]) {
    assertThrows(
      () => makeWorkflow("ci.yml", { on } as never),
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
      () => makeWorkflow("ci.yml", { on: { push: {} }, [field]: {} } as never),
      TypeError,
      "Unsupported workflow option",
    );
  }
});

Deno.test("workflowOutputs replaces direct native outputs without mutating earlier definitions", async () => {
  const direct = makeWorkflow(".github/workflows/outputs.yml", {
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
  const first = await lowerProject(
    project({ workflows: [direct] }),
    "config.ts",
  );
  const second = await lowerProject(
    project({ workflows: [replacement] }),
    "config.ts",
  );
  assertInlineSnapshot(
    emitWorkflow(first.workflows[0].workflow),
    `name: .github/workflows/outputs.yml
on:
  workflow_call:
    outputs:
      original:
        description: Original
        value: \${{ jobs.run.outputs.value }}
jobs:
  run:
    runs-on: ubuntu-latest
    outputs:
      value: \${{ steps.out.outputs.value }}
    steps:
      - name: Out
        id: out
        run: "true"
`,
    { serializer: (yaml) => yaml },
  );
  assertInlineSnapshot(
    emitWorkflow(second.workflows[0].workflow),
    `name: .github/workflows/outputs.yml
on:
  workflow_call:
    outputs:
      replacement:
        value: \${{ jobs.run.outputs.value }}
jobs:
  run:
    runs-on: ubuntu-latest
    outputs:
      value: \${{ steps.out.outputs.value }}
    steps:
      - name: Out
        id: out
        run: "true"
`,
    { serializer: (yaml) => yaml },
  );
});

Deno.test("GitHub string maps preserve empty and whitespace values through public authoring", async () => {
  const values = { EMPTY: "", SPACE: "  ", PADDED: " value \t" };
  const workflow = makeWorkflow("values.yml", {
    on: { push: {} },
    env: values,
  })
    .job("values", ({ job }) =>
      job.runsOn("ubuntu-latest").env(values)
        .run({ name: "Run", run: "true", env: values })
        .uses("example/action@v1", { env: values, with: values })
        .outputs(() => ({ empty: literal("") })));
  const { generateFiles } = await import("../src/compiler/generator.ts");
  const { parse } = await import("../src/deps.ts");
  const files = await generateFiles(
    project({ workflows: [workflow] }),
    "values.ts",
    "unused",
  );
  const decoded = parse(String(files[0].content)) as {
    env: typeof values;
    jobs: {
      values: {
        env: typeof values;
        outputs: { empty: string };
        steps: { env: typeof values; with?: typeof values }[];
      };
    };
  };
  assertEquals(decoded.env, values);
  assertEquals(decoded.jobs.values.env, values);
  for (const step of decoded.jobs.values.steps) assertEquals(step.env, values);
  assertEquals(decoded.jobs.values.steps[1].with, values);
  assertEquals(decoded.jobs.values.outputs.empty, "${{ '' }}");
});

Deno.test("authored runner labels report misplaced self-hosted during lowering", () => {
  const workflow = makeWorkflow(".github/workflows/runner.yml", {
    on: { push: {} },
  })
    .job(
      "test",
      ({ job }) =>
        job.runsOn(["x64", "SELF-HOSTED"]).run({ name: "Run", run: "true" }),
    );
  const error = assertThrows(
    () => lowerProject(project({ workflows: [workflow] }), "./workflows.ts"),
    AuthoringValidationError,
    "The self-hosted runner label must be listed first.",
  );
  assertStringIncludes(error.diagnostics[0], "jobs.0.runsOn.labels.1");
});
