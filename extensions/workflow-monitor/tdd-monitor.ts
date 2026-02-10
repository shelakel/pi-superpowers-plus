import { isTestFile, isSourceFile } from "./heuristics";

export type TddPhase = "idle" | "red" | "green" | "refactor";

export interface TddViolation {
  type: "source-before-test" | "source-during-red";
  file: string;
}

export class TddMonitor {
  private phase: TddPhase = "idle";
  private testFilesWritten = new Set<string>();
  private sourceFilesWritten = new Set<string>();
  private redVerificationPending = false;

  getPhase(): TddPhase {
    return this.phase;
  }

  isRedVerificationPending(): boolean {
    return this.phase === "red" && this.redVerificationPending;
  }

  onFileWritten(path: string): TddViolation | null {
    if (isTestFile(path)) {
      this.testFilesWritten.add(path);
      this.phase = "red";
      this.redVerificationPending = true;
      return null;
    }

    if (isSourceFile(path)) {
      this.sourceFilesWritten.add(path);

      if (this.testFilesWritten.size === 0) {
        return { type: "source-before-test", file: path };
      }

      if (this.phase === "red" && this.redVerificationPending) {
        return { type: "source-during-red", file: path };
      }

      if (this.phase === "green") {
        this.phase = "refactor";
      }
      return null;
    }

    return null;
  }

  onTestResult(passed: boolean): void {
    if (this.phase === "red") {
      this.redVerificationPending = false;
    }

    if (passed && (this.phase === "red" || this.phase === "refactor")) {
      this.phase = "green";
    }
  }

  onCommit(): void {
    this.phase = "idle";
    this.redVerificationPending = false;
    this.testFilesWritten.clear();
    this.sourceFilesWritten.clear();
  }

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
}
