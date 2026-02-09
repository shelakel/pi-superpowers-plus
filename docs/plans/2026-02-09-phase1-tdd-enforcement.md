# Phase 1: TDD Enforcement Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Ship the TDD monitor — lean TDD skill, workflow-monitor extension (tdd-monitor + heuristics + widget), and workflow_reference tool — without touching any other skill.

**Architecture:** A single extension entry point (`extensions/workflow-monitor.ts`) wires up modular monitors. Phase 1 only activates the TDD monitor. The monitor observes `tool_call` and `tool_result` events to track RED→GREEN→REFACTOR state, injects warnings on violations, and shows phase in a TUI widget. A `workflow_reference` tool serves extracted reference content on demand.

**Tech Stack:** TypeScript, pi extension API (ExtensionAPI, tool_call/tool_result hooks, setWidget, registerTool), Vitest for tests.

**Existing reference:** `extensions/plan-tracker.ts` — proven pattern for tool registration, state reconstruction, widget rendering, and custom renderCall/renderResult.

---

## Task 1: File Classification Heuristics

**Files:**
- Create: `extensions/workflow-monitor/heuristics.ts`
- Test: `tests/extension/workflow-monitor/heuristics.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/extension/workflow-monitor/heuristics.test.ts
import { describe, test, expect } from "vitest";
import { isTestFile, isSourceFile } from "../../../extensions/workflow-monitor/heuristics";

describe("isTestFile", () => {
  test("matches .test.ts files", () => {
    expect(isTestFile("src/utils.test.ts")).toBe(true);
  });
  test("matches .spec.ts files", () => {
    expect(isTestFile("src/utils.spec.ts")).toBe(true);
  });
  test("matches .test.js files", () => {
    expect(isTestFile("src/utils.test.js")).toBe(true);
  });
  test("matches files in __tests__/ directory", () => {
    expect(isTestFile("src/__tests__/utils.ts")).toBe(true);
  });
  test("matches files in tests/ directory", () => {
    expect(isTestFile("tests/utils.ts")).toBe(true);
  });
  test("matches files in test/ directory", () => {
    expect(isTestFile("test/utils.ts")).toBe(true);
  });
  test("matches python test files (test_*.py)", () => {
    expect(isTestFile("test_utils.py")).toBe(true);
  });
  test("matches python test files (*_test.py)", () => {
    expect(isTestFile("utils_test.py")).toBe(true);
  });
  test("does not match regular source files", () => {
    expect(isTestFile("src/utils.ts")).toBe(false);
  });
  test("does not match config files", () => {
    expect(isTestFile("vitest.config.ts")).toBe(false);
  });
  test("does not match setup.py", () => {
    expect(isTestFile("setup.py")).toBe(false);
  });
});

describe("isSourceFile", () => {
  test("matches .ts files", () => {
    expect(isSourceFile("src/utils.ts")).toBe(true);
  });
  test("matches .py files", () => {
    expect(isSourceFile("src/main.py")).toBe(true);
  });
  test("matches .go files", () => {
    expect(isSourceFile("cmd/server.go")).toBe(true);
  });
  test("does not match test files", () => {
    expect(isSourceFile("src/utils.test.ts")).toBe(false);
  });
  test("does not match config files", () => {
    expect(isSourceFile("vitest.config.ts")).toBe(false);
  });
  test("does not match markdown", () => {
    expect(isSourceFile("README.md")).toBe(false);
  });
  test("does not match json", () => {
    expect(isSourceFile("package.json")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/heuristics.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// extensions/workflow-monitor/heuristics.ts

const TEST_PATTERNS = [
  /\.(test|spec)\.(ts|js|tsx|jsx|py|rs|go|java|rb|swift|kt)$/,
  /^tests?\//,
  /\/__tests__\//,
  /\/tests?\//,
  /^test_\w+\.py$/,
  /\/test_\w+\.py$/,
  /\w+_test\.py$/,
  /\w+_test\.go$/,
];

const SOURCE_EXTENSIONS = /\.(ts|js|tsx|jsx|py|rs|go|java|rb|swift|kt)$/;

const CONFIG_PATTERNS = [
  /\.config\.(ts|js|mjs|cjs)$/,
  /^\./, // dotfiles
  /package\.json$/,
  /tsconfig.*\.json$/,
];

export function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(path));
}

export function isSourceFile(path: string): boolean {
  if (!SOURCE_EXTENSIONS.test(path)) return false;
  if (isTestFile(path)) return false;
  if (CONFIG_PATTERNS.some((p) => p.test(path))) return false;
  return true;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/heuristics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/heuristics.ts tests/extension/workflow-monitor/heuristics.test.ts
git commit -m "feat: add file classification heuristics (test vs source)"
```

---

## Task 2: TDD Monitor State Machine

**Files:**
- Create: `extensions/workflow-monitor/tdd-monitor.ts`
- Test: `tests/extension/workflow-monitor/tdd-monitor.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/extension/workflow-monitor/tdd-monitor.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import { TddMonitor, type TddPhase } from "../../../extensions/workflow-monitor/tdd-monitor";

describe("TddMonitor", () => {
  let monitor: TddMonitor;

  beforeEach(() => {
    monitor = new TddMonitor();
  });

  test("starts in idle phase", () => {
    expect(monitor.getPhase()).toBe("idle");
  });

  test("transitions to red when test file is written", () => {
    monitor.onFileWritten("src/utils.test.ts");
    expect(monitor.getPhase()).toBe("red");
  });

  test("stays idle when source file is written (no test context)", () => {
    // Source write without any test context = not in TDD mode, stays idle
    // but should record a violation
    monitor.onFileWritten("src/utils.ts");
    expect(monitor.getPhase()).toBe("idle");
  });

  test("records violation when source written without prior test", () => {
    const violation = monitor.onFileWritten("src/utils.ts");
    expect(violation).not.toBeNull();
    expect(violation?.type).toBe("source-before-test");
  });

  test("no violation when test file written", () => {
    const violation = monitor.onFileWritten("src/utils.test.ts");
    expect(violation).toBeNull();
  });

  test("no violation when source written after test", () => {
    monitor.onFileWritten("src/utils.test.ts");
    const violation = monitor.onFileWritten("src/utils.ts");
    expect(violation).toBeNull();
  });

  test("transitions to green when tests pass after red", () => {
    monitor.onFileWritten("src/utils.test.ts");
    expect(monitor.getPhase()).toBe("red");
    monitor.onTestResult(true);
    expect(monitor.getPhase()).toBe("green");
  });

  test("stays red when tests fail", () => {
    monitor.onFileWritten("src/utils.test.ts");
    monitor.onTestResult(false);
    expect(monitor.getPhase()).toBe("red");
  });

  test("transitions to refactor after green + source edit", () => {
    monitor.onFileWritten("src/utils.test.ts");
    monitor.onTestResult(true);
    expect(monitor.getPhase()).toBe("green");
    monitor.onFileWritten("src/utils.ts");
    expect(monitor.getPhase()).toBe("refactor");
  });

  test("resets cycle on commit", () => {
    monitor.onFileWritten("src/utils.test.ts");
    monitor.onTestResult(true);
    monitor.onCommit();
    expect(monitor.getPhase()).toBe("idle");
  });

  test("resets tracked files on commit", () => {
    monitor.onFileWritten("src/utils.test.ts");
    monitor.onCommit();
    // After commit, writing source should be a violation again
    const violation = monitor.onFileWritten("src/utils.ts");
    expect(violation).not.toBeNull();
  });

  test("ignores non-source non-test files", () => {
    const violation = monitor.onFileWritten("README.md");
    expect(violation).toBeNull();
    expect(monitor.getPhase()).toBe("idle");
  });

  test("ignores config files", () => {
    const violation = monitor.onFileWritten("vitest.config.ts");
    expect(violation).toBeNull();
    expect(monitor.getPhase()).toBe("idle");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/tdd-monitor.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// extensions/workflow-monitor/tdd-monitor.ts
import { isTestFile, isSourceFile } from "./heuristics";

export type TddPhase = "idle" | "red" | "green" | "refactor";

export interface TddViolation {
  type: "source-before-test";
  file: string;
}

export class TddMonitor {
  private phase: TddPhase = "idle";
  private testFilesWritten = new Set<string>();
  private sourceFilesWritten = new Set<string>();

  getPhase(): TddPhase {
    return this.phase;
  }

  onFileWritten(path: string): TddViolation | null {
    if (isTestFile(path)) {
      this.testFilesWritten.add(path);
      if (this.phase === "idle") {
        this.phase = "red";
      }
      return null;
    }

    if (isSourceFile(path)) {
      this.sourceFilesWritten.add(path);

      if (this.testFilesWritten.size === 0) {
        // Source written without any test in this cycle
        return { type: "source-before-test", file: path };
      }

      if (this.phase === "green") {
        this.phase = "refactor";
      }
      return null;
    }

    // Not a test or source file — ignore
    return null;
  }

  onTestResult(passed: boolean): void {
    if (passed && (this.phase === "red" || this.phase === "refactor")) {
      this.phase = "green";
    }
    // Failed tests: stay in current phase (red stays red)
  }

  onCommit(): void {
    this.phase = "idle";
    this.testFilesWritten.clear();
    this.sourceFilesWritten.clear();
  }

  /** Reconstruct state — used on session restore */
  setState(phase: TddPhase, testFiles: string[], sourceFiles: string[]): void {
    this.phase = phase;
    this.testFilesWritten = new Set(testFiles);
    this.sourceFilesWritten = new Set(sourceFiles);
  }

  getState(): { phase: TddPhase; testFiles: string[]; sourceFiles: string[] } {
    return {
      phase: this.phase,
      testFiles: [...this.testFilesWritten],
      sourceFiles: [...this.sourceFilesWritten],
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/tdd-monitor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/tdd-monitor.ts tests/extension/workflow-monitor/tdd-monitor.test.ts
git commit -m "feat: add TDD monitor state machine"
```

---

## Task 3: Test Runner Detection

**Files:**
- Create: `extensions/workflow-monitor/test-runner.ts`
- Test: `tests/extension/workflow-monitor/test-runner.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/extension/workflow-monitor/test-runner.test.ts
import { describe, test, expect } from "vitest";
import { parseTestCommand, parseTestResult } from "../../../extensions/workflow-monitor/test-runner";

describe("parseTestCommand", () => {
  test("detects npm test", () => {
    expect(parseTestCommand("npm test")).toBe(true);
  });
  test("detects npx vitest", () => {
    expect(parseTestCommand("npx vitest run src/")).toBe(true);
  });
  test("detects pytest", () => {
    expect(parseTestCommand("pytest tests/")).toBe(true);
  });
  test("detects go test", () => {
    expect(parseTestCommand("go test ./...")).toBe(true);
  });
  test("detects cargo test", () => {
    expect(parseTestCommand("cargo test")).toBe(true);
  });
  test("detects jest", () => {
    expect(parseTestCommand("npx jest src/utils.test.ts")).toBe(true);
  });
  test("does not match ls", () => {
    expect(parseTestCommand("ls -la")).toBe(false);
  });
  test("does not match git commands", () => {
    expect(parseTestCommand("git status")).toBe(false);
  });
  test("does not match npm install", () => {
    expect(parseTestCommand("npm install")).toBe(false);
  });
});

describe("parseTestResult", () => {
  test("detects vitest pass", () => {
    expect(parseTestResult("Tests  1 passed", 0)).toBe(true);
  });
  test("detects vitest fail", () => {
    expect(parseTestResult("Tests  1 failed", 1)).toBe(false);
  });
  test("detects pytest pass", () => {
    expect(parseTestResult("1 passed in 0.5s", 0)).toBe(true);
  });
  test("detects pytest fail", () => {
    expect(parseTestResult("1 failed, 0 passed", 1)).toBe(false);
  });
  test("detects jest pass", () => {
    expect(parseTestResult("Tests:  1 passed, 1 total", 0)).toBe(true);
  });
  test("detects go test pass", () => {
    expect(parseTestResult("ok  \tgithub.com/user/pkg\t0.5s", 0)).toBe(true);
  });
  test("detects go test fail via FAIL prefix", () => {
    expect(parseTestResult("FAIL\tgithub.com/user/pkg", 1)).toBe(false);
  });
  test("uses exit code as fallback", () => {
    expect(parseTestResult("some unknown output", 0)).toBe(true);
    expect(parseTestResult("some unknown output", 1)).toBe(false);
  });
  test("returns null for ambiguous output with no exit code", () => {
    expect(parseTestResult("some unknown output", undefined)).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/test-runner.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// extensions/workflow-monitor/test-runner.ts

const TEST_COMMANDS = [
  /\bnpm\s+test\b/,
  /\bnpx\s+(vitest|jest)\b/,
  /\bpytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
  /\bjest\b/,
  /\bvitest\b/,
  /\bmocha\b/,
  /\brspec\b/,
  /\bphpunit\b/,
  /\bdotnet\s+test\b/,
];

const PASS_PATTERNS = [
  /\bpassed\b/i,
  /^ok\s+/m,
  /Tests:\s+\d+ passed/,
  /\d+ passing/,
  /BUILD SUCCESSFUL/,
];

const FAIL_PATTERNS = [
  /\bfailed\b/i,
  /^FAIL\b/m,
  /\d+ failing/,
  /BUILD FAILED/,
  /ERRORS!/,
];

export function parseTestCommand(command: string): boolean {
  return TEST_COMMANDS.some((p) => p.test(command));
}

/**
 * Parse test output to determine pass/fail.
 * Returns true (pass), false (fail), or null (unknown).
 */
export function parseTestResult(
  output: string,
  exitCode: number | undefined
): boolean | null {
  const hasFail = FAIL_PATTERNS.some((p) => p.test(output));
  const hasPass = PASS_PATTERNS.some((p) => p.test(output));

  if (hasFail && !hasPass) return false;
  if (hasPass && !hasFail) return true;
  // Both or neither — use exit code as tiebreaker
  if (exitCode !== undefined) return exitCode === 0;
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/test-runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/test-runner.ts tests/extension/workflow-monitor/test-runner.test.ts
git commit -m "feat: add test runner command/result detection"
```

---

## Task 4: TDD Violation Warning Content

**Files:**
- Create: `extensions/workflow-monitor/warnings.ts`
- Test: `tests/extension/workflow-monitor/warnings.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/extension/workflow-monitor/warnings.test.ts
import { describe, test, expect } from "vitest";
import { getTddViolationWarning } from "../../../extensions/workflow-monitor/warnings";

describe("getTddViolationWarning", () => {
  test("returns warning for source-before-test violation", () => {
    const warning = getTddViolationWarning("source-before-test", "src/utils.ts");
    expect(warning).toContain("TDD VIOLATION");
    expect(warning).toContain("src/utils.ts");
    expect(warning).toContain("Delete");
    expect(warning).toContain("failing test");
  });

  test("includes anti-rationalization content", () => {
    const warning = getTddViolationWarning("source-before-test", "src/utils.ts");
    expect(warning).toContain("Too simple to test");
    expect(warning).toContain("I'll test after");
  });

  test("warning is concise (under 15 lines)", () => {
    const warning = getTddViolationWarning("source-before-test", "src/utils.ts");
    const lines = warning.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(15);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/warnings.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// extensions/workflow-monitor/warnings.ts

export function getTddViolationWarning(type: string, file: string): string {
  if (type === "source-before-test") {
    return `
⚠️ TDD VIOLATION: You wrote production code (${file}) without a failing test first.

The Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

Delete this code. Write the failing test first. Then implement.

Common rationalizations (all wrong):
- "Too simple to test" → Simple code breaks. Test takes 30 seconds.
- "I'll test after" → Tests written after pass immediately. Proves nothing.
- "Need to explore first" → Fine. Throw away exploration, start with TDD.
- "Deleting this work is wasteful" → Sunk cost fallacy. Keeping unverified code is debt.

Delete the production code. Write the test. Watch it fail. Then implement.
`.trim();
  }

  return `⚠️ TDD WARNING: Unexpected violation type "${type}" for ${file}`;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/warnings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/warnings.ts tests/extension/workflow-monitor/warnings.test.ts
git commit -m "feat: add TDD violation warning content"
```

---

## Task 5: Extract TDD Reference Content

**Files:**
- Create: `skills/test-driven-development/reference/rationalizations.md`
- Create: `skills/test-driven-development/reference/examples.md`
- Create: `skills/test-driven-development/reference/when-stuck.md`

These are extracted from the current SKILL.md. No code changes — content extraction only.

**Step 1: Create rationalizations.md**

Extract the "Common Rationalizations" table, "Why Order Matters" arguments, and "Red Flags" list from SKILL.md.

```markdown
# TDD Rationalizations Reference

**Load via:** `workflow_reference({ topic: "tdd-rationalizations" })`

## Why Order Matters

**"I'll write tests after to verify it works"**
Tests written after code pass immediately. Passing immediately proves nothing:
- Might test wrong thing
- Might test implementation, not behavior
- Might miss edge cases you forgot
- You never saw it catch the bug

Test-first forces you to see the test fail, proving it actually tests something.

**"I already manually tested all the edge cases"**
Manual testing is ad-hoc. You think you tested everything but:
- No record of what you tested
- Can't re-run when code changes
- Easy to forget cases under pressure
- "It worked when I tried it" ≠ comprehensive

**"Deleting X hours of work is wasteful"**
Sunk cost fallacy. The time is already gone. Your choice:
- Delete and rewrite with TDD (X more hours, high confidence)
- Keep it and add tests after (30 min, low confidence, likely bugs)

**"TDD is dogmatic, being pragmatic means adapting"**
TDD IS pragmatic. "Pragmatic" shortcuts = debugging in production = slower.

**"Tests after achieve the same goals - it's spirit not ritual"**
Tests-after answer "What does this do?" Tests-first answer "What should this do?"
Tests-after are biased by your implementation. 30 minutes of tests after ≠ TDD.

## Common Rationalizations Table

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code is technical debt. |
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "Test hard = design unclear" | Listen to test. Hard to test = hard to use. |
| "TDD will slow me down" | TDD faster than debugging. Pragmatic = test-first. |
| "Manual test faster" | Manual doesn't prove edge cases. You'll re-test every change. |
| "Existing code has no tests" | You're improving it. Add tests for existing code. |

## Red Flags — STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "It's about spirit not ritual"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
```

**Step 2: Create examples.md**

Extract good/bad code examples and the bug fix walkthrough.

```markdown
# TDD Examples Reference

**Load via:** `workflow_reference({ topic: "tdd-examples" })`

## Good vs Bad Tests

### RED — Write Failing Test

<Good>
```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };
  const result = await retryOperation(operation);
  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```
Clear name, tests real behavior, one thing
</Good>

<Bad>
```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```
Vague name, tests mock not code
</Bad>

### GREEN — Minimal Code

<Good>
```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try { return await fn(); }
    catch (e) { if (i === 2) throw e; }
  }
  throw new Error('unreachable');
}
```
Just enough to pass
</Good>

<Bad>
```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; backoff?: 'linear' | 'exponential'; onRetry?: (attempt: number) => void }
): Promise<T> { /* YAGNI */ }
```
Over-engineered
</Bad>

## Good Tests Table

| Quality | Good | Bad |
|---------|------|-----|
| **Minimal** | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear** | Name describes behavior | `test('test1')` |
| **Shows intent** | Demonstrates desired API | Obscures what code should do |

## Bug Fix Example

**Bug:** Empty email accepted

**RED**
```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED**
```bash
$ npm test
FAIL: expected 'Email required', got undefined
```

**GREEN**
```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) return { error: 'Email required' };
  // ...
}
```

**Verify GREEN** → PASS

**REFACTOR** — Extract validation for multiple fields if needed.
```

**Step 3: Create when-stuck.md**

```markdown
# TDD When Stuck Reference

**Load via:** `workflow_reference({ topic: "tdd-when-stuck" })`

## When Stuck

| Problem | Solution |
|---------|----------|
| Don't know how to test | Write wished-for API. Write assertion first. Ask your human partner. |
| Test too complicated | Design too complicated. Simplify interface. |
| Must mock everything | Code too coupled. Use dependency injection. |
| Test setup huge | Extract helpers. Still complex? Simplify design. |

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

Can't check all boxes? You skipped TDD. Start over.

## Debugging Integration

Bug found? Write failing test reproducing it. Follow TDD cycle. Test proves fix and prevents regression.

Never fix bugs without a test.
```

**Step 4: Commit**

```bash
git add skills/test-driven-development/reference/
git commit -m "feat: extract TDD reference content (rationalizations, examples, when-stuck)"
```

---

## Task 6: Reference Tool

**Files:**
- Create: `extensions/workflow-monitor/reference-tool.ts`
- Test: `tests/extension/workflow-monitor/reference-tool.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/extension/workflow-monitor/reference-tool.test.ts
import { describe, test, expect } from "vitest";
import { loadReference, REFERENCE_TOPICS } from "../../../extensions/workflow-monitor/reference-tool";

describe("REFERENCE_TOPICS", () => {
  test("includes tdd topics", () => {
    expect(REFERENCE_TOPICS).toContain("tdd-rationalizations");
    expect(REFERENCE_TOPICS).toContain("tdd-examples");
    expect(REFERENCE_TOPICS).toContain("tdd-when-stuck");
    expect(REFERENCE_TOPICS).toContain("tdd-anti-patterns");
  });
});

describe("loadReference", () => {
  test("loads tdd-rationalizations", async () => {
    const content = await loadReference("tdd-rationalizations");
    expect(content).toContain("Rationalizations");
    expect(content).toContain("Too simple to test");
  });

  test("loads tdd-anti-patterns (existing file)", async () => {
    const content = await loadReference("tdd-anti-patterns");
    expect(content).toContain("Anti-Pattern");
  });

  test("loads tdd-examples", async () => {
    const content = await loadReference("tdd-examples");
    expect(content).toContain("retryOperation");
  });

  test("loads tdd-when-stuck", async () => {
    const content = await loadReference("tdd-when-stuck");
    expect(content).toContain("When Stuck");
  });

  test("returns error for unknown topic", async () => {
    const content = await loadReference("nonexistent-topic");
    expect(content).toContain("Unknown topic");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/reference-tool.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// extensions/workflow-monitor/reference-tool.ts
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Topics → relative file paths (from repo root)
const TOPIC_MAP: Record<string, string> = {
  "tdd-rationalizations": "skills/test-driven-development/reference/rationalizations.md",
  "tdd-examples": "skills/test-driven-development/reference/examples.md",
  "tdd-when-stuck": "skills/test-driven-development/reference/when-stuck.md",
  "tdd-anti-patterns": "skills/test-driven-development/testing-anti-patterns.md",
};

export const REFERENCE_TOPICS = Object.keys(TOPIC_MAP);

/**
 * Resolve paths relative to the package root.
 * Works whether called from extensions/ or tests/.
 */
function getPackageRoot(): string {
  // Walk up from this file to find package.json
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== "/") {
    try {
      const pkg = resolve(dir, "package.json");
      // Sync check isn't ideal but this runs once
      require("node:fs").accessSync(pkg);
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  // Fallback: assume extensions/workflow-monitor/ → go up 2
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export async function loadReference(topic: string): Promise<string> {
  const relativePath = TOPIC_MAP[topic];
  if (!relativePath) {
    return `Unknown topic: "${topic}". Available topics: ${REFERENCE_TOPICS.join(", ")}`;
  }

  const root = getPackageRoot();
  const fullPath = resolve(root, relativePath);

  try {
    return await readFile(fullPath, "utf-8");
  } catch (err) {
    return `Error loading reference "${topic}": file not found at ${fullPath}`;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/reference-tool.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/reference-tool.ts tests/extension/workflow-monitor/reference-tool.test.ts
git commit -m "feat: add reference tool with TDD topic loading"
```

---

## Task 7: Lean TDD Skill

**Files:**
- Modify: `skills/test-driven-development/SKILL.md`

This is a content rewrite, not code. The lean skill keeps:
- Iron law, RED-GREEN-REFACTOR process, key rules
- Core "why order matters" argument (condensed)
- Cross-references
- One line noting the enforcement extension + reference tool

It removes: full code examples, rationalization table, red flags list, when-stuck table, bug fix walkthrough, verification checklist — all now served by `workflow_reference` tool.

**Step 1: Write the lean SKILL.md**

```markdown
---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

> **Related skills:** Before claiming done, use `/skill:verification-before-completion` to verify tests actually pass.

# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

**Violating the letter of the rules is violating the spirit of the rules.**

**Active enforcement:** The workflow monitor extension tracks your TDD phase (RED→GREEN→REFACTOR) and will warn if you write production code without a failing test. Use `workflow_reference` to look up rationalizations, examples, and anti-patterns on demand.

## When to Use

**Always:** New features, bug fixes, refactoring, behavior changes.

**Exceptions (ask your human partner):** Throwaway prototypes, generated code, configuration files.

Thinking "skip TDD just this once"? Stop. That's rationalization.

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over.
- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Delete means delete. Implement fresh from tests.

## Red-Green-Refactor

### RED — Write Failing Test

Write one minimal test showing what should happen.

**Requirements:**
- One behavior per test
- Clear name describing behavior
- Real code (no mocks unless unavoidable)

### Verify RED — Watch It Fail

**MANDATORY. Never skip.**

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

Test passes? You're testing existing behavior. Fix test.

### GREEN — Minimal Code

Write simplest code to pass the test. Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN — Watch It Pass

**MANDATORY.**

Confirm: test passes, other tests still pass, output pristine.

Test fails? Fix code, not test. Other tests fail? Fix now.

### REFACTOR — Clean Up

After green only: remove duplication, improve names, extract helpers. Keep tests green. Don't add behavior.

### Repeat

Next failing test for next feature.

## Why Order Matters

Tests written after code pass immediately — proving nothing. You might test the wrong thing, test implementation not behavior, or miss edge cases.

Test-first forces you to see the test fail, proving it actually tests something.

"Deleting X hours of work is wasteful" is sunk cost fallacy. "TDD is dogmatic" is wrong — TDD IS pragmatic. "Tests after achieve the same goals" — no: tests-after answer "what does this do?" not "what should this do?"

For the full rationalization table and rebuttals, use `workflow_reference({ topic: "tdd-rationalizations" })`.

## Debugging Integration

Bug found? Write failing test reproducing it. Follow TDD cycle. Never fix bugs without a test.

## Reference

Use `workflow_reference` for detailed guidance:
- `tdd-rationalizations` — Full rationalization table with rebuttals
- `tdd-examples` — Good/bad code examples, bug fix walkthrough
- `tdd-when-stuck` — Solutions for common blockers, verification checklist
- `tdd-anti-patterns` — Mock pitfalls, test-only methods, incomplete mocks

## Final Rule

```
Production code → test exists and failed first
Otherwise → not TDD
```

No exceptions without your human partner's permission.
```

**Step 2: Verify line count**

The lean skill should be ~130 lines (down from 373). Count and confirm.

**Step 3: Commit**

```bash
git add skills/test-driven-development/SKILL.md
git commit -m "feat: lean TDD skill (373 → ~130 lines, reference content extracted)"
```

---

## Task 8: Workflow Monitor Extension (Wiring + Widget)

**Files:**
- Create: `extensions/workflow-monitor.ts`
- Test: `tests/extension/workflow-monitor/workflow-monitor.test.ts`

This is the main extension entry point. It wires up:
- TDD monitor (observing tool_call and tool_result events)
- TUI widget showing current phase
- workflow_reference tool registration
- State reconstruction on session events

**Step 1: Write the failing tests**

Test the event wiring logic in isolation — extract a `handleToolCall` and `handleToolResult` function that can be unit tested without mocking the full pi extension API.

```typescript
// tests/extension/workflow-monitor/workflow-monitor.test.ts
import { describe, test, expect, beforeEach } from "vitest";
import {
  createWorkflowHandler,
  type WorkflowHandler,
} from "../../../extensions/workflow-monitor/workflow-handler";

describe("WorkflowHandler", () => {
  let handler: WorkflowHandler;

  beforeEach(() => {
    handler = createWorkflowHandler();
  });

  test("detects write to source file as TDD violation", () => {
    const result = handler.handleToolCall("write", { path: "src/utils.ts", content: "code" });
    expect(result.violation).not.toBeNull();
    expect(result.violation?.type).toBe("source-before-test");
  });

  test("detects edit to source file as TDD violation", () => {
    const result = handler.handleToolCall("edit", {
      path: "src/utils.ts",
      oldText: "old",
      newText: "new",
    });
    expect(result.violation).not.toBeNull();
  });

  test("no violation for test file write", () => {
    const result = handler.handleToolCall("write", {
      path: "src/utils.test.ts",
      content: "test",
    });
    expect(result.violation).toBeNull();
  });

  test("no violation for non-write tools", () => {
    const result = handler.handleToolCall("read", { path: "src/utils.ts" });
    expect(result.violation).toBeNull();
  });

  test("handles bash test command result", () => {
    // Set up TDD cycle first
    handler.handleToolCall("write", { path: "src/utils.test.ts", content: "test" });
    expect(handler.getTddPhase()).toBe("red");

    handler.handleBashResult("npx vitest run", "Tests  1 passed", 0);
    expect(handler.getTddPhase()).toBe("green");
  });

  test("handles bash git commit", () => {
    handler.handleToolCall("write", { path: "src/utils.test.ts", content: "test" });
    handler.handleBashResult("git commit -m 'feat: add utils'", "", 0);
    expect(handler.getTddPhase()).toBe("idle");
  });

  test("getWidgetText returns phase when active", () => {
    handler.handleToolCall("write", { path: "src/utils.test.ts", content: "test" });
    expect(handler.getWidgetText()).toContain("RED");
  });

  test("getWidgetText returns empty when idle", () => {
    expect(handler.getWidgetText()).toBe("");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-monitor.test.ts`
Expected: FAIL — module not found

**Step 3: Create workflow-handler.ts (testable core logic)**

```typescript
// extensions/workflow-monitor/workflow-handler.ts
import { TddMonitor, type TddViolation } from "./tdd-monitor";
import { parseTestCommand, parseTestResult } from "./test-runner";

export interface ToolCallResult {
  violation: TddViolation | null;
}

export interface WorkflowHandler {
  handleToolCall(toolName: string, input: Record<string, any>): ToolCallResult;
  handleBashResult(command: string, output: string, exitCode: number | undefined): void;
  getTddPhase(): string;
  getWidgetText(): string;
  getTddState(): ReturnType<TddMonitor["getState"]>;
  restoreTddState(phase: any, testFiles: string[], sourceFiles: string[]): void;
}

export function createWorkflowHandler(): WorkflowHandler {
  const tdd = new TddMonitor();

  return {
    handleToolCall(toolName: string, input: Record<string, any>): ToolCallResult {
      // Only write/edit tools can trigger TDD violations
      if (toolName === "write" || toolName === "edit") {
        const path = input.path as string | undefined;
        if (path) {
          const violation = tdd.onFileWritten(path);
          return { violation };
        }
      }
      return { violation: null };
    },

    handleBashResult(command: string, output: string, exitCode: number | undefined): void {
      // Check for git commit
      if (/\bgit\s+commit\b/.test(command)) {
        tdd.onCommit();
        return;
      }

      // Check for test commands
      if (parseTestCommand(command)) {
        const passed = parseTestResult(output, exitCode);
        if (passed !== null) {
          tdd.onTestResult(passed);
        }
      }
    },

    getTddPhase(): string {
      return tdd.getPhase();
    },

    getWidgetText(): string {
      const phase = tdd.getPhase();
      if (phase === "idle") return "";
      return `TDD: ${phase.toUpperCase()}`;
    },

    getTddState() {
      return tdd.getState();
    },

    restoreTddState(phase: any, testFiles: string[], sourceFiles: string[]) {
      tdd.setState(phase, testFiles, sourceFiles);
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-monitor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/workflow-handler.ts tests/extension/workflow-monitor/workflow-monitor.test.ts
git commit -m "feat: add workflow handler (testable core logic for extension wiring)"
```

---

## Task 9: Main Extension Entry Point

**Files:**
- Create: `extensions/workflow-monitor.ts`
- Modify: `package.json` (add extension to pi config)

This task wires the testable handler into pi's extension API. Minimal unit testing here — the handler is already tested. This is integration wiring.

**Step 1: Write workflow-monitor.ts**

```typescript
// extensions/workflow-monitor.ts
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { createWorkflowHandler } from "./workflow-monitor/workflow-handler";
import { getTddViolationWarning } from "./workflow-monitor/warnings";
import { loadReference, REFERENCE_TOPICS } from "./workflow-monitor/reference-tool";

export default function (pi: ExtensionAPI) {
  const handler = createWorkflowHandler();

  // --- State reconstruction on session events ---
  for (const event of [
    "session_start",
    "session_switch",
    "session_fork",
    "session_tree",
  ] as const) {
    pi.on(event, async (_event, ctx) => {
      // TODO: reconstruct TDD state from session entries if we persist it
      // For now, reset to idle on session change
      handler.restoreTddState("idle", [], []);
      updateWidget(ctx);
    });
  }

  // --- Tool call observation (detect file writes) ---
  pi.on("tool_call", async (event, _ctx) => {
    // We observe but don't block — violations are reported in tool_result
    handler.handleToolCall(event.toolName, event.input as Record<string, any>);
  });

  // --- Tool result modification (inject warnings) ---
  pi.on("tool_result", async (event, ctx) => {
    // Re-check for violation (tool_call already recorded it, check state)
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = (event.input as Record<string, any>).path as string | undefined;
      if (path) {
        const { violation } = handler.handleToolCall(event.toolName, event.input as Record<string, any>);
        if (violation) {
          const warning = getTddViolationWarning(violation.type, violation.file);
          const existingText = event.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n");
          updateWidget(ctx);
          return {
            content: [{ type: "text", text: `${existingText}\n\n${warning}` }],
          };
        }
      }
    }

    // Handle bash results (test runs, commits)
    if (event.toolName === "bash") {
      const command = (event.input as Record<string, any>).command as string ?? "";
      const output = event.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      const exitCode = (event.details as any)?.exitCode as number | undefined;
      handler.handleBashResult(command, output, exitCode);
    }

    updateWidget(ctx);
    return undefined; // No modification
  });

  // --- TUI Widget ---
  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const text = handler.getWidgetText();
    if (!text) {
      ctx.ui.setWidget("workflow_monitor", undefined);
    } else {
      ctx.ui.setWidget("workflow_monitor", (_tui, theme) => {
        const phaseMap: Record<string, string> = {
          RED: "error",
          GREEN: "success",
          REFACTOR: "accent",
        };
        const phase = handler.getTddPhase().toUpperCase();
        const color = phaseMap[phase] ?? "muted";
        return new Text(theme.fg(color, `TDD: ${phase}`), 0, 0);
      });
    }
  }

  // --- Reference Tool ---
  pi.registerTool({
    name: "workflow_reference",
    label: "Workflow Reference",
    description: `Detailed guidance for workflow skills. Topics: ${REFERENCE_TOPICS.join(", ")}`,
    parameters: Type.Object({
      topic: StringEnum(REFERENCE_TOPICS as unknown as readonly [string, ...string[]], {
        description: "Reference topic to load",
      }),
    }),
    async execute(_toolCallId, params) {
      const content = await loadReference(params.topic);
      return {
        content: [{ type: "text", text: content }],
        details: { topic: params.topic },
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("workflow_reference "));
      text += theme.fg("accent", args.topic);
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const topic = (result.details as any)?.topic ?? "unknown";
      const content = result.content[0];
      const len = content?.type === "text" ? content.text.length : 0;
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("muted", `${topic} (${len} chars)`),
        0,
        0
      );
    },
  });
}
```

**Step 2: Update package.json**

Add `workflow-monitor.ts` to the extensions list:

```json
{
  "pi": {
    "extensions": ["extensions/plan-tracker.ts", "extensions/workflow-monitor.ts"],
    "skills": ["skills"]
  }
}
```

**Step 3: Commit**

```bash
git add extensions/workflow-monitor.ts package.json
git commit -m "feat: wire workflow-monitor extension (TDD enforcement + reference tool + widget)"
```

---

## Task 10: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

**Step 2: Install vitest as dev dependency**

```bash
npm install --save-dev vitest
```

**Step 3: Add test script to package.json**

Add to scripts: `"test": "vitest run"`

**Step 4: Run all tests**

```bash
npm test
```

Expected: All tests pass (heuristics, tdd-monitor, test-runner, warnings, reference-tool, workflow-monitor).

**Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest config and test script"
```

---

## Task 11: Integration Smoke Test

**Files:**
- None (manual verification)

**Step 1: Test extension loads in pi**

```bash
cd /home/pi/pi-superpowers-plus
pi -e extensions/workflow-monitor.ts
```

Verify: pi loads without errors, workflow_reference tool appears in tool list.

**Step 2: Test TDD violation detection**

In the pi session, write a source file without a test first. Verify the warning is injected into the tool result.

**Step 3: Test widget display**

Write a test file. Verify the TUI widget shows `TDD: RED`. Run tests. Verify it shows `TDD: GREEN`.

**Step 4: Test reference tool**

Ask the agent to call `workflow_reference({ topic: "tdd-rationalizations" })`. Verify content loads correctly.

---

## Summary

| Task | What | Tests |
|------|------|-------|
| 1 | File classification heuristics | 12 tests |
| 2 | TDD monitor state machine | 13 tests |
| 3 | Test runner detection | 13 tests |
| 4 | TDD violation warning content | 3 tests |
| 5 | Extract TDD reference content | Content only |
| 6 | Reference tool (load topics) | 5 tests |
| 7 | Lean TDD skill rewrite | Content only |
| 8 | Workflow handler (testable wiring) | 8 tests |
| 9 | Main extension entry point | Wiring (tested via handler) |
| 10 | Vitest configuration | All tests run |
| 11 | Integration smoke test | Manual |

**Total: ~54 unit tests across 6 test files.**

After all tasks complete, run `/skill:verification-before-completion` to confirm everything works end-to-end.
