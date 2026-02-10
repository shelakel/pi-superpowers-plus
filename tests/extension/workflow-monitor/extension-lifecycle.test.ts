import { describe, test, expect } from "vitest";
import workflowMonitorExtension from "../../../extensions/workflow-monitor";

type Handler = (event: any, ctx: any) => any;

function createFakePi() {
  const handlers = new Map<string, Handler[]>();

  return {
    handlers,
    api: {
      on(event: string, handler: Handler) {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
      registerTool() {
        // no-op for these tests
      },
    },
  };
}

function getSingleHandler(handlers: Map<string, Handler[]>, event: string): Handler {
  const list = handlers.get(event) ?? [];
  expect(list.length).toBeGreaterThan(0);
  return list[0]!;
}

describe("workflow-monitor extension lifecycle", () => {
  test("clears pending violation on session switch", async () => {
    const fake = createFakePi();
    workflowMonitorExtension(fake.api as any);

    const ctx = { hasUI: false };
    const onToolCall = getSingleHandler(fake.handlers, "tool_call");
    const onToolResult = getSingleHandler(fake.handlers, "tool_result");
    const onSessionSwitch = getSingleHandler(fake.handlers, "session_switch");

    // Queue a violation from tool_call.
    await onToolCall({ toolName: "write", input: { path: "src/foo.ts" } }, ctx);

    // Session change should clear pending state.
    await onSessionSwitch({}, ctx);

    // If pendingViolation was not cleared, this would inject a stale warning.
    const result = await onToolResult(
      {
        toolName: "write",
        input: { path: "src/bar.ts" },
        content: [{ type: "text", text: "ok" }],
        details: {},
      },
      ctx
    );

    expect(result).toBeUndefined();
  });
});
