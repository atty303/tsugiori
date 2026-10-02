import { assert, assertEquals } from "@std/assert";
import { githubActionsSpec } from "../packages/core/src/github_actions/github_spec.ts";
import { githubExpressionScopes } from "../packages/core/src/github_actions/expression_scope.ts";
import manifest from "../deno.json" with { type: "json" };

Deno.test("fixed spec identity, coverage and source manifest are internally consistent offline", () => {
  assertEquals(githubActionsSpec.tsugioriVersion, manifest.version);
  assert(/^[a-f0-9]{40}$/.test(githubActionsSpec.docsRevision));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(githubActionsSpec.verifiedOn));
  const sources: Readonly<Record<string, { sha256: string; url: string }>> =
    githubActionsSpec.sources;
  const entries = new Set<string>();
  for (const item of githubActionsSpec.coverage) {
    assert(sources[item.source]);
    assert(["implemented", "limited", "unsupported"].includes(item.status));
    assert(item.notes.trim());
    const id = `${item.domain}:${item.key}`;
    assert(!entries.has(id), id);
    entries.add(id);
  }
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
