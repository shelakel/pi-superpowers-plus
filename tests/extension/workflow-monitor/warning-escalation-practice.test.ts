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
      registerTool() {},
      registerCommand() {},
      appendEntry() {},
    },
  };
}

function getSingleHandler(handlers: Map<string, Handler[]>, event: string): Handler {
  const list = handlers.get(event) ?? [];
  expect(list.length).toBeGreaterThan(0);
  return list[0]!;
}

describe("practice escalation", () => {
  test("strike counter does not increment in non-interactive mode", async () => {
    const fake = createFakePi();
    workflowMonitorExtension(fake.api as any);

    const onToolCall = getSingleHandler(fake.handlers, "tool_call");

    const ctx = {
      hasUI: false,
      sessionManager: { getBranch: () => [] },
      ui: {
        setWidget: () => {},
        select: async () => {
          throw new Error("should not prompt in non-interactive mode");
        },
        setEditorText: () => {},
        notify: () => {},
      },
    };

    // Multiple TDD violations in non-interactive mode should never prompt
    await onToolCall({ toolCallId: "t1", toolName: "write", input: { path: "src/a.ts", content: "x" } }, ctx);
    await onToolCall({ toolCallId: "t2", toolName: "write", input: { path: "src/b.ts", content: "y" } }, ctx);
    await onToolCall({ toolCallId: "t3", toolName: "write", input: { path: "src/c.ts", content: "z" } }, ctx);

    // If we get here without throwing, the guard worked
  });

  test("'allow all for this session' suppresses further prompts", async () => {
    const fake = createFakePi();
    workflowMonitorExtension(fake.api as any);

    const onToolCall = getSingleHandler(fake.handlers, "tool_call");

    let promptCount = 0;
    const ctx = {
      hasUI: true,
      sessionManager: { getBranch: () => [] },
      ui: {
        setWidget: () => {},
        select: async () => {
          promptCount += 1;
          return "Yes, allow all for this session";
        },
        setEditorText: () => {},
        notify: () => {},
      },
    };

    // 1st violation: warning (no prompt yet)
    await onToolCall({ toolCallId: "t1", toolName: "write", input: { path: "src/a.ts", content: "x" } }, ctx);
    // 2nd violation: prompt → user picks "allow all for this session"
    await onToolCall({ toolCallId: "t2", toolName: "write", input: { path: "src/b.ts", content: "y" } }, ctx);
    expect(promptCount).toBe(1);

    // 3rd and 4th violations: should NOT prompt again
    await onToolCall({ toolCallId: "t3", toolName: "write", input: { path: "src/c.ts", content: "z" } }, ctx);
    await onToolCall({ toolCallId: "t4", toolName: "write", input: { path: "src/d.ts", content: "w" } }, ctx);
    expect(promptCount).toBe(1);
  });

  test("second TDD violation blocks the write (interactive)", async () => {
    const fake = createFakePi();
    workflowMonitorExtension(fake.api as any);

    const onToolCall = getSingleHandler(fake.handlers, "tool_call");

    let promptCount = 0;
    const ctx = {
      hasUI: true,
      sessionManager: { getBranch: () => [] },
      ui: {
        setWidget: () => {},
        select: async () => {
          promptCount += 1;
          return "No, stop";
        },
        setEditorText: () => {},
        notify: () => {},
      },
    };

    // 1st TDD violation: allowed (warn later in tool_result)
    await onToolCall({ toolCallId: "t1", toolName: "write", input: { path: "src/a.ts", content: "x" } }, ctx);

    // 2nd TDD violation: should block
    const res = await onToolCall({ toolCallId: "t2", toolName: "write", input: { path: "src/b.ts", content: "y" } }, ctx);

    expect(promptCount).toBe(1);
    expect(res).toEqual({ blocked: true });
  });
});
