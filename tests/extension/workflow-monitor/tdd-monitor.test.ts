import { describe, test, expect, beforeEach } from "vitest";
import { TddMonitor } from "../../../extensions/workflow-monitor/tdd-monitor";

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

  test("no violation when source written after test in green phase", () => {
    monitor.onFileWritten("src/utils.test.ts");
    monitor.onTestResult(true); // → GREEN
    const violation = monitor.onFileWritten("src/utils.ts");
    expect(violation).toBeNull();
  });

  test("returns source-during-red violation when source written in red phase", () => {
    monitor.onFileWritten("src/utils.test.ts"); // → RED
    const violation = monitor.onFileWritten("src/utils.ts");
    expect(violation).not.toBeNull();
    expect(violation?.type).toBe("source-during-red");
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

describe("TddMonitor (RED verification semantics)", () => {
  let tdd: TddMonitor;

  beforeEach(() => {
    tdd = new TddMonitor();
  });

  test("violates source-during-red when a test was written but tests have not been run yet", () => {
    expect(tdd.onFileWritten("tests/foo.test.ts")).toBeNull();

    const violation = tdd.onFileWritten("extensions/workflow-monitor/foo.ts");
    expect(violation).not.toBeNull();
    expect(violation?.type).toBe("source-during-red");
  });

  test("does NOT violate source-during-red after tests have been run once (even if they fail)", () => {
    expect(tdd.onFileWritten("tests/foo.test.ts")).toBeNull();

    tdd.onTestResult(false);

    const violation = tdd.onFileWritten("extensions/workflow-monitor/foo.ts");
    expect(violation).toBeNull();
  });

  test("re-enters RED verification when a new test is written in a later cycle", () => {
    expect(tdd.onFileWritten("tests/first.test.ts")).toBeNull();
    tdd.onTestResult(true);
    expect(tdd.getPhase()).toBe("green");

    expect(tdd.onFileWritten("tests/second.test.ts")).toBeNull();
    expect(tdd.getPhase()).toBe("red");

    const violation = tdd.onFileWritten("extensions/workflow-monitor/foo.ts");
    expect(violation?.type).toBe("source-during-red");
  });
});
