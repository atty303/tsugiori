import {
  type Expression,
  rawNode,
  workflow,
  type WorkflowInputValues,
} from "../src/github_actions/mod.ts";
import * as api from "../src/github_actions.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type UnionInputs = WorkflowInputValues<{
  push: Record<never, never>;
  workflow_dispatch: {
    inputs: {
      shared: { type: "choice"; options: readonly ["x"] };
      dispatchOnly: { type: "string" };
    };
  };
  workflow_call: {
    inputs: { shared: { type: "boolean" }; callOnly: { type: "number" } };
  };
}>;
type Check = [
  Assert<Equal<UnionInputs["shared"], string | boolean>>,
  Assert<Equal<UnionInputs["dispatchOnly"], string>>,
  Assert<Equal<UnionInputs["callOnly"], number | "">>,
  Assert<
    Equal<
      WorkflowInputValues<
        { workflow_call: { inputs: { n: { type: "number" } } } }
      >["n"],
      number
    >
  >,
  Assert<
    Equal<
      WorkflowInputValues<
        {
          workflow_dispatch: {
            inputs: { c: { type: "choice"; options: readonly ["x"] } };
          };
        }
      >["c"],
      string
    >
  >,
  Assert<
    Equal<keyof WorkflowInputValues<{ push: Record<never, never> }>, never>
  >,
];
function assertInputTypes(): void {
  // @ts-expect-error no old-name alias is exported
  void api.defineWorkflow;
  // @ts-expect-error no old-name alias is exported
  void api.defineProject;
  // @ts-expect-error no old-name alias is exported
  void api.defineCompositeAction;
  const flow = workflow(".github/workflows/inputs.yml", {
    on: {
      push: {},
      workflow_dispatch: {
        inputs: {
          shared: { type: "string" },
          dispatchOnly: { type: "choice", options: ["x"] },
        },
      },
      workflow_call: {
        inputs: {
          shared: { type: "boolean", required: true },
          callOnly: { type: "number" },
        },
        secrets: { token: { required: true } },
      },
    },
  });
  const shared: Expression<string | boolean> = flow.inputs.shared;
  const count: Expression<number | ""> = flow.inputs.callOnly;
  // @ts-expect-error shared includes the dispatch string
  const flag: Expression<boolean> = flow.inputs.shared;
  // @ts-expect-error push and dispatch have no callOnly value
  const numeric: Expression<number> = flow.inputs.callOnly;
  // @ts-expect-error undeclared input
  void flow.inputs.missing;
  const finished = flow.job("run", ({ job }) =>
    job.runsOn("ubuntu-latest")
      .when(({ inputs }) => {
        const check: Expression<string | boolean> = inputs.shared;
        // @ts-expect-error declared names only
        void inputs.missing;
        void check;
        return inputs.shared.eq(true);
      }).strategy({ matrix: { os: ["linux"] } }).run({
        name: "Run",
        run: "true",
        env: ({ inputs }) => ({
          COUNT: (() => {
            const value: Expression<number | ""> = inputs.callOnly;
            return value;
          })(),
        }),
      }).outputs(({ inputs }) => ({ value: inputs.shared })));
  finished.job(
    "dependent",
    ({ job, jobs }) =>
      job.needs(jobs.run).runsOn("ubuntu-latest").run({
        name: "Use",
        run: "true",
        if: ({ inputs }) => {
          // @ts-expect-error propagated through needs and steps
          void inputs.missing;
          return inputs.dispatchOnly.eq("x");
        },
      }),
  );
  flow.job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/finished.yml", finished, {
        // @ts-expect-error common string union cannot weaken boolean call contract
        with: { shared: "x" },
        secrets: "inherit",
      }),
  );
  flow.job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/finished.yml", finished, {
        // @ts-expect-error dispatch-only input is not in the call contract
        with: { shared: true, dispatchOnly: "x" },
        secrets: "inherit",
      }),
  );
  flow.job(
    "call",
    ({ job }) =>
      job.reusable().call("./.github/workflows/finished.yml", finished, {
        with: { shared: true, callOnly: 1 },
        // @ts-expect-error call secrets remain required
        secrets: {},
      }),
  );
  flow.job(
    "call",
    ({ job }) =>
      job.reusable().call(
        "./.github/workflows/finished.yml",
        finished,
        {
          with: ({ inputs }) => ({
            shared: rawNode<boolean>("true"),
            callOnly: inputs.callOnly.as<number>(),
          }),
          secrets: "inherit",
        },
      ),
  );
  workflow("x", {
    // @ts-expect-error on must be nonempty
    on: {},
  });
  workflow("x", {
    // @ts-expect-error no string shorthand
    on: "push",
  });
  workflow("x", {
    // @ts-expect-error no array shorthand
    on: ["push"],
  });
  workflow("x", {
    on: { push: {} },
    // @ts-expect-error old split field
    events: ["push"],
  });
  workflow("x", {
    on: {
      // @ts-expect-error unsupported trigger
      schedule: {},
      push: {},
    },
  });
  workflow("x", {
    on: {
      // @ts-expect-error filters cannot be attached to another event
      workflow_dispatch: { branches: ["main"] },
    },
  });
  workflow("x", {
    on: {
      workflow_dispatch: {
        inputs: {
          // @ts-expect-error dispatch boolean is outside current coverage
          flag: { type: "boolean" },
        },
      },
    },
  });
  void [shared, count, flag, numeric];
}
void assertInputTypes;
export type { Check };
