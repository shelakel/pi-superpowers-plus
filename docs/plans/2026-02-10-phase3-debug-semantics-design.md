# Phase 3: Debug Semantics + TDD/Debug Conflict Resolution Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make Workflow Monitor treat TDD “RED verification” as intentional (no debug escalation), and activate DebugMonitor only after 2 consecutive non-TDD failing test runs.

**Architecture:**
- Extend `TddMonitor` with a small piece of state (`redVerificationPending`) to distinguish “test written but not run yet” from “tests have been run (fail) and we’re now in GREEN work”.
- Gate calls into `DebugMonitor` behind a `debugFailStreak` counter in `WorkflowHandler`, excluding the intentional TDD RED verification run.

**Tech Stack:** TypeScript, Vitest, pi extension code in `extensions/workflow-monitor/*`

---

## Prereqs (one-time)

- Ensure dependencies installed: `npm ci`
- Run full suite once to ensure baseline: `npm test`

---

### Task 1: Add failing unit tests for `TddMonitor` RED verification semantics

**Files:**
- Create: `tests/extension/workflow-monitor/tdd-monitor.test.ts`
- Test: `tests/extension/workflow-monitor/tdd-monitor.test.ts`

**Step 1: Write the failing tests**

Create `tests/extension/workflow-monitor/tdd-monitor.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import { TddMonitor } from "../../../extensions/workflow-monitor/tdd-monitor";

describe("TddMonitor (RED verification semantics)", () => {
  let tdd: TddMonitor;

  beforeEach(() => {
    tdd = new TddMonitor();
  });

  test("violates source-during-red when a test was written but tests have not been run yet", () => {
    // Write a new test (enter RED, but RED verification is still pending)
    expect(tdd.onFileWritten("tests/foo.test.ts")).toBeNull();

    // Writing production code before running tests should violate
    const violation = tdd.onFileWritten("extensions/workflow-monitor/foo.ts");
    expect(violation).not.toBeNull();
    expect(violation?.type).toBe("source-during-red");
  });

  test("does NOT violate source-during-red after tests have been run once (even if they fail)", () => {
    // Write a new test (RED verification pending)
    expect(tdd.onFileWritten("tests/foo.test.ts")).toBeNull();

    // Run tests once and see them fail (this satisfies "Verify RED")
    tdd.onTestResult(false);

    // Now we are allowed to write production code (GREEN work)
    const violation = tdd.onFileWritten("extensions/workflow-monitor/foo.ts");
    expect(violation).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/extension/workflow-monitor/tdd-monitor.test.ts
```

Expected: **FAIL** (the second test should fail because current implementation still flags `source-during-red` after a failing test run).

---

### Task 2: Implement `redVerificationPending` in `TddMonitor` to make Task 1 pass

**Files:**
- Modify: `extensions/workflow-monitor/tdd-monitor.ts`
- Test: `tests/extension/workflow-monitor/tdd-monitor.test.ts`

**Step 1: Add state + getter for “Verify RED pending”**

In `extensions/workflow-monitor/tdd-monitor.ts`, add a field and a getter:

```ts
private redVerificationPending = false;

isRedVerificationPending(): boolean {
  return this.phase === "red" && this.redVerificationPending;
}
```

**Step 2: Set `redVerificationPending=true` when a test file is written**

In `onFileWritten(...)`, inside the `isTestFile(path)` branch:

```ts
this.testFilesWritten.add(path);
if (this.phase === "idle") {
  this.phase = "red";
}

// RED means "a test was written"; this tracks whether we've run tests at least once since.
this.redVerificationPending = true;
return null;
```

**Step 3: Enforce `source-during-red` ONLY when `redVerificationPending===true`**

In the `isSourceFile(path)` branch, replace the current `if (this.phase === "red")` check with:

```ts
if (this.phase === "red" && this.redVerificationPending) {
  return { type: "source-during-red", file: path };
}
```

**Step 4: Clear `redVerificationPending` on any test run**

In `onTestResult(passed: boolean)`, at the top:

```ts
// Any test run satisfies the "Verify RED" requirement (pass or fail).
if (this.phase === "red") {
  this.redVerificationPending = false;
}
```

Then keep existing phase transition logic (or minimally adjust it) so no other behavior changes unexpectedly.

**Step 5: Reset `redVerificationPending` on commit**

In `onCommit()`:

```ts
this.phase = "idle";
this.redVerificationPending = false;
this.testFilesWritten.clear();
this.sourceFilesWritten.clear();
```

**Step 6: Include the new field in state helpers (minimal, for consistency)**

Update:
- `setState(...)` to accept an optional `redVerificationPending?: boolean` and set the field.
- `getState()` to return `redVerificationPending`.

Example (keep it minimal):

```ts
setState(
  phase: TddPhase,
  testFiles: string[],
  sourceFiles: string[],
  redVerificationPending = false
): void {
  this.phase = phase;
  this.testFilesWritten = new Set(testFiles);
  this.sourceFilesWritten = new Set(sourceFiles);
  this.redVerificationPending = redVerificationPending;
}

getState(): {
  phase: TddPhase;
  testFiles: string[];
  sourceFiles: string[];
  redVerificationPending: boolean;
} {
  return {
    phase: this.phase,
    testFiles: [...this.testFilesWritten],
    sourceFiles: [...this.sourceFilesWritten],
    redVerificationPending: this.redVerificationPending,
  };
}
```

**Step 7: Run tests to verify they pass**

Run:

```bash
npm test -- tests/extension/workflow-monitor/tdd-monitor.test.ts
```

Expected: **PASS**.

**Step 8: Commit**

```bash
git add extensions/workflow-monitor/tdd-monitor.ts tests/extension/workflow-monitor/tdd-monitor.test.ts
git commit -m "fix(workflow-monitor): only warn source-during-red before first test run"
```

---

### Task 3: Add failing integration tests for `WorkflowHandler` debug activation threshold + TDD exclusion

**Files:**
- Create: `tests/extension/workflow-monitor/workflow-monitor.test.ts`
- Test: `tests/extension/workflow-monitor/workflow-monitor.test.ts`

**Step 1: Write the failing tests**

Create `tests/extension/workflow-monitor/workflow-monitor.test.ts`:

```ts
import { describe, test, expect, beforeEach } from "vitest";
import { createWorkflowHandler } from "../../../extensions/workflow-monitor/workflow-handler";

function failOutput() {
  // parseTestResult(...) treats "FAIL" as a failing run.
  return "FAIL  tests/example.test.ts\n";
}

function passOutput() {
  // parseTestResult(...) treats "passed" as a passing run.
  return "1 passed\n";
}

describe("WorkflowHandler (debug threshold + TDD exclusion)", () => {
  test("does not activate debug on first non-TDD failing test run", () => {
    const handler = createWorkflowHandler();

    handler.handleBashResult("npx vitest run", failOutput(), 1);

    expect(handler.isDebugActive()).toBe(false);
  });

  test("activates debug on second consecutive non-TDD failing test run", () => {
    const handler = createWorkflowHandler();

    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);

    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(true);
  });

  test("resets debug streak and deactivates debug on passing test run", () => {
    const handler = createWorkflowHandler();

    handler.handleBashResult("npx vitest run", failOutput(), 1);
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(true);

    handler.handleBashResult("npx vitest run", passOutput(), 0);
    expect(handler.isDebugActive()).toBe(false);

    // After reset, first failure should NOT activate
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);
  });

  test("resets debug streak on git commit", () => {
    const handler = createWorkflowHandler();

    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);

    handler.handleBashResult("git commit -m \"wip\"", "", 0);

    // After commit reset, another single failure should still not activate
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);
  });

  test("TDD exclusion: first failing run after writing a test does not contribute to debug activation", () => {
    const handler = createWorkflowHandler();

    // Enter TDD RED by writing a test file
    handler.handleToolCall("write", { path: "tests/new-behavior.test.ts" });

    // First failing run after test write is intentional "Verify RED" => excluded
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);

    // Now failures count again; after 1 counted failure, still inactive
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(false);

    // Second counted failure => active
    handler.handleBashResult("npx vitest run", failOutput(), 1);
    expect(handler.isDebugActive()).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/extension/workflow-monitor/workflow-monitor.test.ts
```

Expected: **FAIL** (current handler activates debug on the first failing run, so the first test should fail).

---

### Task 4: Implement debug fail-streak gating + TDD exclusion in `WorkflowHandler`

**Files:**
- Modify: `extensions/workflow-monitor/workflow-handler.ts`
- Modify: `extensions/workflow-monitor/tdd-monitor.ts` (export/getter already added in Task 2)
- Test: `tests/extension/workflow-monitor/workflow-monitor.test.ts`

**Step 1: Add `debugFailStreak` state inside `createWorkflowHandler()`**

At the top of `createWorkflowHandler()` (near `const tdd = ...`):

```ts
let debugFailStreak = 0;
```

**Step 2: Reset streak on commit**

In the `if (/\bgit\s+commit\b/.test(command)) { ... }` block, add:

```ts
debugFailStreak = 0;
```

**Step 3: Update test-run handling to gate `debug.onTestFailed()` behind the streak**

In the `if (parseTestCommand(command)) { ... }` block, replace the current debug handling with logic equivalent to:

```ts
const passed = parseTestResult(output, exitCode);
if (passed !== null) {
  // Capture whether this test run is the intentional "Verify RED" run
  // (i.e., first test run after writing a test).
  const excludeFromDebug =
    !passed && tdd.getPhase() === "red" && tdd.isRedVerificationPending();

  // Always update TDD state first (this should clear redVerificationPending)
  tdd.onTestResult(passed);

  if (passed) {
    debugFailStreak = 0;
    debug.onTestPassed();
  } else {
    if (!excludeFromDebug) {
      debugFailStreak += 1;
      if (debugFailStreak >= 2) {
        debug.onTestFailed();
      }
    }
  }
}
```

Notes:
- This intentionally leaves `DebugMonitor` unchanged; we simply decide when to feed it failures.
- The `excludeFromDebug` check MUST be computed **before** calling `tdd.onTestResult(...)` (because `onTestResult` will clear the pending flag).

**Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- tests/extension/workflow-monitor/workflow-monitor.test.ts
```

Expected: **PASS**.

**Step 5: Run full suite**

Run:

```bash
npm test
```

Expected: **PASS**.

**Step 6: Commit**

```bash
git add extensions/workflow-monitor/workflow-handler.ts tests/extension/workflow-monitor/workflow-monitor.test.ts
git commit -m "feat(workflow-monitor): activate debug only after 2 non-TDD failing runs"
```

---

### Task 5: (Optional) Add warning-message tests for fix-attempt wording

**Files:**
- Create (optional): `tests/extension/workflow-monitor/warnings.test.ts`
- Modify (optional): `extensions/workflow-monitor/warnings.ts`

If you decide to adjust wording (e.g., “failed fix attempts so far” vs “fix attempt #N”), add a small test file that snapshot/asserts the string contains the intended wording.

---

## Appendix: Phase 3 Design (full reference)

Date: 2026-02-10

### Context
Phase 2 shipped a DebugMonitor that activates on test failure and emits:
- `fix-without-investigation`
- `excessive-fix-attempts`

Code review found likely UX/semantics conflicts:
- TDD “RED” is being treated as “tests failing” rather than “test written but not yet run”. This can create false-positive `source-during-red` warnings.
- DebugMonitor activates on any failing test run and takes precedence over TDD enforcement, which can cause routine TDD RED/GREEN work to be framed as “debugging without investigation”.

This phase defines policies and tests to align runtime behavior with the intent of:
- `skills/test-driven-development/SKILL.md`
- `skills/systematic-debugging/SKILL.md`

### Decisions (confirmed)
1) **Debug activation threshold:** Debug mode activates only after **N=2 consecutive failing test runs**.
2) **Exclude intentional TDD RED:** Failing test runs that occur during **TDD RED** (intentional “write a test, watch it fail”) **must not contribute** to debug activation.

### Goals
- Make TDD enforcement match the skill’s meaning of “Verify RED”.
- Reduce debug false positives during normal TDD.
- Provide deterministic tests that encode these policies.

### Non-goals
- Persistent state across sessions.
- Perfect detection of “unexpected vs expected” failures beyond the rules below.

---

### Policy: What does “RED” mean for `source-during-red`?
The TDD skill defines RED as:
- Write a failing test
- **Verify RED**: run tests and watch the new test fail (mandatory)

Therefore, the enforcement rule should be:

> **`source-during-red` should only trigger when production code is written after a test has been written but before tests have been run at least once since that test write.**

In other words: the violation is “skipped Verify RED”, not “edited production code while tests are failing”.

#### Implication for state
The existing `TddMonitor.phase === "red"` is insufficient because it conflates:
- `red_pending_run` (test written, tests not run yet)
- `red_after_run_failed` (test run happened and failed; now we’re in GREEN work)

We should represent this explicitly.

#### Proposed `TddMonitor` state extension
Add a boolean (or small enum) to capture “Verify RED satisfied”:

- `redVerificationPending: boolean`
  - Set to `true` when a test file is written (entering/remaining in RED)
  - Set to `false` when a test run occurs (either pass or fail)

Then:
- If `redVerificationPending === true` and production source is written ⇒ `source-during-red`
- If `redVerificationPending === false` and production source is written ⇒ allowed (normal GREEN work)

Note: we can keep the public `phase` values as-is (`idle|red|green|refactor`) for the widget; the extra flag controls enforcement.

---

### Policy: When does DebugMonitor activate?
#### Debug streak definition
Maintain `debugFailStreak` (number) in the handler (or in DebugMonitor wrapper):
- Increment when a parsed test run fails **and we are not in intentional TDD RED**.
- Reset to 0 on a passing test run.
- Reset to 0 on `git commit`.

DebugMonitor `active` becomes true only when:
- `debugFailStreak >= 2`

#### Excluding intentional TDD RED
If TDD phase is `red` *and* we are in the “intentional RED verification” flow, we treat failures as expected.

Practical rule:
- If `tdd.getPhase() === "red"` **and** the failure is the first run after writing a test (i.e., `redVerificationPending` was true before this test run), then:
  - do not increment `debugFailStreak`
  - do not call `debug.onTestFailed()`

Rationale:
- This matches the TDD skill: failure is evidence that the test is meaningful.

#### Precedence between debug and TDD on writes
Once debug is active (after the threshold), debug violations may take precedence.
However, when debug is not active, TDD write-order enforcement should apply normally.

---

### Investigation signal semantics (open-but-recommended)
Systematic debugging Phase 1 includes evidence gathering beyond file reads.
Recommended to count these as investigation signals:
- `read` tool
- bash commands detected by `isInvestigationCommand(...)` (already includes `grep`, `git diff`, etc.)
- optionally: tool calls if separate tools exist for `grep/find/ls`

(Exact list can be confirmed in design discussion; tests should follow the chosen list.)

---

### Test Plan (must be added before implementation changes)

#### Unit tests: `TddMonitor`
File: `tests/extension/workflow-monitor/tdd-monitor.test.ts`
Add tests:
1. **Violates** when test written → production written before any test run
2. **Does not violate** when test written → test run executed (fails) → production written

#### Integration tests: `WorkflowHandler`
File: `tests/extension/workflow-monitor/workflow-monitor.test.ts`
Add tests for debug activation:
3. Does not activate debug on first non-TDD failure
4. Activates debug on second consecutive non-TDD failure
5. Resets streak on pass
6. Resets streak on commit
7. **TDD exclusion:** write a test (TDD red) → run tests and fail → ensure debug remains inactive and streak not incremented

#### Warning message tests (optional but recommended)
File: `tests/extension/workflow-monitor/warnings.test.ts`
- Ensure attempt numbers are not misleading (decide whether to display “failed attempts so far” vs “current attempt number”).

---

### Implementation Outline (high level)
1) Extend `TddMonitor` with `redVerificationPending` (or equivalent), updated on test write and test run.
2) Update `TddMonitor.onFileWritten(...)` to enforce `source-during-red` based on `redVerificationPending`.
3) Add `debugFailStreak` to `WorkflowHandler`:
   - update on parsed test runs
   - apply TDD exclusion
   - activate debug only when streak >= 2
4) Adjust write-precedence logic so debug only suppresses TDD enforcement when debug is actually active.

---

### Acceptance Criteria
- New tests described above exist and pass.
- Normal TDD flow (write test → run fail → write prod code) does not produce debug or TDD false positives.
- DebugMonitor still triggers for genuine thrashing: repeated failures outside intentional TDD RED activate debug after 2 failing runs.
