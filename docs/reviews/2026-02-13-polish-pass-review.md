# Polish Pass Code Review Results

**Date:** 2026-02-13
**Branch:** `feature/warning-escalation-guardrails`
**Commits:** f360f83..ac86b3e (7 commits)
**Verdict:** Ready to merge

---

## Open Items for Next Design Spec

### Important: Absolute path check allows false positives

- **File:** `extensions/workflow-monitor.ts:436-437`
- **Issue:** `normalizedForCheck.indexOf("docs/plans/")` matches any path containing `docs/plans/` anywhere (e.g. `/tmp/evil/docs/plans/attack.ts`). The slash guard helps but doesn't verify it's the project's actual `docs/plans/`.
- **Current risk:** Low — guardrail for agent self-discipline, not a security boundary.
- **Fix:** Resolve against `process.cwd()` or a known project root.

### Minor: Duplicated skill-extraction regex

- **Files:** `workflow-tracker.ts:150-153`, `workflow-monitor.ts:123-127`
- **Issue:** Same slash+XML regex pair (`/^\s*\/skill:([^\s]+)/` + `/<skill\s+name="([^"]+)"/`) appears in both `onInputText` and `parseTargetPhase`.
- **Fix:** Extract a `parseSkillName(line): string | null` helper in `workflow-tracker.ts`, export it, use in both call sites.

### Minor: Duplicated test helpers across test files

- **Files:** `warning-escalation-session-allow.test.ts`, `warning-escalation-practice.test.ts`, and others
- **Issue:** `createFakePi()` and `getSingleHandler()` are copy-pasted across multiple test files.
- **Fix:** Extract to `tests/extension/workflow-monitor/test-helpers.ts`.
