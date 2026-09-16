# 0007: Debug-Gated Console Diagnostics

## Status

Accepted.

## Context

The initial CLI and compiled task runtime retained bounded JSON diagnostic
records under `.tsugiori/diagnostics/`. Ephemeral GitHub-hosted runners discard
those files after a job, while uploading them would require additional workflow
conditions and artifact handling that are outside the initial dogfooding slice.

Normal command output should stay concise, and diagnostic records must not
capture task output, environment contents, credentials, or arbitrary user data.

## Decision

The CLI and compiled task runtime do not retain diagnostic files. When the
execution environment sets `RUNNER_DEBUG=1`, each invocation emits one compact
JSON diagnostic record to standard error when it finishes. GitHub Actions sets
that variable when debug logging is enabled.

The record keeps the existing allowlisted run, resource, operation, status,
error type, and low-cardinality attribute fields. Task output and process
environment values are not recorded. When debug logging is disabled, no
structured diagnostic record is emitted.

## Consequences

Debug reruns expose structured diagnostics directly in the associated step
log without an upload step or retained local files. Diagnostic output remains
separate from normal standard output and does not affect the command exit
status.

Normal successful runs do not retain evidence for later investigation. Local
invocations also have no structured diagnostic record unless they explicitly
run with `RUNNER_DEBUG=1`.

## Trade-Offs

This uses a GitHub Actions runner convention in the initial task runtime. A
future provider backend may need its own debug-mode mapping or a provider-neutral
diagnostic sink contract.

File retention would preserve evidence outside debug runs, but ephemeral CI
runners would still require artifact transport. Always-on console records would
improve coverage but add noise to every step log.
