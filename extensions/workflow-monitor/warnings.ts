export function getTddViolationWarning(type: string, file: string): string {
  if (type === "source-before-test") {
    return `
⚠️ TDD VIOLATION: You wrote production code (${file}) without a failing test first.

The Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

Delete this code. Write the failing test first. Then implement.

Common rationalizations (all wrong):
- "Too simple to test" → Simple code breaks. Test takes 30 seconds.
- "I'll test after" → Tests passing immediately prove nothing.
- "Need to explore first" → Fine. Throw away exploration, start with TDD.
- "Deleting this work is wasteful" → Sunk cost fallacy. Keeping unverified code is debt.

Delete the production code. Write the test. Watch it fail. Then implement.
`.trim();
  }

  return `⚠️ TDD WARNING: Unexpected violation type "${type}" for ${file}`;
}
