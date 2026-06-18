# Comparisons

This document compares Forge's proposed direction with related approaches. The
goal is to clarify boundaries, not to rank tools.

## Summary

| Approach | Primary authoring surface | Execution model | Step visibility in GitHub Actions | Main difference from Forge |
| --- | --- | --- | --- | --- |
| Raw GitHub Actions YAML | YAML | GitHub Actions | Native | Forge proposes a typed authoring layer and compiled runtime entrypoints. |
| Reusable workflows | YAML | GitHub Actions | Native across called workflows | Forge would generate YAML and may later model `workflow_call` contracts in code. |
| Composite actions | YAML plus scripts | GitHub Actions action runner | Often grouped inside the composite action | Forge aims to preserve logical workflow steps while dispatching to compiled entrypoints. |
| github-actions-workflow-ts | TypeScript | GitHub Actions | Native | Forge also includes typed step entrypoints and a compiled Deno runtime dispatch model. |
| github-workflows-kt | Kotlin | GitHub Actions | Native | Forge's initial language/runtime choice is TypeScript/Deno and compiled step dispatch. |
| Dagger | Programmatic CI/build runtime | Dagger engine | Usually mediated through CI steps | Forge should not replace GitHub Actions orchestration with an external runtime. |
| Earthly | Earthfile build definitions | Earthly engine | Usually mediated through CI steps | Forge should not hide workflow structure inside a separate build runtime. |
| Buildkite Dynamic Pipelines | Generated Buildkite pipelines | Buildkite | Native to Buildkite | Forge targets generated GitHub Actions YAML, not Buildkite orchestration. |

## Raw GitHub Actions YAML

Raw YAML is the native interface and remains the output target for Forge.

The trade-off is that YAML alone can become hard to maintain for larger systems.
It has limited type checking, weak composition primitives, and encourages inline
shell snippets for behavior that could be better expressed and tested as
ordinary code.

Forge's proposed value is not to replace YAML as the execution artifact. It is
to make YAML a generated artifact from a typed source of truth.

## Reusable Workflows

Reusable workflows are a native GitHub Actions mechanism for sharing workflow
logic through `workflow_call`.

Forge should treat reusable workflows as a GitHub Actions concept, not as
something to bypass. A later Forge phase may model `workflow_call` inputs,
secrets, permissions, and outputs as typed contracts and emit the corresponding
YAML.

The distinction is that reusable workflows remain YAML-defined units, while
Forge proposes a code authoring layer that can generate those units.

## Composite Actions

Composite actions package multiple steps behind an action interface.

They are useful for reuse, but they can also move meaningful detail away from
the top-level workflow view. Depending on how they are used, the GitHub Actions
UI may show a higher-level action boundary rather than the workflow author's
logical CI structure.

Forge's initial direction is to keep each logical Forge step as a normal
workflow step and use a compiled runtime subcommand for the implementation.

## github-actions-workflow-ts

`github-actions-workflow-ts` is conceptually close in that it uses TypeScript to
author GitHub Actions workflows.

Forge's proposed difference is the additional runtime authoring model: workflow
structure and step implementation entrypoints would live in the same
TypeScript/Deno project, with generated steps dispatching to a compiled Deno
binary.

Forge should still emit native GitHub Actions YAML rather than introduce a
separate scheduler.

## github-workflows-kt

`github-workflows-kt` uses Kotlin to define GitHub Actions workflows.

Forge's proposed direction is similar at the workflow generation level, but the
initial runtime and ecosystem choices differ. Forge starts from TypeScript/Deno
and gives special attention to compiled step implementation entrypoints.

## Dagger

Dagger provides a programmable CI and build runtime. It can be called from
GitHub Actions, but the important execution model is Dagger's own graph and
engine.

Forge's proposed boundary is different. GitHub Actions should remain the graph
executor. Forge should compile to visible jobs and steps instead of reducing the
workflow to one command that delegates orchestration elsewhere.

## Earthly

Earthly provides a build definition language and execution model focused on
repeatable builds.

Forge is not initially a build runtime. It may run build commands inside step
entrypoints, but the workflow graph should remain in GitHub Actions YAML.

## Buildkite Dynamic Pipelines

Buildkite Dynamic Pipelines allow pipeline definitions to be generated at
runtime for Buildkite.

Forge shares the broad idea that CI configuration can be generated, but the
target platform is different. Forge should emit GitHub Actions workflows and
preserve GitHub Actions semantics.
