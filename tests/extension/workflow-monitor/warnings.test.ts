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
