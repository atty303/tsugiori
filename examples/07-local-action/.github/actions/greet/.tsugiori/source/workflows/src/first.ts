import { defineWorkflow } from "@atty303/tsugiori/github-actions";
import checkout from "#actions/actions/checkout";
import { greet } from "../../actions/greet/src/mod.ts";

export const first = defineWorkflow("workflows/first.yml", {
  name: "Greet from the first workflow",
  on: { workflow_dispatch: {} },
  permissions: { contents: "read" },
}).job("greet", ({ job }) =>
  job.runsOn("ubuntu-24.04")
    .uses(checkout, { name: "Checkout" })
    .uses(greet, { id: "greeting", with: { who: "Ada" } })
    .run({
      name: "Show greeting",
      run: "printf '%s\\n' \"$MESSAGE\"",
      env: ({ steps }) => ({ MESSAGE: steps.greeting.outputs.message }),
    }));
