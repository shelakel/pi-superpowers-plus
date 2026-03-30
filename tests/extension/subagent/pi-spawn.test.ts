import { describe, expect, test } from "vitest";
import { getPiSpawnCommand } from "../../../extensions/subagent/pi-spawn";

describe("pi-spawn", () => {
  test("returns a command and args array", () => {
    const spec = getPiSpawnCommand(["--mode", "json", "-p", "hello"]);
    expect(spec.command).toBeTruthy();
    expect(Array.isArray(spec.args)).toBe(true);
    expect(spec.args.length).toBeGreaterThanOrEqual(1);
  });

  test("preserves user args", () => {
    const userArgs = ["--mode", "json", "-p", "--no-session", "Task: test"];
    const spec = getPiSpawnCommand(userArgs);

    // All user args should appear at the end
    if (spec.command === "pi") {
      // Non-windows: args are the user args directly
      expect(spec.args).toEqual(userArgs);
    } else {
      // Windows: args are [<pi-path>, ...userArgs]
      expect(spec.args.slice(1)).toEqual(userArgs);
    }
  });

  test("command is either 'pi' or a node executable", () => {
    const spec = getPiSpawnCommand(["test"]);
    const isPi = spec.command === "pi";
    const isNode =
      spec.command.endsWith("node") ||
      spec.command.endsWith("node.exe") ||
      spec.command.endsWith("node.cmd");
    expect(isPi || isNode).toBe(true);
  });
});
