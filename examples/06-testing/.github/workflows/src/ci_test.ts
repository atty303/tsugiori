import assert from "node:assert/strict";
import { scenario } from "@atty303/tsugiori/github-actions";
import { ci } from "./ci.ts";

Deno.test("scenario reaches the consumer when files are present", async () => {
  await scenario(ci, (test) => {
    test.github({ event_name: "workflow_dispatch", event: {} });
    test.job("inspect", (job) => {
      job.step("checkout").fixture({});
      job.step("collect").fixture({
        outputs: { files: ["one.ts"], hasFiles: "true" },
      });
      job.step("count").fixture({}).expectRun().expectInputs({
        files: ["one.ts"],
      });
    });
  });
});

Deno.test("scenario skips the consumer when no files are present", async () => {
  const result = await scenario(ci, (test) => {
    test.github({ event_name: "workflow_dispatch", event: {} });
    test.job("inspect", (job) => {
      job.step("checkout").fixture({});
      job.step("collect").fixture({
        outputs: { files: [], hasFiles: "false" },
      });
      job.step("count").expectSkip();
    });
  });
  assert.equal(result.jobs.inspect.result, "success");
});
