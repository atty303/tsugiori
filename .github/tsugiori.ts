import {
  actionInput,
  defineAction,
  defineTsugiori,
  pipeline,
} from "@tsugiori/core/github-actions";

const checkout = defineAction({
  uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  inputs: {
    "persist-credentials": actionInput.boolean(),
  },
  outputs: [],
});

const mise = defineAction({
  uses: "jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c",
  inputs: {},
  outputs: [],
});

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
  permissions: { contents: "read" },
}).job("test", ({ job }) =>
  job
    .runsOn("ubuntu-24.04")
    .uses({
      name: "Checkout",
      uses: checkout({ "persist-credentials": false }),
    })
    .uses({
      name: "Install toolchain",
      uses: mise({}),
    })
    .run({
      name: "Build Tsugiori",
      run: 'mise run build\necho "$PWD/dist" >> "$GITHUB_PATH"',
    })
    .run({
      name: "Check generated workflow",
      run: "tsugiori generate --config ./.github/tsugiori.ts\n" +
        "git diff --exit-code -- .github/workflows\n" +
        'test -z "$(git ls-files --others --exclude-standard -- .github/workflows)"',
    })
    .task({
      name: "Run repository checks and tests",
      task: async () => {
        const result = await new Deno.Command("mise", {
          args: ["run", "test"],
          stdout: "inherit",
          stderr: "inherit",
        }).output();
        if (!result.success) {
          throw new Error(`Repository checks failed with ${result.code}.`);
        }
      },
    }));

export default defineTsugiori({ pipelines: [ci] });
