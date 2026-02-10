import { DebugMonitor, type DebugViolation } from "./debug-monitor";
import { isSourceFile } from "./heuristics";
import { isInvestigationCommand } from "./investigation";
import { TddMonitor, type TddPhase, type TddViolation } from "./tdd-monitor";
import { parseTestCommand, parseTestResult } from "./test-runner";

export type Violation = TddViolation | DebugViolation;

export interface ToolCallResult {
  violation: Violation | null;
}

export interface WorkflowHandler {
  handleToolCall(toolName: string, input: Record<string, any>): ToolCallResult;
  handleReadOrInvestigation(toolName: string, path: string): void;
  handleBashResult(command: string, output: string, exitCode: number | undefined): void;
  handleBashInvestigation(command: string): void;
  isDebugActive(): boolean;
  getDebugFixAttempts(): number;
  getTddPhase(): string;
  getWidgetText(): string;
  getTddState(): ReturnType<TddMonitor["getState"]>;
  restoreTddState(
    phase: TddPhase,
    testFiles: string[],
    sourceFiles: string[],
    redVerificationPending?: boolean
  ): void;
  resetState(): void;
}

export function createWorkflowHandler(): WorkflowHandler {
  const tdd = new TddMonitor();
  const debug = new DebugMonitor();
  let debugFailStreak = 0;

  return {
    handleToolCall(toolName: string, input: Record<string, any>): ToolCallResult {
      if (toolName === "write" || toolName === "edit") {
        const path = input.path as string | undefined;
        if (path) {
          // Debug violations take precedence, and when debug is active we don't
          // additionally enforce TDD write-order violations.
          if (debug.isActive() && isSourceFile(path)) {
            const debugViolation = debug.onSourceWritten(path);
            return { violation: debugViolation };
          }

          const tddViolation = tdd.onFileWritten(path);
          return { violation: tddViolation };
        }
      }
      return { violation: null };
    },

    handleReadOrInvestigation(toolName: string, _path: string): void {
      if (toolName === "read") {
        debug.onInvestigation();
      }
    },

    handleBashResult(command: string, output: string, exitCode: number | undefined): void {
      if (isInvestigationCommand(command)) {
        debug.onInvestigation();
      }

      if (/\bgit\s+commit\b/.test(command)) {
        debugFailStreak = 0;
        tdd.onCommit();
        debug.onCommit();
        return;
      }

      if (parseTestCommand(command)) {
        const passed = parseTestResult(output, exitCode);
        if (passed !== null) {
          const excludeFromDebug =
            !passed && tdd.getPhase() === "red" && tdd.isRedVerificationPending();

          tdd.onTestResult(passed);

          if (passed) {
            debugFailStreak = 0;
            debug.onTestPassed();
          } else if (!excludeFromDebug) {
            debugFailStreak += 1;
            if (debugFailStreak >= 2) {
              debug.onTestFailed();
            }
          }
        }
      }
    },

    handleBashInvestigation(command: string): void {
      if (isInvestigationCommand(command)) {
        debug.onInvestigation();
      }
    },

    isDebugActive(): boolean {
      return debug.isActive();
    },

    getDebugFixAttempts(): number {
      return debug.getFixAttempts();
    },

    getTddPhase(): string {
      return tdd.getPhase();
    },

    getWidgetText(): string {
      const parts: string[] = [];

      const phase = tdd.getPhase();
      if (phase !== "idle") {
        parts.push(`TDD: ${phase.toUpperCase()}`);
      }

      if (debug.isActive()) {
        parts.push("Debug: ACTIVE");
      }

      return parts.join(" | ");
    },

    getTddState() {
      return tdd.getState();
    },

    restoreTddState(
      phase: TddPhase,
      testFiles: string[],
      sourceFiles: string[],
      redVerificationPending = false
    ) {
      tdd.setState(phase, testFiles, sourceFiles, redVerificationPending);
    },

    resetState() {
      debugFailStreak = 0;
      tdd.onCommit();
      debug.onCommit();
    },
  };
}
