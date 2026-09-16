# Codex Workflow

This repository is structured so Codex can work from durable project context
rather than a long prompt every time.

## Layers

- `AGENTS.md` contains repository instructions that Codex should load for every
  task.
- `docs/` contains product, architecture, roadmap, and decision context.
- `docs/TASKS.md` contains AI-friendly task slices.
- `docs/PROMPTS.md` contains reusable prompts for common Codex workflows.
- `.agents/skills/` contains repository-specific Codex skills for repeatable
  procedures.

Keep `AGENTS.md` concise. Put longer explanations in `docs/` and link to them.

## Default Task Flow

For non-trivial work, use this loop:

1. Identify the task type: documentation, design, implementation, review, or
   cleanup.
2. Read the smallest relevant context set from `AGENTS.md` and `docs/`.
3. State the intended change and any assumptions.
4. Make a focused edit.
5. Verify the result with the available checks.
6. Review the diff for drift against the project direction.
7. Update `docs/TASKS.md`, `docs/ROADMAP.md`, or an ADR when the change affects
   future work.

## Task Context Packs

Use these starting points instead of reading every file.

### Product or Concept Change

- `README.md`
- `docs/CONCEPT.md`
- `docs/GLOSSARY.md`
- `docs/NON_GOALS.md`
- `docs/COMPARISONS.md`
- relevant ADRs

### Architecture Change

- `docs/ARCHITECTURE.md`
- `docs/GLOSSARY.md`
- `docs/ROADMAP.md`
- relevant ADRs
- `docs/CONCEPT.md`

### Example or Authoring API Change

- `README.md`
- `docs/EXAMPLE.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS/0002-deno-as-initial-runtime.md`

### Implementation Change

- `AGENTS.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- relevant ADRs
- `docs/TASKS.md`

Use this pack for changes to the current compiler slice or for explicitly
requested later-phase implementation.

## Definition of Done

For documentation-only changes:

- changed files are limited to documentation or agent guidance
- wording does not imply unimplemented behavior already exists
- generated examples remain GitHub Actions-native
- generated workflow YAML remains described as committed review output, not as
  runtime-generated orchestration
- task artifact delivery remains provider-owned and does not become a hidden
  scheduler
- no package manifests, source files, dependencies, or CI files were added by
  accident

For implementation changes:

- the change fits the current roadmap phase or the task explicitly changes the
  phase order
- tests cover the provider backend or task runtime behavior touched by the
  change
- generated YAML remains readable and Actions-native
- relevant docs and ADRs are updated
- `AGENTS.md` lists real verification commands once they exist

## Decision Capture

Create or update an ADR when a change:

- changes the execution model
- changes the initial runtime choice
- changes how generated workflow YAML or task artifacts are produced,
  committed, restored, or cached
- changes the AST or expression model in a durable way
- adds a new target platform
- changes a non-goal into a goal
- introduces a dependency with architectural consequences

Small wording changes, examples, and backlog edits do not need ADRs.

## Parallel Codex Threads

Multiple Codex threads are useful for exploration, but avoid having two threads
edit the same files. Split parallel work by area, for example:

- one thread updates comparisons
- one thread drafts an ADR
- one thread reviews examples

Merge results manually and ask Codex to review the combined diff.

## When to Update Guidance

Update `AGENTS.md` when a rule should apply to every future task.

Update `docs/CODEX_WORKFLOW.md` when the team changes how it wants Codex-driven
work to proceed.

Update `docs/PROMPTS.md` when a prompt pattern proves reusable.

Update `.agents/skills/` when a repeatable workflow needs dedicated procedure,
references, or review criteria.
