import {
  type Expression,
  fromJSON,
  literal,
  type MatrixRow,
  workflow,
} from "../src/github_actions/mod.ts";
import type { ReferenceRequired } from "../src/github_actions/expression.ts";
import { scenario } from "../src/testing/mod.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type _Nested = Expect<
  Equal<
    MatrixRow<
      {
        node: readonly [
          { readonly version: 20 },
          { readonly version: 22; readonly env: "experimental" },
        ];
      }
    >,
    {
      readonly node: {
        readonly version: 20 | 22;
        readonly env: "experimental" | undefined;
      };
    }
  >
>;
type _MissingAxis = Expect<
  Equal<
    MatrixRow<
      { os: readonly ["linux"]; include: readonly [{ readonly report: true }] }
    >["os"],
    "linux" | undefined
  >
>;
type _Added = Expect<
  Equal<
    MatrixRow<
      {
        os: readonly ["linux"];
        include: readonly [{ readonly os: "linux"; readonly report: true }];
      }
    >["report"],
    true | undefined
  >
>;

function matrixTypes() {
  const ci = workflow("matrix.yml", { on: { push: {} }, vars: ["PARALLEL"] })
    .job("test", ({ job }) => {
      const exec = job.runsOn("ubuntu-latest").strategy({
        matrix: {
          node: [{ version: 20 }, { version: 22, experimental: true }],
          os: ["ubuntu-latest", "macos-latest"],
          include: [{
            os: "windows-latest",
            node: { version: 24, experimental: false },
            extra: true,
          }],
          exclude: [{ os: "macos-latest", node: { version: 20 } }],
        },
        failFast: literal(false),
        maxParallel: literal(2),
      });
      // @ts-expect-error job failure tolerance excludes secrets
      exec.continueOnError(({ secrets }) => secrets.TOKEN);
      // @ts-expect-error job failure tolerance requires boolean
      exec.continueOnError(() => literal(1));
      // @ts-expect-error strategy excludes its future matrix context
      exec.strategy(({ matrix }) => ({
        matrix: { node: [22] },
        failFast: matrix.flag,
      }));
      // @ts-expect-error max-parallel requires a number expression
      exec.strategy({ matrix: { node: [22] }, maxParallel: literal("2") });
      return exec.runsOn(({ matrix }) => {
        const version: Expression<20 | 22 | 24> = matrix.at("node").version;
        const experimental: Expression<boolean | undefined> =
          matrix.at("node").experimental;
        void version;
        void experimental;
        // @ts-expect-error absent nested fields cannot be guaranteed
        const required: Expression<boolean> = matrix.at("node").experimental;
        void required;
        return matrix.os;
      }).continueOnError(({ matrix }) =>
        matrix.at("node").experimental.or(literal(false))
      )
        .task({
          id: "probe",
          name: "Probe",
          continueOnError: ({ matrix }) =>
            matrix.at("node").experimental.or(literal(false)),
          outputs: { version: { required: true } },
          run: () => {},
        }).run({
          id: "report",
          name: "Report",
          run: "true",
          continueOnError: ({ steps }) => steps.probe.outcome.eq("failure"),
          env: ({ steps }) => {
            type _OptionalOutput = Expect<
              Equal<
                ReferenceRequired<typeof steps.probe.outputs.version>,
                false
              >
            >;
            return { VERSION: steps.probe.outputs.version.or("missing") };
          },
        });
    });
  scenario(
    ci,
    (test) =>
      test.job("test", (job) =>
        job.eachMatrix((matrix, instance) => {
          const version: 20 | 22 | 24 = matrix.node.version;
          const extra: true | undefined = matrix.extra;
          void version;
          void extra;
          void instance;
        })),
  );
  workflow("call.yml", { on: { push: {} } }).job(
    "call",
    ({ job }) =>
      job.reusable()
        .strategy({
          matrix: {
            node: [{ version: 22 }],
            include: [{ node: { version: 24 } }],
          },
          maxParallel: 2,
        })
        .rawCall("owner/repo/.github/workflows/child.yml@main", {
          with: ({ matrix }) => ({ version: matrix.at("node").version }),
        }),
  );
  workflow("explicit.yml", { on: { push: {} } })
    .job("test", ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy<{ os: string }>(() => ({
          matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<
            { os: string }
          >(),
        }))
        .runsOn(({ matrix }) => matrix.os)
        .run({ name: "Test", run: "true" }))
    .job("call", ({ job }) =>
      job.reusable().strategy<{ os: string }>(() => ({
        matrix: fromJSON(literal('{"os":["ubuntu-latest"]}')).as<
          { os: string }
        >(),
      })).rawCall("owner/repo/.github/workflows/child.yml@main", {
        with: ({ matrix }) => ({ os: matrix.os }),
      }));
  workflow("dynamic.yml", { on: { push: {} } }).job(
    "test",
    ({ job }) =>
      job.runsOn("ubuntu-latest")
        .strategy(() => ({
          matrix: {
            node: fromJSON(literal('[{"version":22}]')).as<
              readonly { version: number }[]
            >(),
          },
          maxParallel: 2,
        }))
        .run({ name: "Test", run: "true" }),
  );
}
void matrixTypes;
