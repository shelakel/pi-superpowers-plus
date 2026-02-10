# Phase 2 Code Review Findings (for next design discussion)

Date: 2026-02-10

Scope reviewed:
- Phase 2 “debug monitor” implementation in workflow-monitor extension
- Lean/refactor of `skills/systematic-debugging/SKILL.md` + extracted reference content

Git range:
- Base: `3b39d655e34ca1aae0b0be96a270cb24745412e8` (origin/feat/debug-monitor)
- Head: `642746a6f66a5d45ae78f630d2003d18257de004`

Verification evidence:
- `npm test` → Vitest: **8 files, 117/117 tests passed**

---

## Critical (Must Fix)

### 1) TDD `source-during-red` likely false-positives during legitimate RED→GREEN work
- Files:
  - `extensions/workflow-monitor/tdd-monitor.ts`
  - `extensions/workflow-monitor/warnings.ts`
- Problem:
  - `phase === "red"` is set on *test file write* and remains `"red"` even after tests have been run and failed (`onTestResult(false)` does not change phase).
  - This causes production-code edits while tests are failing (normal “make it pass”) to be flagged as a violation.
  - Warning copy also becomes inaccurate once tests have already been executed.
- Why it matters:
  - High-frequency false positives; discourages normal TDD flow.
- Missing/needed test:
  - Assert that **after tests have been run** (even if failing), editing production code is allowed.
- Design discussion questions:
  - Do we want to model: “test written but not run yet” vs “tests failing” as separate states?
  - Should the rule be: block prod edits only until the first test run after writing a test?

### 2) DebugMonitor likely conflicts with normal TDD
- Files:
  - `extensions/workflow-monitor/workflow-handler.ts`
- Problem:
  - Debug mode activates on any failed test run; in TDD, failed tests are expected (RED).
  - This can emit “fix-without-investigation” during routine TDD.
  - Additionally, debug violations can take precedence and suppress TDD enforcement on writes.
- Why it matters:
  - UX regression + incorrect framing (“fixing” vs “implementing” in TDD).
- Design discussion questions:
  - How should we distinguish “debugging a regression” from “intentional TDD RED”?
  - Should DebugMonitor activate only after some explicit “debug session” signal, or only for failures not caused by new tests?
  - If both monitors are active, what should precedence rules be?

---

## Important (Should Fix)

### 3) Investigation detection misses common non-bash investigation tools
- Files:
  - `extensions/workflow-monitor.ts`
  - `extensions/workflow-monitor/workflow-handler.ts`
- Problem:
  - Investigation is currently recognized via `read` tool and a bash-regex heuristic.
  - Tool calls like `grep`, `find`, `ls` (and similar) may not count as investigation.
- Why it matters:
  - Causes false “fix-without-investigation” warnings even when real investigation occurred.
- Design discussion questions:
  - Which tool calls should count as “investigation signals” by default?
  - Should we centralize a list of investigation tools/commands?

### 4) “Excessive fix attempts” warning count/wording appears off-by-one
- Files:
  - `extensions/workflow-monitor/debug-monitor.ts`
  - `extensions/workflow-monitor/warnings.ts`
- Problem:
  - `fixAttempts` increments on a *fail-after-edit* cycle, but the excessive warning triggers on the *next edit* once `fixAttempts >= 3`.
  - Warning text “This is fix attempt #N” likely reports `#3` when it is effectively attempt `#4`.
- Why it matters:
  - Misleading at the exact moment we want maximum clarity.
- Design discussion questions:
  - Should we display “failed attempts so far” vs “current attempt number”?

---

## Minor (Nice to Have)

### 5) Warning injection overwrites tool-result content array
- File:
  - `extensions/workflow-monitor.ts`
- Problem:
  - Warning injection replaces `result.content` with a single text item; could drop structured or non-text outputs.
- Discussion question:
  - Should we append an additional content item instead of replacing?

### 6) Possible unused handler API
- File:
  - `extensions/workflow-monitor/workflow-handler.ts`
- Problem:
  - `handleBashInvestigation()` appears unused in the entrypoint wiring (tests may call it though).
- Discussion question:
  - Keep for API completeness vs remove to reduce surface area?

---

## Recommendation Summary (for discussion)
1) Refine the TDD state machine: distinguish “test written but not run” from “tests failing”.
2) Define a clear policy for DebugMonitor activation in the presence of TDD.
3) Expand investigation-signal detection to include common tooling beyond `read` + bash regex.
4) Fix attempt-number reporting semantics.
