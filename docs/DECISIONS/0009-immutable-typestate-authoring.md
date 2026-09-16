# 0009: Immutable Typestate Authoring

## Status

Accepted.

## Context

The initial GitHub Actions authoring API used mutable pipeline and job builders.
That API preserved provider-native jobs and steps, but its types did not narrow
the operations or references available at each authoring position. Later
GitHub Actions features also expose different expression contexts and special
functions for different workflow keys.

The primary authoring requirement is that editor completion should expose only
the operations and references valid at the current semantic phase. Readability
is the next priority. Intermediate definitions therefore need to remain easy to
bind to local constants without introducing shared mutable state.

## Decision

The public GitHub Actions authoring API uses immutable typestate facades. Each
operation returns a new facade backed by readonly authoring data. Public state
interfaces contain only the methods valid in that state; they do not expose a
single class whose unusable methods return `never`.

Jobs are added in topological order. A job callback receives the new job state
and the already finalized jobs as one scope object. Only those prior jobs can
be passed to `needs`. Adding the first step moves the job into a non-empty step
state, and only a non-empty pipeline containing non-empty jobs can be passed to
`defineTsugiori`. The configuration boundary materializes the internal
authoring representation; no public `build` method is exposed.

Provider-native names remain visible in the TypeScript surface. Typed action
contracts bind one complete `uses` revision to its input definition. The core
package supplies the contract mechanism rather than owning metadata for
third-party actions. A contract also names the action's outputs. An explicitly
identified action step exposes only those output references through its step
state. An explicit raw action remains available for unregistered actions.

GitHub expression availability is recorded as readonly provider data keyed by
the exact workflow keys used in GitHub's context availability table. Each entry
classifies both context namespaces and restricted special functions. The full
provider catalog is separate from the set currently exposed by the public DSL.
Types, future validation, and completion environments are derived from this
catalog.

The initial implementation replaces the mutable builder for the already
implemented authoring subset and keeps the expression catalog internal.
Structured expressions, matrix authoring, general job outputs, run and task
step output contracts, dynamic input contracts, and raw expressions remain
later slices. Revision-bound third-party action outputs are part of this slice.

## Consequences

Intermediate pipeline, job, and step states can be bound to `const` values or
passed through ordinary functions without mutation. Job dependency cycles and
empty authored structures are excluded by the public type surface, while the
compiler retains runtime validation for untyped or externally constructed
configuration values.

Adding later GitHub Actions features requires placing their operations in the
correct semantic phase and deriving each expression property's environment
from its workflow-key catalog entry. The public interfaces will grow by phase
rather than by accumulating optional methods on one builder.

The previous mutable `PipelineBuilder` and `JobBuilder` API is removed without
a compatibility adapter.

## Trade-Offs

Typestate introduces more generic types and internal facade construction than
mutable builders or nested object literals. Topological declaration order also
forbids forward job references, but every valid GitHub Actions dependency graph
is a DAG and can be written in that order.

A two-pass job declaration could expose all job names before their bodies are
defined, but it would duplicate contracts and permit cycles that require later
validation. A single generic builder would reduce internal interfaces, but
invalid methods would remain visible in editor completion.
