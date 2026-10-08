import { textValue } from "../src/task/mod.ts";
import {
  eventIs,
  type Expression,
  literal,
  workflow,
} from "../src/github_actions/mod.ts";
import { scenario } from "../src/testing/mod.ts";

function typecheck() {
  // @ts-expect-error a host literal cannot establish a runtime event proof
  eventIs({ event_name: literal("issues") }, "issues");

  const push = workflow("push.yml", { on: { push: {} } }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        name: "Test",
        id: "step",
        run: "true",
        env: ({ github }) => {
          const ref: Expression<string> = github.event.ref;
          // @ts-expect-error Actions omits webhook-only changed-file lists
          github.event.commits[0].added;
          // @ts-expect-error event-specific unknown property
          github.event.issue;
          return { REF: ref };
        },
      }),
  );
  const multi = workflow("multi.yml", { on: { push: {}, issues: {} } })
    .job("job", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .when(({ github }) => eventIs(github, "issues"))
        .run({
          name: "Test",
          id: "step",
          run: "true",
          env: ({ github }) => {
            const title: Expression<string> = github.event.issue.title;
            // @ts-expect-error wrong event's payload
            github.event.ref;
            return { TITLE: title };
          },
        }));
  workflow("pr.yml", { on: { pull_request: {} } }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({
        name: "Test",
        run: "true",
        env: ({ github }) => ({ BASE: github.event.pull_request.base.ref }),
      }),
  );
  // @ts-expect-error unsupported activity
  workflow("bad.yml", { on: { issues: { types: ["not_real"] } } });
  workflow("bad.yml", { on: { push: {} } }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").when(({ github }) =>
        // @ts-expect-error undeclared event cannot narrow
        eventIs(github, "issues")
      ).run({ name: "Test", run: "true" }),
  );
  void scenario(push, (test) => {
    test.github({ event_name: "push", event: { ref: "refs/heads/main" } });
    // @ts-expect-error event not declared
    test.github({ event_name: "issues" });
    // @ts-expect-error wrong payload value type
    test.github({ event_name: "push", event: { ref: 123 } });
    // @ts-expect-error wrong property
    test.github({ event_name: "push", event: { invalid: true } });
  });
  const dispatch = workflow("dispatch.yml", {
    on: {
      workflow_dispatch: {
        inputs: { enabled: { type: "boolean" }, count: { type: "number" } },
      },
    },
  }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").run({ name: "Check", run: "true" }),
  );
  void scenario(dispatch, (test) => {
    test.inputs({ enabled: true, count: 3 });
    // @ts-expect-error native fixture retains declared values
    test.inputs({ enabled: "true" });
    // @ts-expect-error unknown declared input
    test.inputs({ missing: true });
    test.github({
      event_name: "workflow_dispatch",
      // @ts-expect-error payload input names follow declarations
      event: { inputs: { missing: "true" } },
    });
  });
  workflow("activity.yml", { on: { issues: {} } }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .when(({ github }) => eventIs(github, "issues", "edited"))
        .run({
          name: "Check",
          run: "true",
          env: ({ github }) => {
            const action: Expression<"edited"> = github.event.action;
            return { ACTION: action };
          },
        }),
  );
  workflow("task.yml", { on: { push: {}, issues: {} } }).job(
    "job",
    ({ job }) =>
      job.runsOn("ubuntu-latest").task({
        name: "Read",
        if: ({ github }) => eventIs(github, "issues"),
        inputs: ({ github }) => ({
          title: { contract: textValue(), from: github.event.issue.title },
        }),
        run: () => {},
      }),
  );
  const calleeDispatch = workflow("callee.yml", { on: { workflow_call: {} } })
    .job("job", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .when(({ github }) => eventIs(github, "workflow_dispatch"))
        .run({
          name: "Read",
          run: "true",
          env: ({ github }) => ({ INPUT: github.event.inputs.callerInput }),
        }));
  void scenario(calleeDispatch, (test) => {
    test.github({
      event_name: "workflow_dispatch",
      event: { inputs: { callerInput: "true" } },
    });
    test.github({
      event_name: "workflow_dispatch",
      // @ts-expect-error inherited dispatch payload values are strings
      event: { inputs: { callerInput: 123 } },
    });
  });
  void multi;
}
void typecheck;
import type {
  Activity,
  EventPayload,
  WorkflowEvent,
} from "../src/github_actions/events.ts";
type MissingPayloads = {
  [E in WorkflowEvent]: [EventPayload<E>] extends [never] ? E
    : never;
}[WorkflowEvent];
type ActionOf<T> = T extends { action?: infer A } ? A : never;
type MissingActivities = {
  [E in Exclude<WorkflowEvent, "repository_dispatch">]: Exclude<
    Activity<E>,
    ActionOf<EventPayload<E>>
  >;
}[Exclude<WorkflowEvent, "repository_dispatch">];
const allPayloadsTyped: MissingPayloads extends never ? true : false = true;
const allActivitiesTyped: MissingActivities extends never ? true : false = true;
void [allPayloadsTyped, allActivitiesTyped];
