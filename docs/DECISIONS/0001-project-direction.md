# 0001: Project Direction

## Status

Accepted as initial direction.

## Context

Forge is intended to improve authoring and validation for provider-native CI
pipelines while preserving the selected CI provider as the execution platform.
The first CI provider target is GitHub Actions.

The project could choose to build a separate CI runtime and have GitHub Actions
invoke it through a single command. That would create a more controlled runtime
environment, but it would also discard much of what GitHub Actions already
provides: job scheduling, matrix expansion, `needs`, permissions,
environments, secrets, logs, and the web UI's job and step model.

The important early risk is whether a language-native authoring model can
compile to native GitHub Actions YAML without hiding the workflow from GitHub.

## Decision

Forge will initially target GitHub Actions-native YAML generation through a
GitHub Actions provider backend.

Generated workflows should live under `.github/workflows/*.yml` and should use
normal GitHub Actions constructs for jobs, steps, `if`, `needs`, matrix,
`workflow_call`, permissions, concurrency, environments, secrets, and outputs.

Task function bodies should not be inlined into YAML. When task functions are
used with the GitHub Actions provider backend, each task-backed provider step
should still appear as a normal GitHub Actions step that invokes the task
runtime with a specific entrypoint.

Generated workflow commit strategy and task artifact delivery are refined in
ADR 0003.

## Consequences

This keeps GitHub Actions as the orchestration layer and preserves normal
debugging and review workflows.

It also means Forge must model GitHub Actions concepts carefully rather than
abstract them away. The compiler needs a workflow AST, an expression AST, and a
YAML emitter that respects GitHub's semantics.

Forge will not initially provide its own scheduler, runner abstraction, hosted
control plane, or generic CI platform.

ADR 0004 refines this by using provider-native pipeline authoring and keeping
the task runtime independently usable. That does not change the initial
GitHub Actions target.

## Trade-Offs

The generated YAML must remain readable and stable, which constrains how much
Forge can hide behind abstractions.

Some GitHub Actions behavior can only be validated partially before runtime.
Forge should fail early where practical, but it should not pretend to fully
evaluate GitHub's runtime contexts at compile time.
