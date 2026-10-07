import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defineCompositeAction,
  defineProject,
  defineWorkflow,
} from "../src/github_actions/mod.ts";
import { generateFiles } from "../src/compiler/generator.ts";
import { parse } from "../src/deps.ts";

const leaf = defineCompositeAction("actions/foo/action.yml", {
  name: "Foo",
  description: "Foo",
})
  .steps(({ step }) => step.run({ name: "Run", shell: "bash", run: "true" }));
const parent = defineCompositeAction("actions/parent/action.yml", {
  name: "Parent",
  description: "Parent",
})
  .steps(({ step }) => step.uses(leaf));
const workflow = defineWorkflow("workflows/ci.yml", { on: { push: {} } })
  .job("ci", ({ job }) =>
    job.runsOn("ubuntu-latest").uses(parent)
      .uses(leaf, { uses: "example/foo@v1" }).task({
        name: "Task",
        run: () => {},
      }));

Deno.test("generation resolves one checkout location for local calls and workflow task preparation", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-location-" });
  try {
    const init = await new Deno.Command("git", {
      args: ["init", "--quiet", root],
      stdout: "null",
      stderr: "piped",
    }).output();
    assertEquals(init.code, 0);
    const nested = resolve(root, ".github");
    await Deno.mkdir(nested);
    for (
      const [directory, expected] of [[root, "."], [nested, ".github"]] as const
    ) {
      const files = await generateFiles(
        defineProject({
          workflows: [workflow],
          localTaskPrepareAction: "./actions/task-prepare",
        }),
        "entry.ts",
        "unused",
        { projectDirectory: directory },
      );
      const yaml = parse(String(files[0].content));
      const steps = yaml.jobs.ci.steps;
      const prefix = expected === "." ? "." : `./${expected}`;
      assertEquals(steps[0].uses, `${prefix}/actions/parent`);
      assertEquals(steps[1].uses, "example/foo@v1");
      assertEquals(steps[3].with["project-directory"], expected);
      assertEquals(steps[4]["working-directory"], undefined);
      assertEquals(files.map((file) => file.path), [
        "workflows/ci.yml",
        "actions/foo/action.yml",
        "actions/parent/action.yml",
      ]);
      assertEquals(
        parse(String(files[2].content)).runs.steps[0].uses,
        `${prefix}/actions/foo`,
      );
    }
    const alias = resolve(root, "alias");
    await Deno.symlink(nested, alias, { type: "dir" });
    const files = await generateFiles(
      defineProject({
        workflows: [workflow],
        localTaskPrepareAction: "./actions/task-prepare",
      }),
      "entry.ts",
      "unused",
      { projectDirectory: alias },
    );
    assertEquals(
      parse(String(files[0].content)).jobs.ci.steps[0].uses,
      "./.github/actions/parent",
    );
    const explicit = await generateFiles(
      defineProject({
        workflows: [workflow],
        workingDirectory: ".",
        localTaskPrepareAction: "./actions/task-prepare",
      }),
      "entry.ts",
      "unused",
      { projectDirectory: nested },
    );
    assertEquals(
      parse(String(explicit[0].content)).jobs.ci.steps[3]
        .with["project-directory"],
      ".",
    );
    assertEquals(
      parse(String(explicit[0].content)).jobs.ci.steps[0].uses,
      "./actions/parent",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("non-Git generation requires an explicit location only when checkout-relative paths are needed", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-no-git-" });
  try {
    for (const workingDirectory of [".", ".github"]) {
      const files = await generateFiles(
        defineProject({
          workflows: [workflow],
          workingDirectory,
          localTaskPrepareAction: "./actions/task-prepare",
        }),
        "entry.ts",
        "unused",
        { projectDirectory: root },
      );
      assertEquals(
        parse(String(files[0].content)).jobs.ci.steps[3]
          .with["project-directory"],
        workingDirectory,
      );
    }
    await assertRejects(
      () =>
        generateFiles(
          defineProject({ workflows: [workflow] }),
          "entry.ts",
          "unused",
          { projectDirectory: root },
        ),
      Error,
      "workingDirectory",
    );
    for (
      const workingDirectory of [
        "../outside",
        "/outside",
        "",
        "a/../../outside",
        "a\\b",
      ]
    ) {
      await assertRejects(
        () =>
          generateFiles(
            defineProject({ workflows: [workflow], workingDirectory }),
            "entry.ts",
            "unused",
            { projectDirectory: root },
          ),
        Error,
        "Invalid workingDirectory",
      );
    }
    const remote = defineWorkflow("ci.yml", { on: { push: {} } })
      .job(
        "ci",
        ({ job }) =>
          job.runsOn("ubuntu-latest").uses(leaf, { uses: "example/foo@v1" }),
      );
    assertEquals(
      (await generateFiles(
        defineProject({ workflows: [remote] }),
        "entry.ts",
        "unused",
        { projectDirectory: root },
      )).length,
      1,
    );
    assertEquals(
      (await generateFiles(
        defineProject({ actions: [leaf] }),
        "entry.ts",
        "unused",
        { projectDirectory: root },
      )).length,
      1,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("CLI generation writes pwd-relative files and retains location diagnostics with opt-out", async () => {
  const root = await Deno.makeTempDir({ prefix: "tsugiori-location-cli-" });
  try {
    const nested = resolve(root, ".github");
    await Deno.mkdir(nested);
    const entry = resolve(nested, "entry.ts");
    const source = pathToFileURL(resolve("src/github_actions.ts")).href;
    const config = JSON.parse(await Deno.readTextFile("deno.json"));
    delete config.workspace;
    await Deno.writeTextFile(
      resolve(root, "deno.json"),
      JSON.stringify(config),
    );
    await Deno.copyFile("deno.lock", resolve(root, "deno.lock"));
    await Deno.writeTextFile(
      entry,
      `import { defineCompositeAction, defineProject, defineWorkflow, runProject } from ${
        JSON.stringify(source)
      };
const action = defineCompositeAction("actions/foo/action.yml", { name: "Foo", description: "Foo" }).steps(({ step }) => step.run({ name: "Run", shell: "bash", run: "true" }));
const workflow = defineWorkflow("workflows/ci.yml", { on: { push: {} } }).job("ci", ({ job }) => job.runsOn("ubuntu-latest").uses(action).task({ name: "Task", run: () => {} }));
const project = defineProject({ workflows: [workflow], localTaskPrepareAction: "./actions/task-prepare" });
Deno.exitCode = await runProject({ project, entrypointUrl: import.meta.url });`,
    );
    const run = (diagnostics: string, cache: string) =>
      new Deno.Command(Deno.execPath(), {
        args: ["run", "--no-lock", "-A", entry, "generate"],
        cwd: nested,
        env: {
          TSUGIORI_DIAGNOSTICS: diagnostics,
          XDG_CACHE_HOME: cache,
          DENO_DIR: resolve(root, "deno-cache"),
        },
        stdout: "piped",
        stderr: "piped",
      }).output();
    const cache = resolve(root, "cache");
    const failed = await run("1", cache);
    assertEquals(failed.code, 1);
    assertStringIncludes(
      new TextDecoder().decode(failed.stderr),
      "workingDirectory",
    );
    const init = await new Deno.Command("git", {
      args: ["init", "--quiet", root],
      stdout: "null",
      stderr: "piped",
    }).output();
    assertEquals(init.code, 0);
    const generated = await run("1", cache);
    assertEquals(generated.code, 0, new TextDecoder().decode(generated.stderr));
    const yaml = await Deno.readTextFile(resolve(nested, "workflows/ci.yml"));
    assertEquals(parse(yaml).jobs.ci.steps[0].uses, "./.github/actions/foo");
    assertEquals(
      parse(yaml).jobs.ci.steps[2].with["project-directory"],
      ".github",
    );
    assert((await Deno.stat(resolve(nested, "actions/foo/action.yml"))).isFile);
    const records = [];
    for await (
      const file of Deno.readDir(resolve(cache, "tsugiori/diagnostics"))
    ) {
      records.push(
        JSON.parse(
          await Deno.readTextFile(
            resolve(cache, "tsugiori/diagnostics", file.name),
          ),
        ),
      );
    }
    assert(
      records.some((record) =>
        record.status === "error" &&
        record.operations.some((op: { name: string; errorType?: string }) =>
          op.name === "project.location" &&
          op.errorType === "project_source_invalid"
        )
      ),
    );
    assert(
      records.some((record) =>
        record.status === "success" && record.completeness === "complete" &&
        record.operations.some((
          op: { name: string; attributes?: { source: string } },
        ) => op.name === "project.location" && op.attributes?.source === "git")
      ),
    );
    const disabledCache = resolve(root, "disabled");
    assertEquals((await run("0", disabledCache)).code, 0);
    assertEquals(
      await Deno.readTextFile(resolve(nested, "workflows/ci.yml")),
      yaml,
    );
    await assertRejects(
      () => Deno.stat(resolve(disabledCache, "tsugiori/diagnostics")),
      Deno.errors.NotFound,
    );
    await Deno.writeTextFile(resolve(root, "broken-cache"), "blocked");
    assertEquals((await run("1", resolve(root, "broken-cache"))).code, 0);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
