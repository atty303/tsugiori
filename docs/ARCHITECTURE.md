# Architecture

This document describes the proposed architecture. It is not an implemented
system.

## Proposed Components

### Core Package

`@tsugiori/core` is the pure package imported by pipeline and task authors.

It may contain both provider pipeline authoring modules and task authoring
modules. Those modules should stay internally separate, but they do not need to
be separate packages before the project has a practical reason to split them.

The package should avoid filesystem access, process execution, network access,
package installation, YAML writing, and compiler side effects. Its job is to
construct structured data that compiler and runtime packages can consume later.

Authoring imports should make the provider boundary visible through subpaths.
For example, GitHub Actions pipeline authoring can live under
`@tsugiori/core/github-actions`, while task authoring can live under
`@tsugiori/core/task`.

### Provider Pipeline Authoring

The authoring API uses `pipeline` as its general term for CI definitions. The
details of a pipeline definition are provider-native.

The project should not define a provider-neutral pipeline model with shared jobs,
steps, matrices, dependencies, expressions, and outputs. Those concepts vary by
CI provider, and forcing them into a portable model would reduce provider
expressiveness.

Each provider backend should define its own authoring surface, intermediate
representation, validation rules, expression model, file layout, runtime
preparation shape, and emitter.

### GitHub Actions Provider Backend

The GitHub Actions provider backend is the compiler and emitter layer for
GitHub Actions. It is not GitHub Actions itself.

It should model GitHub Actions concepts explicitly:

- workflows
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

The GitHub Actions provider backend may use a GitHub Actions workflow AST as
its backend-native intermediate representation. That AST should preserve enough
structure for validation and deterministic YAML emission.

Future provider backends should define their own provider-native
representations rather than forcing their semantics through the GitHub Actions
workflow AST.

### GitHub Actions Expression AST

GitHub Actions expressions should be represented as an expression AST, not as
plain strings and not as host-language conditionals.

Examples include:

- `matrix.deno`
- `github.ref == 'refs/heads/main'`
- `always() && failure()`
- `needs.build.outputs.artifact-name`

The expression AST should support validation, escaping, interpolation, and YAML
emission into `${{ ... }}` syntax.

Future provider backends may need different expression models or no direct
equivalent. Those differences should be represented in each provider backend.

### GitHub Actions YAML Emitter

The GitHub Actions YAML emitter converts the GitHub Actions workflow AST into
GitHub Actions YAML.

It should aim for stable output that is easy to review. The emitter should not
invent an execution model. Its job is to serialize native GitHub Actions
concepts from the AST into `.github/workflows/*.yml`.

Generated workflow files are intended to be committed. A local git hook may run
the compiler before commit, but hook execution should be treated as a
convenience rather than the only correctness mechanism. A future check mode
should compare committed YAML with compiler output and fail when it is stale.

Other provider backends should have their own emitters and output file
conventions. For example, a future GitLab CI provider backend would need to
emit GitLab-native configuration rather than GitHub Actions YAML.

### Generated YAML Stale Check

When implementation begins, the compiler should distinguish generation from stale
output checking.

The planned `tsugiori generate` command should run the pipeline authoring source
and write the generated GitHub Actions workflow files to their configured
`.github/workflows/*.yml` paths.

The planned `tsugiori generate --check` command should run the same generation
logic without modifying files. It should compare the generated output with the
committed workflow files and exit with a non-zero status when any generated file
is missing, extra, or different from the expected output.

Check mode should be suitable for CI, but this repository should not add
generated workflow files or CI configuration until implementation work begins.
The check should report which generated files are stale, while leaving the
source tree unchanged so authors can run normal generation locally and review
the resulting diff.

### Task Functions

A task function is code authored in the same language family as the pipeline
definition and intended to run as CI work.

Task functions are separate from provider pipeline authoring. A repository may
use task functions from handwritten provider configuration, and a provider
backend may also emit provider steps that invoke task functions.

In GitHub Actions authoring, a task can be passed to a provider-native step:

```ts
job.step("Test", testTask);
```

The generated GitHub Actions YAML should still contain a normal visible step.
The task implementation body should not be inlined into YAML.

### Task Registry

The task registry maps task identifiers to implementation functions.

The registry should be available to task artifact preparation and to provider
backends that emit task-backed provider steps, so generated configuration and
task runtime dispatch stay aligned.

### Task Runtime

The task runtime is the mechanism that executes registered task functions in
CI.

A provider step that invokes a task should call the task runtime with a
distinct entrypoint:

```yaml
- name: Test
  run: ./.tsugiori/task-runtime test

- name: Build
  run: ./.tsugiori/task-runtime build
```

The initial direction is to build the task runtime with Deno. The resulting
task artifact may be a binary, a bundle, an OCI image, WebAssembly, or another
prepared runtime form in the future. The design should not depend on the
artifact always being a native binary.

### Task Artifact

The task artifact is the prepared output used by CI provider steps to execute
registered task functions. An OCI image may itself be the task artifact; the
design should not require wrapping it in a second project-specific artifact.

It should be addressed by a stable artifact key derived from the inputs that
affect task runtime behavior, such as registered task source, dependency state,
target platform, tool version, and artifact form. When those inputs change,
the key changes and the artifact should be rebuilt or restored from the
matching cache entry.

### Task Artifact Metadata and Manifest

Task artifact metadata connects provider configuration to the task artifact it
expects.

A manifest file is one possible representation of this metadata, but the design
should not require a separate manifest artifact. Metadata may be derived,
embedded in the prepared task artifact, or represented in another
task-runtime-owned form.

If materialized as a manifest, it should record enough information for
provider steps to prepare the correct task artifact before task-backed provider
steps run:

- artifact key
- target platform
- task runtime path or invocation form
- registered task entrypoints
- cache adapter selection and adapter-specific reference data

Task artifact metadata should not become a scheduler. It should describe how to
obtain the artifact that ordinary CI provider steps will invoke.

Provider backends should emit preparation steps using provider-native
configuration shape when they integrate with the task runtime. They may
reference task-owned metadata, but they should not own its shape.

### Task Artifact Cache Adapter

The task artifact cache adapter abstracts storage and retrieval of prepared
task artifacts.

The task runtime tooling and generated preparation steps should depend on a
small artifact contract rather than on one storage provider.
Candidate adapters include
`actions/cache`, GCR or another OCI registry, S3, and local development cache
storage.

Task artifact preparation should first try to restore the content-addressed
artifact through the selected adapter. On a cache miss, it should build the
artifact and populate the selected adapter before later provider steps invoke
task runtime entrypoints.

The adapter boundary should preserve visible provider-native steps. In the
GitHub Actions provider backend, a generated job may contain explicit
preparation steps that restore or build the task artifact, but task-backed
provider steps should still appear as their own normal Actions steps that
invoke the task runtime with distinct entrypoints.

## Compile Time and GitHub Runtime Time

The design needs a strict distinction between compile-time behavior and GitHub
runtime-time behavior.

This section describes the initial GitHub Actions provider backend. Future
provider backends should keep the same compile-time versus CI-runtime
distinction, but their runtime contexts and expression semantics may differ.

Pipeline compile time happens when authoring code runs to produce
provider-native configuration. At compile time, the compiler can validate
structure, emit YAML, and fail early on unsupported pipeline shapes.

Task artifact preparation is related but separate. It collects registered task
functions and prepares the task artifact used by provider steps. This can be
used with generated pipeline configuration or with handwritten provider
configuration.

The planned `tsugiori generate` command should generate provider-native
pipeline configuration. The planned `tsugiori task prepare` command should
restore, build, and populate task artifacts. A future convenience command may
compose those operations, but the underlying responsibilities should remain
separate.

For normal repository work, this compile step is intended to happen before
commit, commonly through a git hook. The generated YAML is then committed and
loaded by GitHub Actions like any other workflow file.

GitHub runtime time happens when GitHub Actions executes the generated workflow.
At that point, GitHub evaluates contexts, expands matrices, applies `if`
conditions, resolves `needs`, handles secrets, enforces environments, and runs
steps.

Generated or handwritten jobs may also prepare a task artifact at GitHub
runtime time by restoring it from a cache adapter or building it on a cache
miss. That preparation should be visible as ordinary setup work. It should not
move workflow orchestration into the tool or collapse provider steps into one
opaque command.

These phases have different information available. For example, matrix values,
`github` context values, secrets, and previous job outputs are GitHub runtime
values. They are not generally known when the compiler emits YAML.

## Why `if:` Is an Expression AST

A host-language `if` controls what the compiler emits:

```ts
if (includeUploadStep) {
  job.step("Upload", uploadTask);
}
```

That kind of condition is evaluated at compile time. If the condition is false,
the step does not exist in the generated workflow.

A GitHub Actions `if:` controls whether an existing job or step runs inside
GitHub Actions:

```ts
job.step("Upload", uploadTask, {
  if: expr.always().and(expr.failure()),
});
```

That condition must be preserved in the generated YAML:

```yaml
- name: Upload
  if: ${{ always() && failure() }}
  run: ./.tsugiori/task-runtime upload
```

Representing GitHub `if:` as an expression AST keeps this distinction explicit.
It prevents accidental evaluation in the host language, allows the compiler to
emit valid GitHub expression syntax, and makes it possible to validate
references such as `matrix`, `github`, `needs`, `inputs`, and `secrets`.
