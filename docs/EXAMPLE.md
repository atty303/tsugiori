# Example

This example uses `.github` as the workflow project. Other locations work when
`--root` points from that project to the repository root.

## Workflow project

`.github/deno.json` pins one Tsugiori dependency. Run `deno install` in this
directory to record its resolution in the lockfile.

```json
{
  "imports": {
    "@atty303/tsugiori": "jsr:@atty303/tsugiori@<version>"
  },
  "tasks": {
    "generate": "deno run --frozen=true -A @atty303/tsugiori/cli generate --config .github/tsugiori.ts --root ..",
    "generate:check": "deno run --frozen=true -A @atty303/tsugiori/cli generate --check --config .github/tsugiori.ts --root .."
  }
}
```

`.github/tsugiori.ts` imports the authoring API from the same dependency:

```ts
import { defineTsugiori, pipeline } from "@atty303/tsugiori/github-actions";

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

export default defineTsugiori({ pipelines: [ci] });
```

From `.github`, run `deno task generate` and commit the generated workflow.
Run `deno task generate:check` to detect stale output without writing it.

## Generated shape

The task-backed job remains a normal GitHub Actions job. Before its task step,
Tsugiori emits visible steps to resolve the artifact key, restore an
`actions/cache` entry, prepare the artifact, and save a new cache generation
when needed. The internal run steps use `.github` as their
`working-directory` and invoke `@atty303/tsugiori/cli` from the project
configuration:

```yaml
- name: Resolve task artifact
  id: tsugiori-task-artifact
  run: deno run --frozen=true -A @atty303/tsugiori/cli github-actions task cache-key --config '.github/tsugiori.ts' --root '..' --expect-layout 'ci/test=sha256:<digest>'
  working-directory: .github
# Visible cache restore, preparation, and conditional save steps follow.
- name: Test
  run: ./.tsugiori/task-runtime ci/test/task-1
```

The task body stays in TypeScript. The compiled task artifact and its local
cache live under `.tsugiori/` at the repository root, regardless of the
workflow project's location. See the committed `.github/workflows/ci.yml` for
the exact generated structure and quoting.
