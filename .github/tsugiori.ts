import { defineTsugiori, pipeline } from "@tsugiori/core/github-actions";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
  permissions: { contents: "read" },
});

const test = ci.job("test", {
  runsOn: "ubuntu-24.04",
});

test.uses(
  "Checkout",
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  { "persist-credentials": false },
);
test.uses(
  "Install toolchain",
  "jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c",
);
test.run(
  "Build Tsugiori",
  'mise run build\necho "$PWD/dist" >> "$GITHUB_PATH"',
);
test.run(
  "Check generated workflow",
  "tsugiori generate --config ./.github/tsugiori.ts\n" +
    "git diff --exit-code -- .github/workflows\n" +
    'test -z "$(git ls-files --others --exclude-standard -- .github/workflows)"',
);
test.task("Run repository checks and tests", async () => {
  const result = await new Deno.Command("mise", {
    args: ["run", "test"],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!result.success) {
    throw new Error(`Repository checks failed with ${result.code}.`);
  }
});

export default defineTsugiori({ pipelines: [ci] });
