# Roadmap

This roadmap is **directional** (not a promise). Priorities may shift based on real-world usage and feedback.

- Shipped changes: see [CHANGELOG.md](./CHANGELOG.md)
- Detailed plans/notes: see [docs/plans/](./docs/plans/)
- **Questions/support:** [GitHub Discussions](https://github.com/coctostan/pi-superpowers-plus/discussions)
- **Bugs & feature requests:** [GitHub Issues](https://github.com/coctostan/pi-superpowers-plus/issues/new/choose)

## Tracking links

- [Discussions (questions/support)](https://github.com/coctostan/pi-superpowers-plus/discussions)
- [New issue (bug/feature)](https://github.com/coctostan/pi-superpowers-plus/issues/new/choose)
- [Open bugs](https://github.com/coctostan/pi-superpowers-plus/issues?q=is%3Aissue+is%3Aopen+label%3Abug)
- [Confirmed bugs](https://github.com/coctostan/pi-superpowers-plus/issues?q=is%3Aissue+is%3Aopen+label%3Abug+label%3Aconfirmed)
- [Enhancements](https://github.com/coctostan/pi-superpowers-plus/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)

## Tags

- **[user]** user-visible behavior / UX
- **[maintainer]** refactors, internals, tests, CI
- **[docs]** documentation
- **[infra]** packaging / release / build plumbing

---

## v0.2.0 — Reliability & Diagnostics ✅ Shipped

The "stop losing users silently" release. Observability and CI.

- **Logging & Error Handling** — ✅ Shipped in 0.2.0-alpha.1. Logger module, error handling sweep, catch block classification. See [CHANGELOG.md](./CHANGELOG.md).
- **CI Pipeline** — ✅ Shipped. GitHub Actions CI (vitest + biome check) and publish (tag-triggered npm publish). Biome added, initial format pass done.

Outstanding code review items from v0.2.0 are tracked as tech debt in v0.3.0 below.

---

## v0.3.0 — Hardening

The "safe for strangers to rely on" release. Security fixes, resilient subagent lifecycle, state that survives across sessions, and tech debt cleanup from v0.2.0.

### Biome Lint Cleanup ✅

**[maintainer]** ~~Fix the ~166 biome warnings remaining after the initial format pass.~~ Done in cleanup sprint — 0 warnings remaining. Auto-fixed template literals/assertions, suppressed `noExplicitAny` at SDK boundaries, added biome.json test overrides.

### Code Review Debt

**[maintainer]** Outstanding review items from v0.2.0 branches. Three sources:

**From logging review** (`docs/plans/logging-review-fixes.md`):
1. Replace brittle source-inspection tests with behavioral tests (3 test files read source and check for string patterns instead of mocking + asserting)
2. Fix log rotation for long-running processes (replace `rotatedThisSession` boolean with time-based check)
3. Add message truncation (10KB cap) and document sync I/O choice

**From logging code review notes** (ROADMAP v0.2.0 section):
4. Logger's own catch blocks lack error detail — add one-time stderr fallback
5. No crash-safety test for the logger
6. Duplicated logger mock setup across 3 test files — extract to shared utility

**From phase 2 code review** (`docs/plans/2026-02-10-phase2-code-review-findings.md`):
7. ~~TDD `source-during-red` false-positives during legitimate RED→GREEN work~~ ✅ Fixed — added `red-pending` phase to distinguish "test written but not run" from "tests failing"
8. ~~DebugMonitor conflicts with normal TDD~~ ✅ Fixed — debug monitor only activates when TDD phase is `idle`
9. ~~Investigation detection misses common non-bash tools~~ ✅ Fixed — added `isInvestigationToolCall()` for LSP, kota, and web search tools
10. ~~"Excessive fix attempts" off-by-one in warning count/wording~~ ✅ Fixed — counter now shows "N failed fix attempts" instead of "fix attempt #N"

### Cleanup Sprint Follow-ups

**[maintainer]** Architectural notes from the v0.3.0 cleanup sprint code review (`v0.3.0/cleanup-sprint` branch):

1. **Debug activation reads TDD phase after mutation** — In `workflow-handler.ts`, `tdd.getPhase()` is called *after* `tdd.onTestResult()` has already changed the phase. Should snapshot the phase before the mutation. No current bug (only commit transitions to idle), but fragile under future changes.
2. **`isRedVerificationPending()` and `redVerificationPending` flag are partially redundant** — With `red-pending` as an explicit phase, the boolean flag duplicates information already encoded in the phase. The flag is still used in state persistence (`setState`/`getState`), so removal requires careful refactoring. Candidate for the Workflow Monitor Refactor in v0.4.0.

### Security Audit

**[maintainer]** Two targeted fixes (path traversal already fixed in 0.2.0-alpha.1):

1. **Subagent spawn sanitization** — validate and constrain args passed to `spawn("pi", ...)`. LLM-crafted task strings should not be able to inject flags or shell metacharacters.
2. **Environment filtering** — replace `{ ...process.env }` spread in subagent spawns with an explicit allowlist of env vars that subagents actually need. Currently leaks every env var the parent process has.

### Subagent Hardening

**[maintainer]** Lifecycle and resource management for spawned subagents:

- Configurable timeout per invocation (default ~10 minutes)
- Kill mechanism for stuck subagents
- Cancellation propagation — if the parent session is interrupted, child subagents get cleaned up
- Cap on concurrent subagents to prevent runaway parallelism

### Session Persistence

**[user]** File-based state keyed by git branch, stored at `~/.pi/superpowers-plus/<branch>.json`. Persisted state includes: workflow phase, TDD monitor state, debug cycle counts, warning strikes. Rehydrated on `session_start` by reading the current branch's state file.

State file is cleared when the workflow completes (finish phase) or on explicit reset. This enables cross-session continuity — close your laptop, come back the next day, and the workflow monitor knows where you left off on that branch. Also handles mid-session restarts for free.

### Error Surfacing Review

**[user]** Second pass (building on v0.2.0 logging) focused specifically on failures that silently change behavior. The key pattern: an operation fails, the `catch` falls through to a permissive default, and the user gets no warning that a safety check was skipped. Identify every such case and surface via `ctx.ui.notify()`.

---

## v0.4.0 — Quality & Completeness

The "mature package" release. Fill testing gaps, address known skill blindspots, and pay down structural debt.

### Integration / E2E Tests

**[maintainer]** Write tests that load extensions into a real (or near-real) pi instance. The 253 unit tests against FakePi are solid for logic but can't catch registration issues, event wiring bugs, or lifecycle problems. Start with smoke tests: extension loads, workflow monitor widget appears, subagent spawns and returns. Not aiming for full E2E coverage — just the critical paths that unit tests structurally can't reach.

### Documentation Workflow Skill

**[docs]** Address the blindspot analysis finding: no skill prompts "update the docs" after implementation. Add a skill or verification-monitor check that reminds the agent to update documentation when commits touch public-facing code. Could be a dedicated skill or a lightweight check in the existing verification phase.

### Workflow Monitor Refactor

**[maintainer]** The main `workflow-monitor.ts` (782 lines) handles event routing, widget rendering, workflow commands, escalation, git checks, and state management in one closure. Continue extracting into the `workflow-monitor/` subdirectory — the pattern already exists with 13 extracted modules. Not changing behavior, just improving maintainability. The logging from v0.2.0 makes this safer since refactored code can be verified against the same decision trail.

### Skill Blindspot Sweep

**[maintainer]** Work through the Tier 1 and Tier 2 items from `docs/plans/2026-02-10-skill-blindspot-analysis.md`. Gaps in skill coverage and enforcement — missing edge cases in phase transitions, incomplete heuristics in the TDD monitor, etc. Batch as a sweep after the refactor makes the code easier to change.

---

## Future

Ideas with no timeline. May become milestones, may not.

- **[user]** Decision log / session recap — human-readable summary of workflow decisions, usable as a "here's where you left off" on session rejoin
- **[user]** Higher-level activity audit trail — record of what the workflow monitor decided and why, reviewable as an end-of-process recap
- **[maintainer]** Skill consistency pass — normalize wording, boundaries, and stop conditions across all 12 skills

---

## Maintenance rules

- If a roadmap item becomes real work, link it to a GitHub Issue or a plan doc under `docs/plans/`
- When an item ships, move it to [CHANGELOG.md](./CHANGELOG.md) with the release version
