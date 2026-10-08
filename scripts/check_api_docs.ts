/** Checks public documentation and typechecks its actual TypeScript blocks. */
type DocObject = Record<string, unknown>;
const root = new URL("../", import.meta.url);
root.pathname = `${await Deno.realPath(root)}/`;
const config = JSON.parse(await Deno.readTextFile(new URL("deno.json", root)));
const entrypoints: string[] = Object.values(config.exports);
const docCommand = await new Deno.Command(Deno.execPath(), {
  cwd: root,
  args: ["doc", "--json", ...entrypoints],
  stdout: "piped",
  stderr: "inherit",
}).output();
if (!docCommand.success) throw new Error("Public API extraction failed.");
const documentation = JSON.parse(new TextDecoder().decode(docCommand.stdout));
const samples = new Map<string, { text: string; location: string }>();
const missing = new Set<string>();
const names = new Map<string, Set<string>>();

function object(value: unknown): value is DocObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function examples(value: unknown, location: string): void {
  if (typeof value !== "string") return;
  for (
    const match of value.matchAll(/```(?:ts|typescript)\r?\n([\s\S]*?)```/g)
  ) {
    const code = match[1].trimEnd();
    // Identical published blocks share one typecheck, not a copied fixture.
    samples.set(code, { text: value, location });
  }
}
function isSettingExpression(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isSettingExpression);
  if (!object(value)) return false;
  if (value.kind === "fnOrConstructor") return true;
  if (
    value.kind === "typeRef" && object(value.value) &&
    ["Expression", "StepField", "Field", "StepEnv", "JobEnv"].includes(
      String(value.value.typeName),
    )
  ) return true;
  return Object.entries(value).some(([key, child]) =>
    key !== "resolution" && isSettingExpression(child)
  );
}
function walk(value: unknown, path: string, requireDocs = true): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, path, requireDocs);
    return;
  }
  if (!object(value)) return;
  const here = object(value.location)
    ? `${String(value.location.filename)}:${
      Number(value.location.line) + 1
    } ${path}.${String(value.name ?? "")}`
    : path;
  if (object(value.jsDoc)) {
    examples(value.jsDoc.doc, here);
    for (const tag of (value.jsDoc.tags ?? []) as DocObject[]) {
      if (tag.kind === "example") examples(tag.doc, here);
    }
  }
  if (requireDocs && value.name && value.location && !value.jsDoc) {
    missing.add(here);
  }
  if (
    requireDocs && value.name && value.location &&
    (value.kind === "method" || value.kind === "function" ||
      value.name === "constructor" || isSettingExpression(value.tsType) ||
      (value.kind === "variable" && object(value.def) &&
        isSettingExpression(value.def.tsType)))
  ) {
    const tags = object(value.jsDoc)
      ? value.jsDoc.tags as DocObject[] ?? []
      : [];
    if (!tags.some((tag) => tag.kind === "example")) {
      missing.add(`${here}: call example`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "jsDoc" && key !== "location") walk(child, path, requireDocs);
  }
}
for (const [file, module] of Object.entries(documentation.nodes)) {
  const mod = module as {
    symbols: { name: string; declarations: DocObject[] }[];
    module_doc?: unknown;
  };
  walk(mod.module_doc, file);
  const exported = new Set<string>();
  for (const symbol of mod.symbols) {
    for (const declaration of symbol.declarations) {
      if (declaration.declarationKind !== "export") {
        // Shared option types contribute public properties and published examples.
        walk(
          declaration.def,
          symbol.name,
          ["StepCommon", "ObjectUsesStepOptions", "JobOptions"].includes(
            symbol.name,
          ),
        );
        continue;
      }
      exported.add(symbol.name);
      if (declaration.kind === "reference") continue;
      walk({ ...declaration, name: symbol.name }, symbol.name);
    }
  }
  names.set(file, exported);
}
if (missing.size) {
  throw new Error(`Missing public JSDoc/examples:\n${[...missing].join("\n")}`);
}

// README snippets are verified against the standalone example projects by
// tests/readme_examples_test.ts, where their real imports and context apply.

const imports = new Map<string, string>();
for (
  const path of entrypoints.filter((path) =>
    path !== config.exports["./github-actions"]
  )
) {
  const url = new URL(path, root).href;
  for (const name of names.get(url) ?? []) {
    if (name !== "case" && !imports.has(name)) imports.set(name, url);
  }
}
if (!imports.size) {
  throw new Error(
    "Public entrypoint names were not resolved from documentation output.",
  );
}
const importCode = [...imports].map(([name, url]) =>
  `import { ${name} } from ${JSON.stringify(url)};`
).join("\n");
const setup = `
declare const logger: TaskLogger;
const sampleWorkflow = workflow(".github/workflows/doc.yml", { on: { push: {} } })
  .job("build", ({ job }) => job.runsOn("ubuntu-latest")
    .strategy({ matrix: { stage: ["dev", "prd"] } })
    .task({ id: "build", name: "Build", inputs: ({ github }) => ({ sha: { contract: textValue(), from: github.sha } }),
      outputs: { version: { contract: textValue(), required: true } }, run: async ({ outputs }) => { await outputs.set("version", "1.0.0"); } })
    .outputs(({ steps }) => ({ version: steps.build.outputs.version })))
  .job("deploy", ({ job, jobs }) => job.needs(jobs.build).runsOn("ubuntu-latest").run({ id: "deploy", name: "Deploy", run: "true" }));
const versionAction = compositeAction("actions/version", { name: "Version", description: "Version", outputs: { version: { description: "Version" } } })
  .steps(({ step }) => step.run({ id: "build", name: "Build", shell: "bash", run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"', outputs: ["version"] }).outputs(({ steps }) => ({ version: steps.build.outputs.version })));
const inputAction = compositeAction("actions/greet", { name: "Greet", description: "Greet", inputs: { who: { description: "Recipient", required: true } } });
declare const outputs: TaskContext<{}, { version: { contract: ValueContract<string, "text">; required: true } }>["outputs"];
const stagesContract = jsonValue({ parse(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new TypeError("Expected stage names");
  return value;
} });
const optionalWorkflow = workflow(".github/workflows/optional.yml", { on: { push: {} } })
  .job("prepare", ({ job }) => job.runsOn("ubuntu-latest").task({ id: "plan", name: "Plan", inputs: {}, outputs: { stages: { contract: stagesContract, required: false } }, run: async ({ outputs }) => { await outputs.set("stages", ["dev", "prd"]); } }).outputs(({ steps }) => ({ stages: steps.plan.outputs.stages })));
const ci = sampleWorkflow;
const config = project({ workflows: [sampleWorkflow] });
function configureScenario(test: WorkflowScenario<TestJobsOf<typeof sampleWorkflow>, { push: {} }>) {
  test.github({ event_name: "push", ref: "refs/heads/main", sha: "abc", event: {} });
  test.job("build", (job) => { job.eachMatrix(({ stage }, instance) => { instance.step("build").fixture({ outputs: { version: stage } }); }); });
  test.job("deploy", (job) => { job.step("deploy").fixture({}); });
}
const test = new WorkflowScenario<TestJobsOf<typeof sampleWorkflow>>();
const testJob = new JobScenario<TestJobsOf<typeof sampleWorkflow>["build"]>({ steps: new Map(), internals: new Map() });
const testStep = testJob.step("build");
const reusable = workflow(".github/workflows/reusable.yml", { on: { workflow_call: {} } })
  .job("build", ({ job }) => job.runsOn("ubuntu-latest").run({ id: "build", name: "Build", run: "true" }));
const draft = compositeAction("actions/version", { name: "Version", description: "Expose version", outputs: { version: { description: "Version" } } });
function compositeFixture(step: Parameters<Parameters<typeof draft.steps>[0]>[0]["step"]) {
  return step.run({ id: "build", name: "Build", shell: "bash", run: 'echo "version=1.0.0" >> "$GITHUB_OUTPUT"', outputs: ["version"] });
}
`;
// Preserve concrete IDs and output names in the composite prerequisite.
const compositeType = "ReturnType<typeof compositeFixture>";
const files: string[] = [];
const directory = await Deno.makeTempDir({ prefix: "tsugiori-api-doc-" });
try {
  let index = 0;
  const locations: string[] = [];
  let source = importCode + setup;
  for (const [code, sample] of samples) {
    locations.push(`${index}: ${sample.location}`);
    if (/^(?:import|export)\b/m.test(code)) {
      const path = `${directory}/module-${index++}.ts`;
      await Deno.writeTextFile(path, code);
      files.push(path);
      continue;
    }
    let body = code;
    if (sample.text.includes("Given typed optional references:")) {
      body = `optionalWorkflow.job("deploy", ({ job, jobs }) => {
const depends = job.needs(jobs.prepare).runsOn("ubuntu-latest");
const guarded = depends.when(({ needs }) => present(needs.prepare.outputs.stages));
${code}
return depends.run({ name: "End", run: "true" });
});`;
    } else if (sample.text.includes("callback with `{ job }`")) {
      body =
        `workflow(".github/workflows/example.yml", { on: { push: {} } }).job("example", ({ job }) => {\n${code}\nreturn job.runsOn("ubuntu-latest").run({ name: "End", run: "true" });\n});`;
    } else if (sample.text.includes("composite state `built`")) {
      body = `function example(built: ${compositeType}) {\n${code}\n}`;
    }
    source +=
      `\n// Published sample ${index}: ${sample.location}\nasync function sample${index++}() {\n${body}\n}\n`;
  }
  const path = `${directory}/examples.ts`;
  await Deno.writeTextFile(path, source);
  files.push(path);
  const exampleImports = Object.fromEntries(
    Object.entries(config.exports as Record<string, string>).map((
      [name, path],
    ) => [`${config.name}/${name.slice(2)}`, new URL(path, root).href]),
  );
  await Deno.writeTextFile(
    `${directory}/deno.json`,
    JSON.stringify({ imports: { ...config.imports, ...exampleImports } }),
  );
  const checked = await new Deno.Command(Deno.execPath(), {
    cwd: root,
    args: ["check", "--config", `${directory}/deno.json`, ...files],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!checked.success) {
    console.error(new TextDecoder().decode(checked.stderr));
    console.error(locations.join("\n"));
    throw new Error("Published API examples failed typechecking.");
  }
  console.log(
    `Checked public JSDoc and ${samples.size} distinct published TypeScript examples across ${entrypoints.length} entrypoints.`,
  );
} finally {
  await Deno.remove(directory, { recursive: true });
}
