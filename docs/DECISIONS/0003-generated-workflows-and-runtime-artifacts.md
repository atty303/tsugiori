# 0003: Generated Workflows and Runtime Artifacts

## Status

Accepted as initial direction.

## Context

GitHub Actions loads workflow YAML from the pushed commit before it executes a
run. If Forge generated workflow YAML only during that run, the generated YAML
would not define the run that is already in progress.

Forge also intends to keep step implementation bodies out of YAML. Logical
Forge steps should invoke a compiled runtime binary with distinct subcommands,
and those step invocations should not fetch or build Forge-managed step
implementation code again.

The compiled runtime binary still needs a delivery mechanism. Different
repositories may prefer different artifact stores, such as `actions/cache`, GCR
or another OCI registry, S3, or a local development cache.

## Decision

Forge workflow source is the source of truth, and generated
`.github/workflows/*.yml` files are committed review artifacts.

A local git hook may run the compiler before commit so workflow source changes
update generated YAML early. Hooks are convenience tooling, not the only
correctness boundary. A future check mode should compare committed YAML with
compiler output and fail when generated YAML is stale.

The compiled runtime binary is a content-addressed artifact. Its key should be
derived from inputs that affect runtime behavior, including workflow source,
registered step source, dependency state, target platform, and Forge version.
When those inputs change, the key changes and the binary is rebuilt or restored
from a matching artifact entry.

Generated jobs should include explicit preparation work that makes the runtime
binary available before logical Forge steps run. After preparation, each
logical Forge step should run the prepared binary with its own subcommand.

Runtime artifact storage and retrieval should be adapter-backed. The initial
adapter can be `actions/cache`, while OCI registries, GCR, S3, and other stores
can use the same artifact contract later.

## Consequences

GitHub Actions continues to see ordinary committed workflow YAML. Jobs and
steps remain visible in the GitHub UI, and generated YAML remains reviewable.

Forge needs deterministic emission and a check mode so generated YAML drift can
be detected outside local hooks.

Runtime preparation becomes a visible part of generated jobs. This keeps
artifact delivery explicit instead of hiding workflow orchestration inside one
Forge command.

Cache adapter design becomes part of the runtime artifact boundary. The
compiler and generated preparation steps should depend on an artifact contract,
not on one storage provider.

## Trade-Offs

Committing generated YAML creates review noise and requires stale-output
checks, but it fits GitHub Actions' workflow loading model and keeps the
execution artifact visible.

Local git hooks improve feedback but can be skipped with `--no-verify`, so they
cannot be the only enforcement mechanism.

Restoring or building the runtime binary adds setup work to generated jobs, but
it avoids per-step dependency fetching for Forge-managed step code and keeps
logical steps as normal Actions steps.

Adapter-backed artifact storage adds design surface, but it avoids hard-coding
Forge to one cache provider before repository needs are known.
