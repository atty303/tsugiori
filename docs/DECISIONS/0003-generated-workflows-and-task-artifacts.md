# 0003: Generated Workflows and Task Artifacts

## Status

Accepted as initial direction.

## Context

GitHub Actions loads workflow YAML from the pushed commit before it executes a
run. If workflow YAML were generated only during that run, the generated YAML
would not define the run that is already in progress.

The design also keeps task function bodies out of YAML. Task-backed
provider steps should invoke the task runtime with distinct entrypoints, and
those step invocations should not fetch or build managed task code again.

The task runtime needs a delivery mechanism for prepared task artifacts.
Different repositories may prefer different artifact stores, such as
`actions/cache`, GCR or another OCI registry, S3, or a local development cache.

## Decision

Pipeline source is the source of truth, and generated
`.github/workflows/*.yml` files are committed review artifacts.

A local git hook may run the compiler before commit so pipeline source changes
update generated YAML early. Hooks are convenience tooling, not the only
correctness boundary. Check mode compares current workflow files byte for byte
with compiler output and fails when generated YAML is stale. Generated YAML
identifies its owning config in a leading comment so checks can distinguish
extra owned files from handwritten workflows and other configs' output. A check
can cover all outputs owned by a config or one selected output; the repository
CI checks its own workflow.
Jobs in generated YAML are ordered by dependency layer. Within each layer,
their authoring order is preserved so the committed output remains easy to read.

The task artifact is content-addressed. Its key should be derived from inputs
that affect task runtime behavior, including registered task source,
dependency state, target platform, and tool version. When those inputs change,
the key changes and the artifact is rebuilt or restored from a matching
artifact entry.

Generated jobs should include explicit preparation work when they need a task
artifact. After preparation, each task-backed provider step should invoke the
task runtime with its own entrypoint.

Task artifact storage and retrieval should be adapter-backed. The initial
adapter can be `actions/cache`, while OCI registries, GCR, S3, and other stores
can use the same artifact contract later.

## Consequences

GitHub Actions continues to see ordinary committed workflow YAML. Jobs and
steps remain visible in the GitHub UI, and generated YAML remains reviewable.

The compiler needs deterministic emission and a check mode so generated YAML drift can
be detected outside local hooks.

Task artifact preparation becomes a visible part of generated jobs that use
task-backed provider steps. This keeps artifact delivery explicit instead of
hiding workflow orchestration inside one tool command.

Cache adapter design becomes part of the task artifact boundary. Task runtime
tooling and generated preparation steps should depend on an artifact contract,
not on one storage provider.

## Trade-Offs

Committing generated YAML creates review noise and requires stale-output
checks, but it fits GitHub Actions' workflow loading model and keeps the
execution artifact visible.

Local git hooks improve feedback but can be skipped with `--no-verify`, so they
cannot be the only enforcement mechanism.

Restoring or building the task artifact adds setup work to generated jobs that
use task-backed provider steps, but it avoids per-step dependency fetching for
managed task code and keeps provider steps visible as normal Actions
steps.

Adapter-backed artifact storage adds design surface, but it avoids hard-coding
the project to one cache provider before repository needs are known.
