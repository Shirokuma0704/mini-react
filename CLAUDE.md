# Project rules (agent-facing, keep short)

Framework: `~/.claude/skills/orchestrate/SKILL.md`. These lines only add what is specific to this project.
Keep each rule one line. Delete rules that stop being true, in the same commit as the code change.
This is his real mini React build (from 11-09), grown from the 11-06 trial run (../trial-vdom kept as the record).

## Specs
- Spec: ../spec-draft.md — section 1 (VDOM node) built; grill the rest before building
- Framework decisions: ../agent-framework-spec.md

## Commands
- Test: `npm test` (= `node --test`, Node v24; jsdom 31 as devDependency for a DOM)
- Run: `npm start` → http://localhost:5173/ (server.js, Node http only; PORT env overrides). ES modules do not load from file://
- Source is ES modules (`"type": "module"`) so it can later run in a browser unchanged.

## Docs
- Progress (agent): docs/agent/progress.md
- His "why" docs (Obsidian): jungle-notes/mini-react/ (his choice, 11-06)
- Friction log: ../friction-log.md

## Git
- Public personal repo github.com/Shirokuma0704/mini-react (portfolio). Commit to master and push; Korean messages; no co-author trailer.
- One feature = one commit.
