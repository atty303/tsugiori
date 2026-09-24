# Example

This example uses `.github` as the workflow project. Other locations work when the config passes the repository root to `runTsugiori`.

## Workflow project

`.github/deno.json` pins one Tsugiori dependency. Run `deno install` in this
directory to record its resolution in the lockfile.

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@<version>"
  },
  "tasks": {
    "generate": "deno run --frozen=true -A ./tsugiori.ts generate",
    "generate:check": "deno run --frozen=true -A ./tsugiori.ts generate --check"
  }
}
```

`.github/tsugiori.ts` imports the authoring API from the same dependency:

```ts
import { defineTsugiori, pipeline } from "@atty303/tsugiori/github-actions";
import { runTsugiori } from "@atty303/tsugiori/run";

const ci = pipeline("ci", {
  output: ".github/workflows/ci.yml",
  events: ["pull_request", "push"],
}).job("test", ({ job }) =>
  job.runsOn("ubuntu-latest")
    .task({
      name: "Test",
      task: async () => {
        const result = await new Deno.Command("deno", {
          args: ["task", "test"],
          stdout: "inherit",
          stderr: "inherit",
        }).output();
        if (!result.success) throw new Error("Tests failed.");
      },
    }));

const config = defineTsugiori({ pipelines: [ci] });
export default config;

if (import.meta.main) {
  Deno.exitCode = await runTsugiori({
    config,
    configUrl: import.meta.url,
    root: new URL("../", import.meta.url),
  });
}
```

From `.github`, run `deno task generate` and commit the generated workflow.
Run `deno task generate:check` to detect stale output without writing it.

## Generated shape

The task-backed job remains a normal GitHub Actions job. Before its task step,
Tsugiori emits visible steps to resolve the artifact key, restore an
`actions/cache` entry, prepare the artifact, and save a new cache generation
when needed. The internal run steps use `.github` as their
`working-directory` and execute the config file from the project directory:

```yaml
- name: Resolve task artifact
  id: tsugiori-task-artifact
  run: deno run --frozen=true -A './tsugiori.ts' github-actions task cache-key --expect-layout 'ci/test=sha256:<digest>'
  working-directory: .github
# Visible cache restore, preparation, and conditional save steps follow.
- name: Test
  run: ./.tsugiori/task-runtime ci/test/task-1
```

The task body stays in TypeScript. The compiled task artifact and its local
cache live under `.tsugiori/` at the repository root, regardless of the
workflow project's location. See the committed `.github/workflows/ci.yml` for
the exact generated structure and quoting.
