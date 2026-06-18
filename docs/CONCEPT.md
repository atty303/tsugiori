# Concept

Forge is proposed as an Actions-native workflow compiler with
language-native step implementation.

The project has two linked goals:

- let authors describe GitHub Actions workflow structure in typed
  TypeScript/Deno code
- let authors implement logical step entrypoints in ordinary Deno code, then
  invoke those entrypoints from generated GitHub Actions steps

## Actions-Native Orchestration

Forge should not replace GitHub Actions as the execution platform.

The workflow graph should remain visible to GitHub Actions. Jobs, steps,
dependencies, matrices, permissions, environments, secrets, outputs, and
conditional execution should compile to normal GitHub Actions YAML.

This preserves several important properties:

- the GitHub web UI still shows meaningful job and step boundaries
- existing Actions features remain available without reimplementing them
- workflow failures can still be understood through ordinary GitHub logs
- repository settings, environments, secrets, and permissions keep their normal
  GitHub semantics
- generated YAML can be reviewed as a native artifact

Forge should compile to `.github/workflows/*.yml`, not to a separate CI
scheduler.

## Language-Native Step Implementation

GitHub Actions YAML is useful for orchestration, but it is a limited medium for
non-trivial step logic. Shell fragments and inline scripts can become difficult
to type-check, share, refactor, and test.

Forge's proposed step model moves implementation bodies into Deno code while
keeping each logical step as a normal Actions step. The generated YAML should
invoke the same compiled runtime binary with different subcommands, for example:

```yaml
- name: Test
  run: forge-runtime test

- name: Build
  run: forge-runtime build
```

The runtime binary is responsible for dispatching to the registered step
entrypoint. GitHub Actions remains responsible for ordering, condition
evaluation, matrix expansion, secrets injection, environment protection, and
other workflow behavior.

## Boundary

Forge's core design boundary is:

- GitHub Actions owns orchestration.
- Forge owns authoring, validation, YAML emission, and step implementation
  dispatch.

This boundary is intended to avoid both extremes:

- hand-maintained YAML for complex workflows
- one opaque CI command that hides the workflow graph from GitHub Actions
