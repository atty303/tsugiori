import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { parse } from "../src/deps.ts";
import {
  emitWorkflow,
  validateWorkflow,
  type Workflow,
} from "../src/compiler/github_actions/mod.ts";

Deno.test("emits GitHub Actions YAML in definition order", async (t) => {
  const workflow: Workflow = {
    name: "CI",
    on: { push: {}, pull_request: {} },
    permissions: { contents: "read" },
    jobs: [
      {
        id: "test",
        runsOn: {
          type: "labels",
          labels: ["SELF-HOSTED", "x64", "linux"],
        },
        needs: ["build"],
        steps: [
          {
            type: "run",
            name: "Test",
            id: "test-step",
            if: "github.ref == 'refs/heads/main'",
            continueOnError: true,
            run: "deno test",
          },
          { type: "run", run: "echo first\necho second" },
        ],
      },
      {
        id: "deploy",
        runsOn: {
          type: "group",
          group: "production-runners",
          labels: ["self-hosted", "x64", "linux"],
        },
        needs: ["test", "build"],
        steps: [{ type: "run", name: "Deploy", run: "./deploy" }],
      },
      {
        id: "build",
        runsOn: { type: "labels", labels: ["ubuntu-latest"] },
        needs: [],
        steps: [
          {
            type: "uses",
            name: "Checkout",
            uses: "actions/checkout@v6",
            with: { "persist-credentials": "false", "fetch-depth": "1" },
          },
          { type: "run", name: "Build", run: "deno task build" },
        ],
      },
    ],
  };

  const result = validateWorkflow(workflow);
  assert(result.ok);
  await t.assertSnapshot(emitWorkflow(result.value), {
    serializer: (value) => value,
  });
});

Deno.test("natural run scalars and separators preserve command values", () => {
  const commands = [
    "echo hello",
    "echo 'key: value'",
    "printf x\t| cat",
    "echo first\necho second",
    "echo trailing\n",
    "echo keep\n\n",
    " echo leading space",
    "echo\rvalue",
  ];
  const result = validateWorkflow({
    name: "Readable",
    on: { push: {} },
    jobs: [
      {
        id: "first",
        runsOn: { type: "labels", labels: ["ubuntu-latest"] },
        needs: [],
        steps: [
          { type: "uses", uses: "actions/checkout@v6" },
          ...commands.slice(0, -1).map((run) => ({
            type: "run" as const,
            run,
          })),
          { type: "uses", uses: "actions/cache@v4" },
        ],
      },
      {
        id: "true",
        runsOn: { type: "labels", labels: ["ubuntu-latest"] },
        needs: [],
        steps: [{ type: "run", run: commands.at(-1)! }],
      },
    ],
  });
  assert(result.ok);

  const yaml = emitWorkflow(result.value);
  const parsed = parse(yaml) as {
    jobs: Record<string, { steps: Array<{ run?: string }> }>;
  };
  assertEquals(
    ["first", "true"].flatMap((id) =>
      parsed.jobs[id].steps.flatMap((step) =>
        step.run === undefined ? [] : [step.run]
      )
    ),
    commands,
  );
  assertStringIncludes(
    yaml,
    "uses: actions/checkout@v6\n\n      - run: echo hello",
  );
  assertStringIncludes(
    yaml,
    "run: |-\n          echo first\n          echo second",
  );
  assertStringIncludes(yaml, "run: |\n          echo trailing");
  assertStringIncludes(yaml, "run: |+\n          echo keep");
  assertStringIncludes(yaml, 'run: "echo\\rvalue"');
  assertStringIncludes(yaml, '\n\n  "true":\n');
});

Deno.test("emits job scoped OIDC permission", () => {
  const result = validateWorkflow({
    name: "OIDC",
    on: { push: {} },
    permissions: { contents: "read" },
    jobs: [{
      id: "deploy",
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      needs: [],
      permissions: { contents: "read", "id-token": "write" },
      steps: [{ type: "run", run: "aws sts get-caller-identity" }],
    }],
  });
  assert(result.ok);
  const parsed = parse(emitWorkflow(result.value)) as {
    permissions: Record<string, string>;
    jobs: { deploy: { permissions: Record<string, string> } };
  };
  assertEquals(parsed.permissions, { contents: "read" });
  assertEquals(parsed.jobs.deploy.permissions, {
    contents: "read",
    "id-token": "write",
  });
});

Deno.test("rejects invalid job permissions", () => {
  const result = validateWorkflow({
    name: "OIDC",
    on: { push: {} },
    jobs: [{
      id: "deploy",
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      needs: [],
      permissions: { "id-token": "read", discussions: "write" },
      steps: [{ type: "run", run: "true" }],
    }],
  } as unknown as Workflow);
  assert(!result.ok);
  assertEquals(result.diagnostics.map(({ code, path }) => ({ code, path })), [
    {
      code: "job.permissions.value.invalid",
      path: ["jobs", 0, "permissions", "id-token"],
    },
    {
      code: "job.permissions.key.unsupported",
      path: ["jobs", 0, "permissions", "discussions"],
    },
  ]);
});

Deno.test("matrix run axis does not affect run step formatting", () => {
  const result = validateWorkflow({
    name: "Matrix",
    on: { push: {} },
    jobs: [{
      id: "test",
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      needs: [],
      strategy: {
        matrix: { run: "${{ fromJSON(needs.prepare.outputs.scripts) }}" },
      },
      steps: [{ type: "run", run: "echo test" }],
    }],
  });
  assert(result.ok);

  const parsed = parse(emitWorkflow(result.value)) as {
    jobs: {
      test: { strategy: { matrix: { run: string } }; steps: [{ run: string }] };
    };
  };
  assertEquals(
    parsed.jobs.test.strategy.matrix.run,
    "${{ fromJSON(needs.prepare.outputs.scripts) }}",
  );
  assertEquals(parsed.jobs.test.steps[0].run, "echo test");
});

Deno.test("preserves authored event, label, needs and job order", () => {
  for (
    const events of [["push", "pull_request"], [
      "pull_request",
      "push",
    ]] as const
  ) {
    const labels = ["SELF-HOSTED", "x64", "Linux"] as const;
    const needs = ["test", "build"];
    const workflow = orderedWorkflow(events, labels, needs);
    const result = validateWorkflow(workflow);
    assert(result.ok);
    const parsed = parse(emitWorkflow(result.value)) as {
      on: object;
      jobs: Record<string, { "runs-on": unknown; needs: string[] }>;
    };
    assertEquals(Object.keys(parsed.on), [...events]);
    assertEquals(Object.keys(parsed.jobs), workflow.jobs.map(({ id }) => id));
    assertEquals(parsed.jobs.deploy["runs-on"], labels);
    assertEquals(parsed.jobs.deploy.needs, needs);
  }
});

Deno.test("preserves map order and native values across workflow fields", () => {
  const values = { z: "${{ github.ref }}", a: "" };
  const permissions = { contents: "write", actions: "read" } as const;
  const inputs = {
    z: {
      type: "string",
      description: "Last alphabetically",
      default: undefined,
    },
    a: { type: "boolean", default: false },
  } as const;
  const secrets = { z: { required: true }, a: { required: false } };
  const outputs = {
    z: { value: "${{ jobs.build.outputs.z }}" },
    a: { value: "" },
  };
  const matrix = {
    z: ["two", "one"],
    a: ["last", "first"],
    include: [{ z: "last", a: "first" }],
  };
  const result = validateWorkflow({
    name: "Ordered",
    on: {
      workflow_dispatch: {
        inputs: { z: inputs.z, a: { type: "string", default: "" } },
      },
      workflow_call: { inputs, secrets, outputs },
    },
    env: values,
    permissions,
    jobs: [{
      ...job("build", []),
      env: values,
      permissions,
      outputs: values,
      strategy: { matrix },
      steps: [{
        type: "uses",
        uses: "example/action@v1",
        env: values,
        with: values,
      }],
    }, {
      id: "call",
      uses: "./.github/workflows/callee.yml",
      needs: [],
      steps: [],
      with: { z: false, a: 42 },
      callSecrets: values,
    }],
  });
  assert(result.ok, result.ok ? undefined : JSON.stringify(result.diagnostics));
  const parsed = parse(emitWorkflow(result.value)) as {
    on: {
      workflow_dispatch: { inputs: Record<string, Record<string, unknown>> };
      workflow_call: {
        inputs: typeof inputs;
        secrets: typeof secrets;
        outputs: typeof outputs;
      };
    };
    env: typeof values;
    permissions: typeof permissions;
    jobs: {
      build: {
        env: typeof values;
        permissions: typeof permissions;
        outputs: typeof values;
        strategy: { matrix: typeof matrix };
        steps: { env: typeof values; with: typeof values }[];
      };
      call: { with: { z: boolean; a: number }; secrets: typeof values };
    };
  };
  for (
    const map of [
      parsed.env,
      parsed.jobs.build.env,
      parsed.jobs.build.steps[0].env,
      parsed.jobs.build.outputs,
      parsed.jobs.build.steps[0].with,
      parsed.jobs.call.with,
      parsed.jobs.call.secrets,
      parsed.on.workflow_dispatch.inputs,
      parsed.on.workflow_call.inputs,
      parsed.on.workflow_call.secrets,
      parsed.on.workflow_call.outputs,
    ]
  ) assertEquals(Object.keys(map), ["z", "a"]);
  for (const map of [parsed.permissions, parsed.jobs.build.permissions]) {
    assertEquals(Object.keys(map), ["contents", "actions"]);
    assertEquals(map, permissions);
  }
  assertEquals(Object.keys(parsed.jobs.build.strategy.matrix), [
    "z",
    "a",
    "include",
  ]);
  assertEquals(parsed.jobs.build.strategy.matrix, matrix);
  assertEquals(Object.keys(parsed.jobs.build.strategy.matrix.include[0]), [
    "z",
    "a",
  ]);
  assertEquals(parsed.jobs.build.steps[0].with, values);
  assertEquals(parsed.jobs.call.with, { z: false, a: 42 });
  assertEquals(parsed.jobs.call.secrets, values);
  assertEquals(parsed.on.workflow_dispatch.inputs.z, {
    type: "string",
    description: "Last alphabetically",
  });
  assertEquals(Object.keys(parsed.on.workflow_dispatch.inputs.z), [
    "type",
    "description",
  ]);
  assertEquals(parsed.on.workflow_call.inputs.a.default, false);
});

Deno.test("validates self-hosted position without normalizing runner labels", () => {
  for (const type of ["labels", "group"] as const) {
    for (
      const labels of [
        ["self-hosted", "x64", "linux"],
        ["SELF-HOSTED", "x64", "Linux"],
        ["Self-Hosted"],
        ["x64", "linux"],
        ["ubuntu-latest"],
      ] as const
    ) {
      const result = validateWorkflow({
        name: "Runner",
        on: { push: {} },
        jobs: [{
          ...job("test", []),
          runsOn: type === "labels"
            ? { type, labels }
            : { type, group: "runners", labels },
        }],
      });
      assert(result.ok);
      const parsed = parse(emitWorkflow(result.value)) as {
        jobs: {
          test: {
            "runs-on": string | readonly string[] | {
              group: string;
              labels: readonly string[];
            };
          };
        };
      };
      assertEquals(
        parsed.jobs.test["runs-on"],
        type === "group"
          ? { group: "runners", labels }
          : labels.length === 1
          ? labels[0]
          : labels,
      );
    }
    for (const label of ["self-hosted", "SELF-HOSTED", "Self-Hosted"]) {
      for (const index of [1, 2]) {
        const labels = index === 1
          ? ["x64", label, "linux"] as const
          : ["x64", "linux", label] as const;
        const result = validateWorkflow({
          name: "Runner",
          on: { push: {} },
          jobs: [{
            ...job("test", []),
            runsOn: type === "labels"
              ? { type, labels }
              : { type, group: "runners", labels },
          }],
        });
        assert(!result.ok);
        assertEquals(
          result.diagnostics.map(({ code, path }) => ({ code, path })),
          [{
            code: "job.runs-on.labels.self-hosted.position",
            path: ["jobs", 0, "runsOn", "labels", index],
          }],
        );
      }
    }
  }
});

Deno.test("emits jobs in definition order regardless of dependency layers", () => {
  const workflow = {
    name: "Ordered",
    on: { push: {} },
    jobs: [
      job("publish", ["verify", "build"]),
      job("lint", []),
      job("verify", ["build"]),
      job("build", []),
      job("docs", []),
      job("package", ["build"]),
    ],
  };
  const result = validateWorkflow(workflow);
  assert(result.ok);
  const parsed = parse(emitWorkflow(result.value)) as {
    jobs: Record<string, { needs?: string[] }>;
  };
  assertEquals(Object.keys(parsed.jobs), workflow.jobs.map(({ id }) => id));
  for (const job of workflow.jobs) {
    assertEquals(parsed.jobs[job.id].needs ?? [], job.needs);
  }
});

Deno.test("rejects invalid deployment-specific native fields", () => {
  const result = validateWorkflow({
    name: "Deploy",
    on: { pull_request: {}, push: { branches: [] } },

    concurrency: { group: " ", cancelInProgress: false },
    jobs: [{
      id: "deploy",
      runsOn: { type: "labels", labels: ["ubuntu-24.04"] },
      needs: [],
      if: " ",
      timeoutMinutes: 0,
      environment: " ",
      outputs: { " ": " " },
      strategy: { matrix: { env: [] } },
      concurrency: { group: "app", cancelInProgress: "no" },
      steps: [{
        type: "run",
        run: "true",
        env: { " ": " " },
        workingDirectory: " ",
      }],
    }],
  } as unknown as Workflow);
  assert(!result.ok);
  assertEquals(result.diagnostics.map(({ code }) => code), [
    "workflow.on.invalid",
    "workflow.concurrency.invalid",
    "job.if.empty",
    "job.timeout.invalid",
    "job.environment.empty",
    "job.outputs.invalid",
    "job.strategy.invalid",
    "job.concurrency.invalid",
    "step.env.invalid",
    "step.working-directory.empty",
  ]);
});

Deno.test("rejects queue max with cancelInProgress true", () => {
  const result = validateWorkflow({
    name: "Deploy",
    on: { workflow_dispatch: {} },
    concurrency: { group: "deploy", cancelInProgress: true, queue: "max" },
    jobs: [{
      id: "deploy",
      runsOn: { type: "labels", labels: ["ubuntu-24.04"] },
      needs: [],
      steps: [{ type: "run", run: "true" }],
    }],
  });
  assert(!result.ok);
  assertEquals(result.diagnostics.map(({ code }) => code), [
    "workflow.concurrency.invalid",
  ]);
});

Deno.test("rejects dispatch inputs without dispatch event or valid definitions", () => {
  const base: Workflow = {
    name: "Dispatch",
    on: { push: {} },
    jobs: [job("test", [])],
  };
  const invalid = validateWorkflow({
    ...base,
    on: {
      workflow_dispatch: { inputs: { commit: { type: "choice", default: 1 } } },
    },
  } as unknown as Workflow);
  assert(!invalid.ok);
  assertEquals(invalid.diagnostics.map(({ code }) => code), [
    "workflow.on.invalid",
    "workflow.on.invalid",
  ]);
  const tooMany = validateWorkflow({
    ...base,
    on: {
      workflow_dispatch: {
        inputs: Object.fromEntries(
          Array.from({ length: 26 }, (_, index) => [
            `input_${index}`,
            { type: "string" },
          ]),
        ),
      },
    },
  });
  assert(!tooMany.ok);
  assertEquals(tooMany.diagnostics.map(({ code }) => code), [
    "workflow.on.invalid",
  ]);
});

Deno.test("reports structural validation diagnostics", () => {
  const workflow = {
    name: " ",
    on: { push: {} },
    jobs: [
      {
        id: "1invalid",
        runsOn: {
          type: "labels",
          labels: ["self-hosted", "linux", "Linux"],
        },
        needs: ["missing", "missing"],
        steps: [],
      },
      {
        id: "1invalid",
        runsOn: { type: "group", group: " " },
        needs: ["1invalid"],
        steps: [{ type: "uses", name: " ", uses: " ", with: { " ": true } }],
      },
    ],
  } as unknown as Workflow;

  const result = validateWorkflow(workflow);
  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      { code: "workflow.name.empty", path: ["name"] },
      { code: "job.id.invalid", path: ["jobs", 0, "id"] },
      {
        code: "job.runs-on.labels.duplicate",
        path: ["jobs", 0, "runsOn", "labels", 2],
      },
      {
        code: "job.needs.duplicate",
        path: ["jobs", 0, "needs", 1],
      },
      { code: "job.steps.empty", path: ["jobs", 0, "steps"] },
      { code: "job.id.invalid", path: ["jobs", 1, "id"] },
      { code: "job.id.duplicate", path: ["jobs", 1, "id"] },
      {
        code: "job.runs-on.group.empty",
        path: ["jobs", 1, "runsOn", "group"],
      },
      {
        code: "step.name.empty",
        path: ["jobs", 1, "steps", 0, "name"],
      },
      {
        code: "step.uses.empty",
        path: ["jobs", 1, "steps", 0, "uses"],
      },
      {
        code: "step.with.key.empty",
        path: ["jobs", 1, "steps", 0, "with", " "],
      },
      {
        code: "step.with.value.invalid",
        path: ["jobs", 1, "steps", 0, "with", " "],
      },
      {
        code: "job.needs.unknown",
        path: ["jobs", 0, "needs", 0],
      },
      {
        code: "job.needs.unknown",
        path: ["jobs", 0, "needs", 1],
      },
      {
        code: "job.needs.self",
        path: ["jobs", 1, "needs", 0],
      },
    ],
  );
});

Deno.test("reports each cyclic dependency component", () => {
  const result = validateWorkflow({
    name: "Cycles",
    on: { push: {} },
    jobs: [
      job("gamma", ["beta"]),
      job("independent", []),
      job("beta", ["alpha"]),
      job("alpha", ["gamma"]),
    ],
  });

  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path, message }) => ({
      code,
      path,
      message,
    })),
    [{
      code: "job.needs.cycle",
      path: ["jobs", 3, "needs"],
      message: "Job dependency cycle includes jobs: alpha, beta, gamma.",
    }],
  );
});

Deno.test("rejects invalid permissions and action input values", () => {
  const result = validateWorkflow({
    name: "Invalid values",
    on: { push: {} },
    permissions: { contents: "admin", "id-token": "read", discussions: "read" },
    jobs: [{
      id: "test",
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      needs: [],
      steps: [{
        type: "uses",
        uses: "actions/checkout@v7",
        with: {
          nested: { value: true },
          infinite: Number.POSITIVE_INFINITY,
        },
      }],
    }],
  } as unknown as Workflow);

  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      {
        code: "workflow.permissions.value.invalid",
        path: ["permissions", "contents"],
      },
      {
        code: "workflow.permissions.value.invalid",
        path: ["permissions", "id-token"],
      },
      {
        code: "workflow.permissions.key.unsupported",
        path: ["permissions", "discussions"],
      },
      {
        code: "step.with.value.invalid",
        path: ["jobs", 0, "steps", 0, "with", "nested"],
      },
      {
        code: "step.with.value.invalid",
        path: ["jobs", 0, "steps", 0, "with", "infinite"],
      },
    ],
  );
});

Deno.test("rejects invalid and duplicate step metadata", () => {
  const result = validateWorkflow({
    name: "Invalid steps",
    on: { push: {} },
    jobs: [{
      id: "test",
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      needs: [],
      steps: [
        { type: "run", id: "invalid id", if: " ", run: "true" },
        {
          type: "run",
          id: "duplicate",
          continueOnError: "yes",
          run: "true",
        },
        { type: "run", id: "duplicate", run: "true" },
      ],
    }],
  } as unknown as Workflow);

  assert(!result.ok);
  assertEquals(
    result.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      { code: "step.id.invalid", path: ["jobs", 0, "steps", 0, "id"] },
      { code: "step.if.empty", path: ["jobs", 0, "steps", 0, "if"] },
      {
        code: "step.continue-on-error.invalid",
        path: ["jobs", 0, "steps", 1, "continueOnError"],
      },
      {
        code: "step.id.duplicate",
        path: ["jobs", 0, "steps", 2, "id"],
      },
    ],
  );
});

function orderedWorkflow(
  events: readonly (keyof Workflow["on"])[],
  runnerLabels: readonly [string, ...string[]],
  needs: readonly string[],
): Workflow {
  return {
    name: "Ordered",
    on: Object.fromEntries(events.map((event) => [event, {}])),
    jobs: [
      job("test", ["build"]),
      job("build", []),
      {
        id: "deploy",
        runsOn: { type: "labels", labels: runnerLabels },
        needs,
        steps: [{ type: "run", run: "./deploy" }],
      },
    ],
  };
}

function job(id: string, needs: readonly string[]): Workflow["jobs"][number] {
  return {
    id,
    runsOn: { type: "labels", labels: ["ubuntu-latest"] },
    needs,
    steps: [{ type: "run", run: "true" }],
  };
}

Deno.test("internal GitHub string maps retain values and still validate keys and types", () => {
  const values = { empty: "", spaces: "  ", padded: " text " };
  const native: Workflow = {
    name: "Values",
    on: { push: {} },
    env: values,
    jobs: [{
      id: "values",
      needs: [],
      runsOn: { type: "labels", labels: ["ubuntu-latest"] },
      env: values,
      outputs: values,
      steps: [{
        type: "uses",
        uses: "example/action@v1",
        env: values,
        with: values,
      }],
    }],
  };
  const result = validateWorkflow(native);
  assert(result.ok);
  const decoded = parse(emitWorkflow(result.value)) as {
    env: typeof values;
    jobs: {
      values: {
        env: typeof values;
        outputs: typeof values;
        steps: { env: typeof values; with: typeof values }[];
      };
    };
  };
  assertEquals(decoded.env, values);
  assertEquals(decoded.jobs.values.env, values);
  assertEquals(decoded.jobs.values.outputs, values);
  assertEquals(decoded.jobs.values.steps[0].env, values);
  assertEquals(decoded.jobs.values.steps[0].with, values);
  for (const invalid of [{ " ": "" }, { empty: null }, { empty: 0 }]) {
    const rejected = validateWorkflow(
      {
        ...native,
        env: invalid,
        jobs: [{
          ...native.jobs[0],
          env: invalid,
          outputs: invalid,
          steps: [{ ...native.jobs[0].steps[0], env: invalid, with: invalid }],
        }],
      } as unknown as Workflow,
    );
    assert(!rejected.ok);
    assertEquals(rejected.diagnostics.map((d) => d.code), [
      "step.env.invalid",
      "step.env.invalid",
      "job.outputs.invalid",
      Object.keys(invalid)[0] === " "
        ? "step.with.key.empty"
        : "step.with.value.invalid",
      "step.env.invalid",
    ]);
  }
});
