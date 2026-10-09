import { checkedScenario as scenario } from "./scenario_checks.ts";
import { activities } from "../src/github_actions/events.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { githubActionsSpec } from "../src/github_actions/github_spec.ts";
import { githubExpressionScopes } from "../src/github_actions/expression_scope.ts";
import manifest from "../deno.json" with { type: "json" };
import {
  contains,
  format,
  hashFiles,
  project,
  workflow,
} from "../src/github_actions.ts";
import { lowerProject } from "../src/compiler/authoring.ts";
import { emitWorkflow } from "../src/compiler/github_actions/emitter.ts";
import { parse } from "../src/deps.ts";

Deno.test("fixed spec identity, coverage and source manifest are internally consistent offline", () => {
  assertEquals(githubActionsSpec.tsugioriVersion, manifest.version);
  assertEquals(githubActionsSpec.schemaVersion, 2);
  assert(/^[a-f0-9]{40}$/.test(githubActionsSpec.docsRevision));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(githubActionsSpec.verifiedOn));
  const sources: Readonly<Record<string, { sha256: string; url: string }>> =
    githubActionsSpec.sources;
  const entries = new Set<string>();
  for (const item of githubActionsSpec.coverage) {
    assert(sources[item.source]);
    assert(
      ["implemented", "limited", "unimplemented", "excluded", "reference"]
        .includes(item.status),
      item.key,
    );
    assert(item.notes.trim());
    const id = `${item.domain}:${item.key}`;
    assert(!entries.has(id), id);
    entries.add(id);
  }
  for (const item of githubActionsSpec.coverage) {
    for (const related of item.related ?? []) {
      assert(entries.has(related), related);
    }
    for (const evidence of item.evidence ?? []) {
      assert(Deno.statSync(evidence).isFile, evidence);
    }
  }
  assert(
    !entries.has("reuse-reference:Placeholder values in the `runs-on` key"),
  );
  for (const key of Object.keys(githubExpressionScopes)) {
    assert(githubActionsSpec.coverage.some((e) => e.key === key), key);
  }
  for (
    const key of [
      "jobs.<job_id>.result",
      "jobs.<job_id>.outputs",
      "jobs.<job_id>.outputs.<output_name>",
    ]
  ) assert(entries.has(`context:${key}`));
  for (
    const key of [
      "nesting-depth",
      "unique-workflow-count",
      "caller-env-isolation",
      "callee-env-isolation",
      "repository-variables",
      "caller-keywords",
    ]
  ) assert(entries.has(`reuse-constraint:${key}`));
  for (
    const key of [
      "pull_request.opened",
      "pull_request.labeled",
      "pull_request_target.opened",
      "release.published",
    ]
  ) assert(entries.has(`event-activity:${key}`));
  assertEquals(
    githubActionsSpec.coverage.filter((e) =>
      e.domain === "event-activity" &&
      e.key.startsWith("pull_request_review_comment.")
    ).map((e) => e.key).sort(),
    [
      "pull_request_review_comment.created",
      "pull_request_review_comment.deleted",
      "pull_request_review_comment.edited",
    ],
  );
  assert(
    githubActionsSpec.coverage.some((e) =>
      e.domain === "reuse-reference" &&
      e.key === "Behavior of reusable workflows when re-running jobs"
    ),
  );
  for (const source of Object.values(sources)) {
    assert(/^[a-f0-9]{64}$/.test(source.sha256));
    assert(source.url.includes(`/blob/${githubActionsSpec.docsRevision}/`));
  }
  for (
    const event of [
      "push",
      "pull_request",
      "pull_request_target",
      "workflow_call",
      "workflow_dispatch",
    ]
  ) assert(entries.has(`event:${event}`));
  for (
    const operator of [
      "( )",
      "[ ]",
      ".",
      "!",
      "<",
      "<=",
      ">",
      ">=",
      "==",
      "!=",
      "&&",
      "||",
    ]
  ) assert(entries.has(`expression-operator:${operator}`));
});

Deno.test("coverage separates implementation scope, exclusions and references within one inventory", () => {
  const items = githubActionsSpec.coverage;
  const implementationScope = items.filter((item) =>
    ["implemented", "limited", "unimplemented"].includes(item.status)
  );
  const excluded = items.filter((item) => item.status === "excluded");
  const references = items.filter((item) => item.status === "reference");
  assertEquals(
    implementationScope.length + excluded.length + references.length,
    items.length,
  );
  assert(items.some((item) => item.status === "unimplemented"));
  for (
    const item of items.filter((item) => item.domain === "context-availability")
  ) {
    assertEquals(item.status, "reference", item.key);
    assert(item.related?.some((id) => id.startsWith("syntax:")), item.key);
  }
  const hashUnits = [
    ["expression", "hashFiles", "implemented"],
    ["scenario-capability", "hashFiles-result-fixture", "implemented"],
    ["execution-capability", "hashFiles-filesystem", "excluded"],
  ];
  for (const [domain, key, status] of hashUnits) {
    const row = items.find((item) =>
      item.domain === domain && item.key === key
    );
    assert(row, key);
    assertEquals(row.status, status, key);
    assert(row.related?.length, key);
  }
});

Deno.test("template default-branch support preserves the placeholder through public authoring and emission", () => {
  const template = workflow("template.yml", {
    on: { push: { branches: ["$default-branch"] } },
  }).job(
    "build",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ name: "Build", run: "true" }),
  );
  const lowered = lowerProject(
    project({ workflows: [template] }),
    "./workflows.ts",
  );
  const emitted = parse(emitWorkflow(lowered.workflows[0].workflow));
  assertEquals(emitted.on.push.branches, ["$default-branch"]);
  assertEquals(
    githubActionsSpec.coverage.find((item) =>
      item.key === "The `$default-branch` placeholder"
    )?.status,
    "implemented",
  );
});

Deno.test("hashFiles emits natively and return fixtures preserve surrounding expressions", async () => {
  const flow = workflow("hash.yml", { on: { push: {} } }).job(
    "check",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        id: "read",
        name: "Read hash field",
        run: "true",
        if: () => contains(hashFiles("deno.lock"), "abc"),
        env: () => ({ HASH: format("prefix-{0}", hashFiles("deno.lock")) }),
      }),
  );
  const lowered = lowerProject(
    project({ workflows: [flow] }),
    "./workflows.ts",
  );
  const step =
    parse(emitWorkflow(lowered.workflows[0].workflow)).jobs.check!.steps[0];
  assertEquals(step.if, "${{ contains(hashFiles('deno.lock'), 'abc') }}");
  assertEquals(
    step.env.HASH,
    "${{ format('prefix-{0}', hashFiles('deno.lock')) }}",
  );
  const missing = await assertRejects(() =>
    scenario(
      flow,
      (test, _check) => test.github({ event_name: "push", event: {} }),
    )
  );
  assertEquals((missing as { kind?: string }).kind, "fixture_missing");
  await scenario(flow, (test, check) => {
    test.github({ event_name: "push", event: {} });
    test.job("check", (job) => {
      job.step("read")
        .hashFiles(["deno.lock"], "abc")
        .fixture(({ env }) => {
          assertEquals(env.HASH, "prefix-abc");
          return {};
        });

      check((r) => {
        for (const i0 of r.jobs["check"]!.instances) {
          assertEquals(i0.steps["read"]!.outcome !== "skipped", true);
        }
      });
    });
  });
});

Deno.test("trigger coverage agrees with the supported frozen event and activity catalog", () => {
  const items = githubActionsSpec.coverage;
  assertEquals(
    items.filter((item) =>
      item.domain === "event" && item.status === "implemented"
    )
      .map((item) => item.key).sort(),
    Object.keys(activities).sort(),
  );
  for (const [event, types] of Object.entries(activities)) {
    assert(
      items.some((item) =>
        item.domain === "event" && item.key === event &&
        item.status === "implemented"
      ),
      event,
    );
    for (const activity of types) {
      assert(
        items.some((item) =>
          item.domain === "event-activity" &&
          item.key === `${event}.${activity}` && item.status === "implemented"
        ),
        `${event}.${activity}`,
      );
    }
  }
  for (const item of items) assert(item.assessment.length > 0, item.key);
  assertEquals(githubActionsSpec.payloadTypes.version, "12.2.0");
});
