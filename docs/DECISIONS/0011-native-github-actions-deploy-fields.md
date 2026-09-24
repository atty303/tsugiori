# 0011: Native GitHub Actions deployment fields

## Status

Accepted.

## Context

The first GitOps deployment spike needs ordinary Actions jobs and steps with
branch filtering, job conditions, environments, outputs, matrix waits,
concurrency, time limits, step environment variables, and working directories.
The initial authoring slice could emit only basic jobs and steps.

## Decision

Extend the GitHub Actions provider AST and public authoring options with those
fields. Keep the workflow, job, and step boundaries visible in generated YAML.
`rawExpression()` explicitly marks GitHub runtime expressions; it does not
evaluate them in the authoring process. Validate structure and scalar shape
without pretending to implement GitHub's expression evaluator. Preserve each
field through source inspection, lowering, and deterministic emission.

## Consequences

GitOps deployment workflows can be generated while GitHub Actions retains
scheduling, concurrency, environments, and credentials. Typed expressions and
broader Actions events remain separate work. The host workflow must still own
external completion callbacks and failure deadlines.

## Trade-Offs

A generic CI deployment model would hide provider semantics. Completing a typed
expression DSL before the spike would delay live validation of the native
workflow shape.
