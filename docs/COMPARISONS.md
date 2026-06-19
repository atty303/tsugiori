# Comparisons

This document compares the proposed direction with related approaches. The goal
is to clarify boundaries, not to rank tools.

## Summary

| Approach | Primary authoring surface | Execution model | Step visibility in GitHub Actions | Main difference |
| --- | --- | --- | --- | --- |
| Raw GitHub Actions YAML | YAML | GitHub Actions | Native | Language-native pipeline source emits committed YAML, with optional task runtime integration. |
| Reusable workflows | YAML | GitHub Actions | Native across called workflows | Generated YAML may later model `workflow_call` contracts in code. |
| Composite actions | YAML plus scripts | GitHub Actions action runner | Often grouped inside the composite action | Provider steps stay visible while those steps may invoke task runtime entrypoints. |
| github-actions-workflow-ts | TypeScript | GitHub Actions | Native | Task functions and the task runtime can be used with or without pipeline generation. |
| github-workflows-kt | Kotlin | GitHub Actions | Native | The initial language/runtime choice is TypeScript/Deno with optional task runtime integration. |
| Dagger | Programmatic CI/build runtime | Dagger engine | Usually mediated through CI steps | GitHub Actions orchestration should not be replaced with an external runtime. |
| Earthly | Earthfile build definitions | Earthly engine | Usually mediated through CI steps | Workflow structure should not be hidden inside a separate build runtime. |
| Buildkite Dynamic Pipelines | Generated Buildkite pipelines | Buildkite | Native to Buildkite | The first provider backend targets generated GitHub Actions YAML; future provider backends should still preserve provider-native visibility. |

## Comparison Axes

The design should be compared along two separate axes:

- provider-native pipeline authoring and emission
- task functions prepared as task artifacts and executed through the task
  runtime

Those axes can be used together, but neither should require the other. The
compiler should be able to generate GitHub Actions workflow YAML without task
functions, and task functions should remain usable from handwritten provider
configuration.

## Raw GitHub Actions YAML

Raw YAML is the native interface and remains the output target for generated
pipeline configuration.

The trade-off is that YAML alone can become hard to maintain for larger systems.
It has limited type checking, weak composition primitives, and encourages inline
shell snippets for behavior that could be better expressed and tested as
ordinary code.

The proposed value is not to replace YAML as the execution artifact. It is to
make YAML a generated artifact from a typed source of truth.

The generated YAML is still intended to be committed and reviewed. Local hooks
may keep it current before commit, while later CI checks should detect stale
generated output.

The proposed task runtime is a separate addition. A repository should be able
to keep handwritten GitHub Actions YAML and still invoke prepared task
artifacts from normal provider steps.

## Reusable Workflows

Reusable workflows are a native GitHub Actions mechanism for sharing workflow
logic through `workflow_call`.

Reusable workflows should be treated as a GitHub Actions concept, not as
something to bypass. A later phase may model `workflow_call` inputs,
secrets, permissions, and outputs as typed contracts and emit the corresponding
YAML.

The distinction is that reusable workflows remain YAML-defined units, while the
project proposes a code authoring layer that can generate those units.

Task functions are also separate from reusable workflow contracts. A reusable
workflow may contain steps that invoke task runtime entrypoints, but
`workflow_call` remains a GitHub Actions workflow feature rather than a task
runtime feature.

## Composite Actions

Composite actions package multiple steps behind an action interface.

They are useful for reuse, but they can also move meaningful detail away from
the top-level workflow view. Depending on how they are used, the GitHub Actions
UI may show a higher-level action boundary rather than the workflow author's
logical CI structure.

The initial direction is to keep provider steps visible while allowing a step
to invoke a task runtime entrypoint for its implementation. The task
artifact may be restored through a cache adapter, but that artifact delivery
mechanism should not hide the provider steps.

Composite actions are a packaging and reuse mechanism in GitHub Actions. Task
functions are proposed as authored task implementations that can be wired into
provider steps directly. They should not require wrapping all work behind one
action boundary.

## github-actions-workflow-ts

`github-actions-workflow-ts` is conceptually close in that it uses TypeScript to
author GitHub Actions workflows.

The proposed difference is the additional task authoring model: pipeline
structure and task functions can live in the same TypeScript/Deno project, with
generated provider steps dispatching to the task runtime.

Generated YAML is also treated as a committed Actions artifact, while the task
artifact is treated as a cacheable artifact addressed by its inputs.

The compiler should still emit native GitHub Actions YAML rather than introduce a
separate scheduler.

The task runtime should also remain independently usable. That makes the
project more than a workflow-generation library, but it does not make the task
runtime the owner of CI orchestration.

## github-workflows-kt

`github-workflows-kt` uses Kotlin to define GitHub Actions workflows.

The proposed direction is similar at the workflow generation level, but the
initial runtime and ecosystem choices differ. The initial implementation starts
from TypeScript/Deno and gives special attention to task functions and task
artifact preparation.

The important boundary is still provider-native output. The compiler should
preserve GitHub Actions workflow concepts rather than translating them through
a provider-neutral pipeline model.

## Dagger

Dagger provides a programmable CI and build runtime. It can be called from
GitHub Actions, but the important execution model is Dagger's own graph and
engine.

The proposed boundary is different. GitHub Actions should remain the graph
executor. The compiler should emit visible jobs and steps instead of reducing the
workflow to one command that delegates orchestration elsewhere.

The task runtime should execute task entrypoints inside provider steps. It
should not become a scheduler, graph engine, secret system, or replacement UI
for the selected CI provider.

## Earthly

Earthly provides a build definition language and execution model focused on
repeatable builds.

The project is not initially a build runtime. It may run build commands inside task
functions, but the workflow graph should remain in GitHub Actions YAML.

Task functions can call build tools, but that does not make the project an
Earthly-like build definition language. The CI provider should still own
pipeline orchestration.

## Buildkite Dynamic Pipelines

Buildkite Dynamic Pipelines allow pipeline definitions to be generated at
runtime for Buildkite.

The project shares the broad idea that CI configuration can be generated, but
the initial CI provider is different. The first provider backend should emit
GitHub Actions workflows and preserve GitHub Actions semantics. A future
provider backend for another CI provider would need its own native emitter
rather than routing that provider through the GitHub Actions model.

This reinforces the non-portability choice: future provider backends should
preserve their provider's native concepts instead of sharing one portable
pipeline model.
