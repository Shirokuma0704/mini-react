# Progress (agent-facing)

Single source of truth for the orchestrate loop. One row per feature, in dependency order.
"Him" is set only when 상철님 says he verified it. Features built but not "Him ✔" count as "ahead" (max 3).

| # | Feature | Depends on | Tests | Codex | Commit | Him | Why doc |
|---|---------|------------|-------|-------|--------|-----|---------|
| 1 | domToVdom: real DOM node → VDOM node (spec-draft §1) | — | 9/9 pass (test-run-3.log) | r1 (5.6-sol): 4 issues → 2 fixed, 1 to him, 1 process. r2 (6-astra): fixes confirmed; bookkeeping fixed; #2 resolved by him (keep whitespace) | see git log | ✔ 11-09 10:52 (printed real output for the spec example, compared with spec-draft §1: "내 의도랑 맞는거같아") | jungle-notes/mini-react/VDOM 변환.md |

Ahead of his verification: 0/3

## Open disagreements / unsure spots
<!-- file:line — what — who raised it (me / Codex) -->
- ~~whitespace~~ RESOLVED 11-06: 상철님 "그대로 두기" → spec-draft §1 rule added, test added. Whitespace-only text between tags is therefore kept too — Codex r1 #2
- ~~comments~~ RESOLVED 11-09: 상철님 "개발용인데 굳이 보낼 필요가 없잖아" → drop comments (src/domToVdom.js return null), spec-draft §1 rule added. Carry to the patch spec: VDOM child index ≠ real DOM childNodes index when a comment sits in between — me
- tag names: lowercase via localName (spec example uses `p`); SVG keeps case — me
