import {
  compositeAction,
  project,
  textValue,
  workflow as makeWorkflow,
} from "../src/github_actions/mod.ts";

const draft = compositeAction("actions/greet/action.yml", {
  name: "Greet",
  description: "Greeting",
  inputs: {
    who: { description: "Recipient", required: true },
    optional: { description: "Optional", default: "world" },
  },
  outputs: { greeting: { description: "Greeting" } },
});
const action = draft.steps(({ step }) =>
  step
    .run({
      id: "one",
      name: "First",
      shell: "bash",
      run: "echo ok",
      outputs: ["value"],
      env: ({ inputs }) => ({ WHO: inputs.who }),
    })
    .task({
      id: "two",
      name: "Second",
      workingDirectory: "./build",
      inputs: { who: { contract: textValue(), from: draft.inputs.who } },
      outputs: { value: { contract: textValue(), required: true } },
      run: async ({ inputs, outputs }) => {
        await outputs.set("value", inputs.who);
      },
    })
    .outputs(({ steps }) => ({ greeting: steps.two.outputs.value }))
);
function checkWorkflow() {
  const workflow = makeWorkflow(".github/workflows/greet.yml", {
    on: { push: {} },
  }).job("greet", ({ job }) => {
    const start = job.runsOn("ubuntu-latest");
    // @ts-expect-error required input
    start.uses(action);
    // @ts-expect-error undeclared input
    start.uses(action, { with: { who: "world", other: "unknown" } });
    const invoked = start.uses(action, { id: "greet", with: { who: "world" } });
    invoked.steps.greet.outputs.greeting;
    // @ts-expect-error undeclared output
    invoked.steps.greet.outputs.missing;
    return invoked;
  });
  project({ actions: [action] });
  project({ workflows: [workflow], actions: [action] });
}
void checkWorkflow;
function checkComposite() {
  draft.steps(({ step }) => {
    // @ts-expect-error shell required
    step.run({ name: "No shell", run: "echo ok" });
    const first = step.run({ name: "First", shell: "bash", run: "echo ok" });
    // @ts-expect-error shell required after first step too
    first.run({ name: "No shell", run: "echo ok" });
    const timeout = {
      name: "Timeout",
      shell: "bash",
      run: "echo ok",
      timeoutMinutes: 1,
    } as const;
    // @ts-expect-error composite step timeout is not supported
    first.run(timeout);
    first.run({
      name: "Inputs",
      shell: "bash",
      run: "echo ok",
      env: ({ inputs, secrets }) => ({
        // @ts-expect-error undeclared input
        VALUE: inputs.unknown,
        // @ts-expect-error composite actions cannot directly access secrets
        SECRET: secrets.TOKEN,
      }),
    });
    return first;
  });
}
void checkComposite;
