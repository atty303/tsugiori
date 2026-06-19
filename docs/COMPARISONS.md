# Comparisons

This document compares Forge's proposed direction with related approaches. The
goal is to clarify boundaries, not to rank tools.

## Summary

| Approach | Primary authoring surface | Execution model | Step visibility in GitHub Actions | Main difference from Forge |
| --- | --- | --- | --- | --- |
| Raw GitHub Actions YAML | YAML | GitHub Actions | Native | Forge proposes language-native pipeline source that emits committed YAML, with optional task runtime integration. |
| Reusable workflows | YAML | GitHub Actions | Native across called workflows | Forge would generate YAML and may later model `workflow_call` contracts in code. |
| Composite actions | YAML plus scripts | GitHub Actions action runner | Often grouped inside the composite action | Forge aims to preserve provider steps while allowing those steps to invoke task runtime entrypoints. |
| github-actions-workflow-ts | TypeScript | GitHub Actions | Native | Forge also proposes task functions and a task runtime that can be used with or without pipeline generation. |
| github-workflows-kt | Kotlin | GitHub Actions | Native | Forge's initial language/runtime choice is TypeScript/Deno and optional task runtime integration. |
| Dagger | Programmatic CI/build runtime | Dagger engine | Usually mediated through CI steps | Forge should not replace GitHub Actions orchestration with an external runtime. |
| Earthly | Earthfile build definitions | Earthly engine | Usually mediated through CI steps | Forge should not hide workflow structure inside a separate build runtime. |
| Buildkite Dynamic Pipelines | Generated Buildkite pipelines | Buildkite | Native to Buildkite | Forge's first provider backend targets generated GitHub Actions YAML; future provider backends should still preserve provider-native visibility. |

## Comparison Axes

Forge should be compared along two separate axes:

- provider-native pipeline authoring and emission
- task functions prepared as task artifacts and executed through the task
  runtime

Those axes can be used together, but neither should require the other. Forge
should be able to generate GitHub Actions workflow YAML without task functions,
and task functions should remain usable from handwritten provider
configuration.

## Raw GitHub Actions YAML

Raw YAML is the native interface and remains the output target for Forge.

The trade-off is that YAML alone can become hard to maintain for larger systems.
It has limited type checking, weak composition primitives, and encourages inline
shell snippets for behavior that could be better expressed and tested as
ordinary code.

Forge's proposed value is not to replace YAML as the execution artifact. It is
to make YAML a generated artifact from a typed source of truth.

The generated YAML is still intended to be committed and reviewed. Local hooks
may keep it current before commit, while later CI checks should detect stale
generated output.

The proposed task runtime is a separate addition. A repository should be able
to keep handwritten GitHub Actions YAML and still invoke prepared Forge task
artifacts from normal provider steps.

## Reusable Workflows

Reusable workflows are a native GitHub Actions mechanism for sharing workflow
logic through `workflow_call`.

Forge should treat reusable workflows as a GitHub Actions concept, not as
something to bypass. A later Forge phase may model `workflow_call` inputs,
secrets, permissions, and outputs as typed contracts and emit the corresponding
YAML.

The distinction is that reusable workflows remain YAML-defined units, while
Forge proposes a code authoring layer that can generate those units.

Task functions are also separate from reusable workflow contracts. A reusable
workflow may contain steps that invoke task runtime entrypoints, but
`workflow_call` remains a GitHub Actions workflow feature rather than a Forge
task runtime feature.

## Composite Actions

Composite actions package multiple steps behind an action interface.

They are useful for reuse, but they can also move meaningful detail away from
the top-level workflow view. Depending on how they are used, the GitHub Actions
UI may show a higher-level action boundary rather than the workflow author's
logical CI structure.

Forge's initial direction is to keep provider steps visible while allowing a
step to invoke a Forge task runtime entrypoint for its implementation. The task
artifact may be restored through a cache adapter, but that artifact delivery
mechanism should not hide the provider steps.

Composite actions are a packaging and reuse mechanism in GitHub Actions. Forge
task functions are proposed as authored task implementations that can be wired
into provider steps directly. They should not require wrapping all work behind
one action boundary.

## github-actions-workflow-ts

`github-actions-workflow-ts` is conceptually close in that it uses TypeScript to
author GitHub Actions workflows.

Forge's proposed difference is the additional task authoring model: pipeline
structure and task functions can live in the same TypeScript/Deno project, with
generated provider steps dispatching to the task runtime.

Forge also treats generated YAML as a committed Actions artifact and treats the
task artifact as a cacheable artifact addressed by its inputs.

Forge should still emit native GitHub Actions YAML rather than introduce a
separate scheduler.

The task runtime should also remain independently usable. That makes Forge more
than a workflow-generation library, but it does not make the task runtime the
owner of CI orchestration.

## github-workflows-kt

`github-workflows-kt` uses Kotlin to define GitHub Actions workflows.

Forge's proposed direction is similar at the workflow generation level, but the
initial runtime and ecosystem choices differ. Forge starts from TypeScript/Deno
and gives special attention to task functions and task artifact preparation.

The important boundary is still provider-native output. Forge should preserve
GitHub Actions workflow concepts rather than translating them through a
provider-neutral pipeline model.

## Dagger

Dagger provides a programmable CI and build runtime. It can be called from
GitHub Actions, but the important execution model is Dagger's own graph and
engine.

Forge's proposed boundary is different. GitHub Actions should remain the graph
executor. Forge should compile to visible jobs and steps instead of reducing the
workflow to one command that delegates orchestration elsewhere.

The Forge task runtime should execute task entrypoints inside provider steps. It
should not become a scheduler, graph engine, secret system, or replacement UI
for the selected CI provider.

## Earthly

Earthly provides a build definition language and execution model focused on
repeatable builds.

Forge is not initially a build runtime. It may run build commands inside task
functions, but the workflow graph should remain in GitHub Actions YAML.

Task functions can call build tools, but that does not make Forge an Earthly-like
build definition language. The CI provider should still own pipeline
orchestration.

## Buildkite Dynamic Pipelines

Buildkite Dynamic Pipelines allow pipeline definitions to be generated at
runtime for Buildkite.

Forge shares the broad idea that CI configuration can be generated, but the
initial CI provider is different. Forge's first provider backend should emit
GitHub Actions workflows and preserve GitHub Actions semantics. A future
provider backend for another CI provider would need its own native emitter
rather than routing that provider through the GitHub Actions model.

This reinforces Forge's non-portability choice: future provider backends should
preserve their provider's native concepts instead of sharing one portable
pipeline model.
