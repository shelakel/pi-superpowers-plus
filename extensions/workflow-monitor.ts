/**
 * Workflow Monitor Extension
 *
 * Observes tool_call and tool_result events to:
 * - Track TDD phase (RED→GREEN→REFACTOR) and inject warnings on violations
 * - Track debug fix-fail cycles and inject warnings on investigation skips / thrashing
 * - Show workflow state in TUI widget
 * - Register workflow_reference tool for on-demand reference content
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { createWorkflowHandler, type Violation } from "./workflow-monitor/workflow-handler";
import { getTddViolationWarning } from "./workflow-monitor/warnings";
import { getDebugViolationWarning, type DebugViolationType } from "./workflow-monitor/warnings";
import { loadReference, REFERENCE_TOPICS } from "./workflow-monitor/reference-tool";

export default function (pi: ExtensionAPI) {
  const handler = createWorkflowHandler();

  // Pending violation: set during tool_call, injected during tool_result.
  // Scoped here because tool_call and tool_result fire sequentially per call.
  let pendingViolation: Violation | null = null;

  // --- State reconstruction on session events ---
  for (const event of [
    "session_start",
    "session_switch",
    "session_fork",
    "session_tree",
  ] as const) {
    pi.on(event, async (_event, ctx) => {
      handler.resetState();
      pendingViolation = null;
      updateWidget(ctx);
    });
  }

  // --- Tool call observation (detect file writes) ---
  pi.on("tool_call", async (event, _ctx) => {
    const result = handler.handleToolCall(event.toolName, event.input as Record<string, any>);
    pendingViolation = result.violation;
  });

  // --- Tool result modification (inject warnings + track investigation) ---
  pi.on("tool_result", async (event, ctx) => {
    // Handle read tool as investigation signal
    if (event.toolName === "read") {
      const path = (event.input as Record<string, any>).path as string ?? "";
      handler.handleReadOrInvestigation("read", path);
    }

    // Inject violation warning on write/edit
    if ((event.toolName === "write" || event.toolName === "edit") && pendingViolation) {
      const violation = pendingViolation;
      pendingViolation = null;
      const warning = formatViolationWarning(violation);
      const existingText = event.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      updateWidget(ctx);
      return {
        content: [{ type: "text", text: `${existingText}\n\n${warning}` }],
      };
    }
    pendingViolation = null;

    // Handle bash results (test runs, commits, investigation)
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
    return undefined;
  });

  // --- Format violation warning based on type ---
  function formatViolationWarning(violation: Violation): string {
    if (violation.type === "source-before-test" || violation.type === "source-during-red") {
      return getTddViolationWarning(violation.type, violation.file);
    }
    return getDebugViolationWarning(
      violation.type as DebugViolationType,
      violation.file,
      "fixAttempts" in violation ? violation.fixAttempts : 0
    );
  }

  // --- TUI Widget ---
  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const text = handler.getWidgetText();
    if (!text) {
      ctx.ui.setWidget("workflow_monitor", undefined);
    } else {
      ctx.ui.setWidget("workflow_monitor", (_tui, theme) => {
        const parts: string[] = [];

        // TDD phase
        const tddPhase = handler.getTddPhase().toUpperCase();
        if (tddPhase !== "IDLE") {
          const colorMap: Record<string, string> = {
            RED: "error",
            GREEN: "success",
            REFACTOR: "accent",
          };
          parts.push(theme.fg(colorMap[tddPhase] ?? "muted", `TDD: ${tddPhase}`));
        }

        // Debug state
        if (handler.isDebugActive()) {
          const attempts = handler.getDebugFixAttempts();
          if (attempts >= 3) {
            parts.push(theme.fg("error", `Debug: ${attempts} fix attempts ⚠️`));
          } else if (attempts > 0) {
            parts.push(theme.fg("warning", `Debug: ${attempts} fix attempt${attempts !== 1 ? "s" : ""}`));
          } else {
            parts.push(theme.fg("accent", "Debug: investigating"));
          }
        }

        return parts.length > 0
          ? new Text(parts.join(theme.fg("dim", "  |  ")), 0, 0)
          : undefined;
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
