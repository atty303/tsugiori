import assert from "node:assert/strict";
// Interpret workflow logic without executing task bodies.
import { scenario } from "@atty303/tsugiori/github-actions";
import { ci } from "./ci.ts";

Deno.test("scenario reaches the consumer when files are present", async () => {
  // Run a workflow scenario with supplied step results.
  const result = await scenario(ci, (test) => {
    // Supply the dispatch event context.
    test.github({ event_name: "workflow_dispatch", event: {} });
    // Inspect the one job and its ordered steps.
    test.job("inspect", (job) => {
      // Let the checkout step succeed without running the Action.
      job.step("checkout").fixture({});
      // Supply the collector's outputs without calling collectFiles.
      job.step("collect").fixture({
        // Declare the outputs visible to later steps.
        outputs: { files: ["one.ts"], hasFiles: "true" },
      });
      // Check execution and typed input forwarding to count.
      job.step("count").fixture({});
    });
  });
  const consumer = result.jobs.inspect!.instances[0].steps.count!;
  assert.equal(consumer.outcome, "success");
  assert.deepEqual(consumer.inputs.files, ["one.ts"]);
});

Deno.test("scenario skips the consumer when no files are present", async () => {
  // Evaluate the same workflow with an empty collector output.
  const result = await scenario(ci, (test) => {
    // Supply the dispatch event context.
    test.github({ event_name: "workflow_dispatch", event: {} });
    // Select the job whose steps the scenario interprets.
    test.job("inspect", (job) => {
      // Let checkout succeed without running it.
      job.step("checkout").fixture({});
      // Simulate an empty file list from the collector.
      job.step("collect").fixture({
        // Declare the outputs visible to later steps.
        outputs: { files: [], hasFiles: "false" },
      });
    });
  });
  assert.equal(result.jobs.inspect!.result, "success");
  assert.equal(
    result.jobs.inspect!.instances[0].steps.count!.outcome,
    "skipped",
  );
});
