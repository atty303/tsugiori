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

Generated workflow files are intended to be committed. A local git hook may run
the compiler before commit, but hook execution should be treated as a
convenience rather than the only correctness mechanism. A future check mode
should compare committed YAML with compiler output and fail when it is stale.

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
  run: ./.forge/runtime/forge-runtime test

- name: Build
  run: ./.forge/runtime/forge-runtime build
```

The initial direction is to use `deno compile` for this runtime binary.

The binary should be addressed by a stable artifact key derived from the inputs
that affect runtime behavior, such as workflow source, registered step source,
dependency state, target platform, and Forge version. When those inputs change,
the key changes and the binary should be rebuilt or restored from the matching
cache entry.

### Runtime Artifact Manifest

The runtime artifact manifest is proposed metadata connecting generated YAML to
the runtime binary it expects.

It should record enough information for generated jobs to prepare the correct
binary before logical Forge steps run:

- artifact key
- target platform
- runtime binary path
- registered subcommands
- cache adapter selection and adapter-specific reference data

The manifest should not become a scheduler. It should describe how to obtain
the binary that ordinary GitHub Actions steps will invoke.

### Runtime Cache Adapter

The runtime cache adapter abstracts storage and retrieval of compiled runtime
artifacts.

The compiler and generated preparation steps should depend on a small artifact
contract rather than on one storage provider. Candidate adapters include
`actions/cache`, GCR or another OCI registry, S3, and local development cache
storage.

The adapter boundary should preserve visible GitHub Actions steps. A generated
job may contain explicit preparation steps that restore or build the runtime
binary, but logical Forge steps should still appear as their own normal Actions
steps that invoke the prepared binary with distinct subcommands.

## Compile Time and GitHub Runtime Time

Forge needs a strict distinction between compile-time behavior and GitHub
runtime-time behavior.

Compile time happens when Forge authoring code runs to produce workflow YAML and
the runtime binary. At compile time, the compiler can validate structure,
register steps, emit YAML, and fail early on unsupported workflow shapes.

For normal repository work, this compile step is intended to happen before
commit, commonly through a git hook. The generated YAML is then committed and
loaded by GitHub Actions like any other workflow file.

GitHub runtime time happens when GitHub Actions executes the generated workflow.
At that point, GitHub evaluates contexts, expands matrices, applies `if`
conditions, resolves `needs`, handles secrets, enforces environments, and runs
steps.

Generated jobs may also prepare the compiled Forge runtime binary at GitHub
runtime time by restoring it from a cache adapter or building it on a cache
miss. That preparation should be visible as ordinary setup work. It should not
move workflow orchestration into Forge or collapse logical steps into one
opaque command.

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
  run: ./.forge/runtime/forge-runtime upload
```

Representing GitHub `if:` as an expression AST keeps this distinction explicit.
It prevents accidental evaluation in the host language, allows the compiler to
emit valid GitHub expression syntax, and makes it possible to validate
references such as `matrix`, `github`, `needs`, `inputs`, and `secrets`.
