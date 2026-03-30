import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { buildSubagentEnv } from "../../../extensions/subagent/env.js";

describe("buildSubagentEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("passes through full process.env", () => {
    process.env.PATH = "/usr/bin";
    process.env.HOME = "/home/user";
    process.env.SHELL = "/bin/zsh";
    const env = buildSubagentEnv();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/user");
    expect(env.SHELL).toBe("/bin/zsh");
  });

  test("passes through all env vars without filtering", () => {
    process.env.MY_CUSTOM_VAR = "hello";
    process.env.SOME_OTHER_VAR = "world";
    const env = buildSubagentEnv();
    expect(env.MY_CUSTOM_VAR).toBe("hello");
    expect(env.SOME_OTHER_VAR).toBe("world");
  });

  test("merges extra vars passed as argument", () => {
    const env = buildSubagentEnv({ PI_TDD_GUARD_VIOLATIONS_FILE: "/tmp/v.txt" });
    expect(env.PI_TDD_GUARD_VIOLATIONS_FILE).toBe("/tmp/v.txt");
  });

  test("extra vars override process.env", () => {
    process.env.PI_TDD_GUARD_VIOLATIONS_FILE = "/old/path";
    const env = buildSubagentEnv({ PI_TDD_GUARD_VIOLATIONS_FILE: "/new/path" });
    expect(env.PI_TDD_GUARD_VIOLATIONS_FILE).toBe("/new/path");
  });
});
