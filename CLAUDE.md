# Project rules (agent-facing, keep short)

Framework: `~/.claude/skills/orchestrate/SKILL.md`. These lines only add what is specific to this project.
Keep each rule one line. Delete rules that stop being true, in the same commit as the code change.
This folder is a **trial run** of the framework (11-06), not his real mini React build.

## Specs
- Spec: ../spec-draft.md section 1 (VDOM node) only
- Framework decisions: ../agent-framework-spec.md

## Commands
- Test: `npm test` (= `node --test`, Node v24; jsdom 31 as devDependency for a DOM)
- Source is ES modules (`"type": "module"`) so it can later run in a browser unchanged.

## Docs
- Progress (agent): docs/agent/progress.md
- His "why" docs (Obsidian): jungle-notes/mini-react/ (his choice, 11-06)
- Friction log: ../friction-log.md

## Git
- Local repo only, no remote, no push. Personal → no co-author trailer.
- One feature = one commit.
