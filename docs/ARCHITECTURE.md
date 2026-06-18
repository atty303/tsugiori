# Architecture

This document describes the proposed architecture. It is not an implemented
system.

## Proposed Components

### Authoring API

The authoring API is the TypeScript interface used by workflow authors.

It should expose typed builders or declarative objects for workflows, jobs,
steps, triggers, matrices, permissions, environments, outputs, and reusable
workflow contracts.

The API should produce structured intermediate data instead of writing YAML
directly.

### Workflow AST

The workflow AST is the compiler's representation of a GitHub Actions workflow.

It should model Actions concepts explicitly:

- workflow name
- events
- jobs
- job dependencies
- strategy and matrix
- permissions
- concurrency
- environments
- secrets
- outputs
- steps

The AST should preserve enough structure for validation and deterministic YAML
emission.

### Expression AST

GitHub Actions expressions should be represented as an expression AST, not as
plain strings and not as host-language conditionals.

Examples include:

- `matrix.deno`
- `github.ref == 'refs/heads/main'`
- `always() && failure()`
- `needs.build.outputs.artifact-name`

The expression AST should support validation, escaping, interpolation, and YAML
emission into `${{ ... }}` syntax.

### YAML Emitter

The YAML emitter converts the workflow AST into GitHub Actions YAML.

It should aim for stable output that is easy to review. The emitter should not
invent an execution model. Its job is to serialize native GitHub Actions
concepts from the AST into `.github/workflows/*.yml`.

### Step Registry

The step registry maps logical step identifiers to Deno implementation
entrypoints.

For example, a workflow step named `Test` might refer to a runtime subcommand
named `test`. The registry would associate `test` with a Deno function that
performs the step's implementation.

The registry should be available to both the compiler and the runtime build
process so that generated YAML and runtime dispatch stay aligned.

### Compiled Deno Runtime Binary

The compiled Deno runtime binary is the command invoked by generated workflow
steps.

Each logical Forge step should compile to a normal GitHub Actions step that
calls the same runtime binary with a distinct subcommand:

```yaml
- name: Test
  run: forge-runtime test

- name: Build
  run: forge-runtime build
```

The initial direction is to use `deno compile` for this runtime binary.

## Compile Time and GitHub Runtime Time

Forge needs a strict distinction between compile-time behavior and GitHub
runtime-time behavior.

Compile time happens when Forge authoring code runs to produce workflow YAML and
the runtime binary. At compile time, the compiler can validate structure,
register steps, emit YAML, and fail early on unsupported workflow shapes.

GitHub runtime time happens when GitHub Actions executes the generated workflow.
At that point, GitHub evaluates contexts, expands matrices, applies `if`
conditions, resolves `needs`, handles secrets, enforces environments, and runs
steps.

These phases have different information available. For example, matrix values,
`github` context values, secrets, and previous job outputs are GitHub runtime
values. They are not generally known when Forge emits YAML.

## Why `if:` Is an Expression AST

A host-language `if` controls what the compiler emits:

```ts
if (includeUploadStep) {
  job.step("Upload", "upload");
}
```

That kind of condition is evaluated at compile time. If the condition is false,
the step does not exist in the generated workflow.

A GitHub Actions `if:` controls whether an existing job or step runs inside
GitHub Actions:

```ts
job.step("Upload", "upload", {
  if: expr.always().and(expr.failure()),
});
```

That condition must be preserved in the generated YAML:

```yaml
- name: Upload
  if: ${{ always() && failure() }}
  run: forge-runtime upload
```

Representing GitHub `if:` as an expression AST keeps this distinction explicit.
It prevents accidental evaluation in the host language, allows the compiler to
emit valid GitHub expression syntax, and makes it possible to validate
references such as `matrix`, `github`, `needs`, `inputs`, and `secrets`.
