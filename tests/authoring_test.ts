import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { defineTsugiori, pipeline } from "@tsugiori/core/github-actions";
import {
  AuthoringValidationError,
  lowerConfig,
} from "../packages/compiler/src/authoring.ts";
import { emitWorkflow } from "../packages/compiler/src/github_actions/emitter.ts";
import {
  loadConfig,
  SourceLoadError,
} from "../packages/compiler/src/source.ts";
import { writeGeneratedFiles } from "../packages/compiler/src/write.ts";

Deno.test("task-backed steps lower to visible preparation and runtime steps", async () => {
  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
    permissions: { contents: "read" },
  });
  const test = ci.job("test", { runsOn: "ubuntu-latest" });
  test.uses("Checkout", "actions/checkout@v4", {
    "persist-credentials": false,
  });
  test.task("Test", () => {});
  test.run("Inspect", "echo inspected");
  test.task("Report", async () => {});

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
  assertStringIncludes(yaml, "name: Prepare task artifact");
  assertStringIncludes(yaml, "permissions:\n  contents: read");
  assertStringIncludes(yaml, "persist-credentials: false");
  assertStringIncludes(
    yaml,
    "tsugiori task prepare --config ''./tsugiori.ts'' --expect-layout ''ci/test=sha256:",
  );
  assertStringIncludes(yaml, "run: ./.tsugiori/task-runtime ci/test/task-1");
  assertStringIncludes(yaml, "run: ./.tsugiori/task-runtime ci/test/task-2");
  assertEquals(yaml.match(/name: Prepare task artifact/g)?.length, 1);
});

Deno.test("duplicate pipeline outputs fail before generation", async () => {
  const first = pipeline("first", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  });
  first.job("first", { runsOn: "ubuntu-latest" }).run("Run", "true");
  const second = pipeline("second", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
  });
  second.job("second", { runsOn: "ubuntu-latest" }).run("Run", "true");

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
  });
  ci.job("test", { runsOn: "windows-latest" }).task("Test", () => {});

  await assertRejects(
    () => lowerConfig(defineTsugiori({ pipelines: [ci] }), "./tsugiori.ts"),
    AuthoringValidationError,
    "unsupported Windows runner",
  );
});

Deno.test("builders reject runtime-invalid provider-native values", () => {
  const ci = pipeline("ci", {
    output: ".github/workflows/ci.yml",
    events: ["push"],
    permissions: [] as never,
  });
  ci.job("test", { runsOn: "ubuntu-latest" }).run("Test", "true");
  assertThrows(
    () => defineTsugiori({ pipelines: [ci] }),
    TypeError,
    "Workflow permissions must be an object.",
  );

  const job = pipeline("other", {
    output: ".github/workflows/other.yml",
    events: ["push"],
  }).job("test", { runsOn: "ubuntu-latest" });
  assertThrows(
    () =>
      job.uses(
        "Checkout",
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

Deno.test("remote Deno configuration inheritance fails before source inspection", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(
      `${root}/deno.json`,
      `${JSON.stringify({ extends: "https://example.invalid/deno.json" })}\n`,
    );
    await Deno.writeTextFile(
      `${root}/tsugiori.ts`,
      'throw new Error("source inspection started");\n',
    );
    await assertRejects(
      () => loadConfig("./tsugiori.ts", root),
      SourceLoadError,
      "extends must use local paths",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("malformed Deno configuration is a source loading failure", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-config-" });
  try {
    await Deno.writeTextFile(`${root}/deno.json`, "{ invalid\n");
    await assertRejects(
      () => loadConfig("./tsugiori.ts", root),
      SourceLoadError,
      "Failed to load Deno configuration",
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
