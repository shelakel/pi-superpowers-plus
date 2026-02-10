# Phase 1 Review Issues

Post-review issues from the TDD enforcement implementation (`feat/tdd-enforcement`).

---

## Important

### 1. ✅ Silent source write in RED phase
- **File:** `extensions/workflow-monitor/tdd-monitor.ts`
- **Issue:** Writing source while in RED phase did nothing — no transition, no warning.
- **Resolution:** Added `source-during-red` violation type. Writing source during RED now triggers a TDD violation warning. (Phase 2, Task 6)

### 2. ✅ Module-level pendingViolation state
- **File:** `extensions/workflow-monitor.ts`
- **Issue:** `pendingViolation` was scoped to module closure with loose type `{ type: string; file: string }`.
- **Resolution:** Now properly typed as `Violation | null` (union of `TddViolation | DebugViolation`). Sequential processing assumption documented in comment. (Phase 2, Task 5)

### 3. ✅ Package root discovery fragility
- **File:** `extensions/workflow-monitor/reference-tool.ts`
- **Issue:** `getPackageRoot()` walked up directories looking for `package.json`.
- **Resolution:** Replaced with `import.meta.url`-based resolution at known depth. Removed `accessSync` import and `getPackageRoot()` function. (Phase 2, Task 7)

### 4. Duplicate regex pattern in heuristics (deferred)
- **File:** `extensions/workflow-monitor/heuristics.ts:3,7`
- **Issue:** `TEST_PATTERNS` has overlapping patterns for test directories.
- **Status:** Low priority, patterns work correctly. Deferred.

---

## Minor

### 5. Generic pass pattern false positives (deferred)
- **File:** `extensions/workflow-monitor/test-runner.ts:22`
- **Issue:** `/\bpassed\b/i` could false-positive on non-test output.
- **Status:** Only evaluated when `parseTestCommand` matched. Low risk. Deferred.

### 6. No state persistence across sessions (deferred)
- **File:** `extensions/workflow-monitor.ts`
- **Issue:** TDD/debug monitors reset on session events.
- **Status:** Acceptable for now. Deferred.

### 7. ✅ Loose type on warning function
- **File:** `extensions/workflow-monitor/warnings.ts`
- **Issue:** `getTddViolationWarning(type: string, ...)` accepted any string.
- **Resolution:** Now uses `TddViolationType` (`"source-before-test" | "source-during-red"`). Added separate `getDebugViolationWarning` with `DebugViolationType`. (Phase 2, Tasks 3 & 6)
