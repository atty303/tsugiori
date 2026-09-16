import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
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
  });
  const test = ci.job("test", { runsOn: "ubuntu-latest" });
  test.uses("Checkout", "actions/checkout@v4");
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
