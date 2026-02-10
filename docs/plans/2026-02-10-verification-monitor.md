# Verification Monitor Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add a verification monitor that warns when the agent commits/pushes/PRs without having run tests/build/lint recently, and trim the verification-before-completion skill.

**Architecture:** A `VerificationMonitor` class tracks the last verification command timestamp. The workflow handler checks it on git commit/push/PR commands during `tool_call` and sets a pending violation. The warning is injected into `tool_result`. The skill is trimmed from 139→~80 lines by removing content now covered by enforcement.

**Tech Stack:** TypeScript, vitest

---

### Task 1: Write VerificationMonitor unit tests

**Files:**
- Create: `tests/extension/workflow-monitor/verification-monitor.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { VerificationMonitor } from "../../../extensions/workflow-monitor/verification-monitor";

describe("VerificationMonitor", () => {
  let monitor: VerificationMonitor;

  beforeEach(() => {
    monitor = new VerificationMonitor();
  });

  describe("recordVerification", () => {
    it("records that verification was run", () => {
      monitor.recordVerification();
      expect(monitor.hasRecentVerification()).toBe(true);
    });
  });

  describe("hasRecentVerification", () => {
    it("returns false when no verification has been run", () => {
      expect(monitor.hasRecentVerification()).toBe(false);
    });

    it("returns false after reset", () => {
      monitor.recordVerification();
      monitor.reset();
      expect(monitor.hasRecentVerification()).toBe(false);
    });

    it("returns false after source file invalidates verification", () => {
      monitor.recordVerification();
      monitor.onSourceWritten();
      expect(monitor.hasRecentVerification()).toBe(false);
    });

    it("returns true when verification run after source write", () => {
      monitor.onSourceWritten();
      monitor.recordVerification();
      expect(monitor.hasRecentVerification()).toBe(true);
    });
  });

  describe("checkCommitGate", () => {
    it("returns violation when committing without verification", () => {
      const result = monitor.checkCommitGate("git commit -m 'feat: stuff'");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("commit-without-verification");
    });

    it("returns null when committing with recent verification", () => {
      monitor.recordVerification();
      const result = monitor.checkCommitGate("git commit -m 'feat: stuff'");
      expect(result).toBeNull();
    });

    it("detects git push", () => {
      const result = monitor.checkCommitGate("git push origin main");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("push-without-verification");
    });

    it("detects gh pr create", () => {
      const result = monitor.checkCommitGate("gh pr create --title 'feat'");
      expect(result).not.toBeNull();
      expect(result!.type).toBe("pr-without-verification");
    });

    it("returns null for non-commit commands", () => {
      const result = monitor.checkCommitGate("ls -la");
      expect(result).toBeNull();
    });

    it("returns null for git add (not a commit)", () => {
      const result = monitor.checkCommitGate("git add .");
      expect(result).toBeNull();
    });

    it("returns violation after source write invalidates verification", () => {
      monitor.recordVerification();
      monitor.onSourceWritten();
      const result = monitor.checkCommitGate("git commit -m 'fix'");
      expect(result).not.toBeNull();
    });

    it("returns null for commit --amend with recent verification", () => {
      monitor.recordVerification();
      const result = monitor.checkCommitGate("git commit --amend");
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/extension/workflow-monitor/verification-monitor.test.ts`
Expected: FAIL — `VerificationMonitor` module not found

---

### Task 2: Implement VerificationMonitor

**Files:**
- Create: `extensions/workflow-monitor/verification-monitor.ts`

**Step 1: Write minimal implementation**

```typescript
export interface VerificationViolation {
  type: "commit-without-verification" | "push-without-verification" | "pr-without-verification";
  command: string;
}

const COMMIT_RE = /\bgit\s+commit\b/;
const PUSH_RE = /\bgit\s+push\b/;
const PR_RE = /\bgh\s+pr\s+create\b/;

export class VerificationMonitor {
  private verified = false;

  recordVerification(): void {
    this.verified = true;
  }

  onSourceWritten(): void {
    this.verified = false;
  }

  hasRecentVerification(): boolean {
    return this.verified;
  }

  checkCommitGate(command: string): VerificationViolation | null {
    if (COMMIT_RE.test(command)) {
      return this.verified ? null : { type: "commit-without-verification", command };
    }
    if (PUSH_RE.test(command)) {
      return this.verified ? null : { type: "push-without-verification", command };
    }
    if (PR_RE.test(command)) {
      return this.verified ? null : { type: "pr-without-verification", command };
    }
    return null;
  }

  reset(): void {
    this.verified = false;
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/extension/workflow-monitor/verification-monitor.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/extension/workflow-monitor/verification-monitor.test.ts extensions/workflow-monitor/verification-monitor.ts
git commit -m "feat: add VerificationMonitor with commit/push/PR gating"
```

---

### Task 3: Add verification warning message + tests

**Files:**
- Modify: `extensions/workflow-monitor/warnings.ts`
- Modify: `tests/extension/workflow-monitor/warnings.test.ts`

**Step 1: Write failing test**

Add to `warnings.test.ts`:

```typescript
import { getVerificationViolationWarning } from "../../../extensions/workflow-monitor/warnings";

describe("getVerificationViolationWarning", () => {
  it("warns about commit without verification", () => {
    const msg = getVerificationViolationWarning("commit-without-verification", "git commit -m 'feat'");
    expect(msg).toContain("VERIFICATION");
    expect(msg).toContain("git commit");
    expect(msg).toContain("Run the test");
  });

  it("warns about push without verification", () => {
    const msg = getVerificationViolationWarning("push-without-verification", "git push");
    expect(msg).toContain("push");
  });

  it("warns about PR without verification", () => {
    const msg = getVerificationViolationWarning("pr-without-verification", "gh pr create");
    expect(msg).toContain("PR");
  });
});
```

**Step 2: Run to verify fail**

Run: `npx vitest run tests/extension/workflow-monitor/warnings.test.ts`
Expected: FAIL — `getVerificationViolationWarning` not exported

**Step 3: Implement warning message**

Add to `warnings.ts`:

```typescript
export type VerificationViolationType =
  | "commit-without-verification"
  | "push-without-verification"
  | "pr-without-verification";

export function getVerificationViolationWarning(
  type: VerificationViolationType,
  command: string
): string {
  const action =
    type === "commit-without-verification" ? "commit" :
    type === "push-without-verification" ? "push" :
    "create a PR";

  return `
⚠️ VERIFICATION REQUIRED: You're about to ${action} without running verification.

Command: ${command}

Run the test/build/lint command FIRST. Read the output. Confirm it passes.
THEN ${action}.

Evidence before claims. No shortcuts.
`.trim();
}
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/extension/workflow-monitor/warnings.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/warnings.ts tests/extension/workflow-monitor/warnings.test.ts
git commit -m "feat: add verification violation warning messages"
```

---

### Task 4: Wire VerificationMonitor into WorkflowHandler + tests

**Files:**
- Modify: `extensions/workflow-monitor/workflow-handler.ts`
- Modify: `tests/extension/workflow-monitor/workflow-monitor.test.ts`

**Step 1: Write failing integration tests**

Add to `workflow-monitor.test.ts`:

```typescript
describe("verification monitor", () => {
  it("returns violation on git commit without verification", () => {
    const result = handler.checkCommitGate("git commit -m 'feat'");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("commit-without-verification");
  });

  it("returns null on git commit after test run", () => {
    handler.handleBashResult("npx vitest run", "1 passed", 0);
    const result = handler.checkCommitGate("git commit -m 'feat'");
    expect(result).toBeNull();
  });

  it("invalidates verification after source write", () => {
    handler.handleBashResult("npx vitest run", "1 passed", 0);
    handler.handleToolCall("write", { path: "src/index.ts" });
    const result = handler.checkCommitGate("git commit -m 'feat'");
    expect(result).not.toBeNull();
  });

  it("resets verification on session reset", () => {
    handler.handleBashResult("npx vitest run", "1 passed", 0);
    handler.resetState();
    const result = handler.checkCommitGate("git commit -m 'feat'");
    expect(result).not.toBeNull();
  });
});
```

**Step 2: Run to verify fail**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-monitor.test.ts`
Expected: FAIL — `checkCommitGate` not a function

**Step 3: Wire into WorkflowHandler**

In `workflow-handler.ts`:
- Import `VerificationMonitor`
- Create instance alongside TDD/debug monitors
- Call `verification.recordVerification()` when a test run is detected (where `parseTestResult` returns non-null)
- Call `verification.onSourceWritten()` in `handleToolCall` when a source file is written
- Add `checkCommitGate(command)` method that delegates to the monitor
- Reset in `resetState()`

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/extension/workflow-monitor/workflow-monitor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add extensions/workflow-monitor/workflow-handler.ts tests/extension/workflow-monitor/workflow-monitor.test.ts
git commit -m "feat: wire VerificationMonitor into WorkflowHandler"
```

---

### Task 5: Wire into extension entry point

**Files:**
- Modify: `extensions/workflow-monitor.ts`

**Step 1: Add verification gating to tool_call handler**

In the `tool_call` handler, before the existing write/edit handling, check bash commands:

```typescript
if (event.toolName === "bash") {
  const command = (event.input as Record<string, any>).command as string ?? "";
  const verificationViolation = handler.checkCommitGate(command);
  if (verificationViolation) {
    pendingVerificationViolation = verificationViolation;
  }
}
```

In the `tool_result` handler, inject the verification warning for bash results:

```typescript
if (event.toolName === "bash" && pendingVerificationViolation) {
  const violation = pendingVerificationViolation;
  pendingVerificationViolation = null;
  // ... inject warning into result content
}
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add extensions/workflow-monitor.ts
git commit -m "feat: wire verification gating into extension entry point"
```

---

### Task 6: Trim verification-before-completion skill

**Files:**
- Modify: `skills/verification-before-completion/SKILL.md`

**Step 1: Trim skill to ~80 lines**

Keep:
- Iron law
- Gate function
- Red flags (condensed)
- Key patterns (condensed — just the ✅/❌ one-liners)
- One line noting the enforcement extension catches commits without verification

Remove (now handled by enforcement extension + can be added to reference tool later):
- Common Failures table (7 rows)
- Rationalization Prevention table (8 rows)
- "Why This Matters" section
- "When To Apply" section (redundant with iron law)
- "The Bottom Line" section (redundant)

**Step 2: Verify skill reads well and covers the core principles**

**Step 3: Commit**

```bash
git add skills/verification-before-completion/SKILL.md
git commit -m "feat: trim verification-before-completion skill (139 → ~80 lines)"
```

---

### Task 7: Run full test suite + verify

Run: `npx vitest run`
Expected: All tests pass, no regressions

Verify:
- `wc -l skills/verification-before-completion/SKILL.md` → ~80 lines
- Verification monitor catches `git commit` without tests
- Verification monitor allows `git commit` after tests pass
- Source writes invalidate previous verification
