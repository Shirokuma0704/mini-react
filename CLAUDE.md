# Project rules (agent-facing, keep short)

Framework: `~/.claude/skills/orchestrate/SKILL.md`. These lines only add what is specific to this project.
Keep each rule one line. Delete rules that stop being true, in the same commit as the code change.
This is his real mini React build (from 11-09), grown from the 11-06 trial run (../trial-vdom kept as the record).

## Specs
- Spec: ../spec-draft.md — §1 VDOM, §2 verification page, §3 diff, §4 Phase 2 hooks + §4-10 controlled boxes all built (rows 1-22 in progress.md); §4-9 final demo page not decided
- Pages: index.html = Phase 1 verification page; hooks.html = Phase 2 check page (one card per hook feature, render-count probes)
- Verification page extras (11-10, rows 23-24, spec §2-6): action log (src/page-tools/actionLog.js), real-DOM touch watcher (src/page-tools/touched.js), motion (src/page-tools/motion.js). Motion must never write a class/attribute into #actual or #preview: use element.animate or the #actual-fx layer. Same rule for hooks.html cards (.demo): src/hooks-page/liveMotion.js (motion) and src/hooks-page/hooksLog.js (action log, rows 25-26) only observe them
- Phase 2 roles (his decision 11-09): Opus writes tests first, a Sonnet worker implements and may not edit tests
- Framework decisions: ../agent-framework-spec.md

## Commands
- Test: `npm test` (= `node --test`, Node v24; jsdom 31 as devDependency for a DOM)
- Run: `npm start` → http://localhost:5173/ (server.js, Node http only; PORT env overrides). ES modules do not load from file://
- Live: https://shirokuma0704.github.io/mini-react/ (GitHub Pages, branch build from master root, `.nojekyll`; every push to master redeploys). README screenshots: docs/screenshots/ (taken from the live site 11-11, 1280 wide, light)
- Source is ES modules (`"type": "module"`) so it can later run in a browser unchanged.
- src layout (11-11, his request): core/ = DOM↔VDOM, diff, patch, events; component/ = h, expand, hooks, controlled boxes; page-tools/ = touch watcher, motion, action log (both pages); verify-page/ = index.html; hooks-page/ = hooks.html. server.js serves only src/<folder>/<file>.js (one level). Tests stay flat in test/

## Docs
- Progress (agent): docs/agent/progress.md
- His "why" docs (Obsidian): jungle-notes/mini-react/ (his choice, 11-06)
- Friction log: ../friction-log.md

## Git
- Public personal repo github.com/Shirokuma0704/mini-react (portfolio). Commit to master and push; Korean messages; no co-author trailer.
- One feature = one commit.
