# Codex Prompts

These prompts are starting points for Codex work in this repository. Adjust the
task-specific details before sending them.

## Planning Prompt

```text
We are working in the Forge repository.

Goal:
<describe the change>

Context:
- Read AGENTS.md.
- Read docs/CONCEPT.md, docs/ARCHITECTURE.md, and relevant ADRs.
- Do not implement runtime code unless the plan explicitly requires it and I
  confirm.

Constraints:
- Preserve GitHub Actions-native orchestration.
- Do not collapse workflow behavior into one opaque runtime command.
- Treat generated workflow YAML as committed review output.
- Treat runtime binary caches as adapter-backed artifact delivery.
- Keep unimplemented behavior described as proposed or intended.

Done when:
- You provide a concrete plan with files to edit, open questions, and
  verification steps.
```

## Documentation Change Prompt

```text
Update Forge documentation for <topic>.

Read AGENTS.md and the smallest relevant docs first. Keep the tone precise and
sober. Do not claim implementation exists. Do not add code, dependencies,
package manifests, generated workflows, or CI configuration.

Done when:
- The requested documentation is updated.
- Related docs stay consistent.
- Any durable change to generated YAML or runtime artifact handling has an ADR.
- You confirm no implementation scaffolding was added.
```

## ADR Prompt

```text
Draft an ADR for this Forge decision:

Decision:
<decision>

Context:
<why the decision is being considered>

Constraints:
- Forge targets GitHub Actions-native YAML generation.
- GitHub Actions remains the orchestration platform.
- Generated workflow YAML should remain a committed, reviewable artifact.
- Runtime binary cache adapters should not hide logical jobs or steps.
- The ADR should be concise and sober.
- Include consequences and trade-offs.

Place the ADR under docs/DECISIONS using the next numeric prefix.
```

## Future Implementation Slice Prompt

```text
Implement the next minimal Forge slice:

Slice:
<specific implementation slice>

Context:
- Read AGENTS.md.
- Read docs/ROADMAP.md and docs/ARCHITECTURE.md.
- Stay within the current roadmap phase unless I explicitly say otherwise.

Constraints:
- Keep the implementation small and testable.
- Preserve Actions-native YAML output.
- Represent GitHub Actions expressions as an expression AST.
- Add or update tests for behavior touched by the change.
- Update docs only where behavior or commands actually changed.

Done when:
- The slice is implemented.
- Relevant tests pass.
- You summarize files changed and verification performed.
```

## Review Prompt

```text
Review the current Forge diff.

Use a code-review stance: findings first, ordered by severity, with file and
line references. Focus on project-direction drift, unimplemented claims,
Actions-native constraints, compile-time vs GitHub runtime-time confusion, and
missing tests when code is present.

If there are no findings, say so and mention residual risk.
```

## Retrospective Prompt

```text
Review the last task for recurring Codex guidance gaps.

If a mistake or ambiguity is likely to recur, propose a small AGENTS.md update.
Do not add broad process rules. Keep guidance specific, actionable, and tied to
this repository.
```
