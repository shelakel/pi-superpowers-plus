import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadAgentsFromDir } from "../../../extensions/subagent/agents";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agents-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeAgent(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, `${name}.md`), content, "utf-8");
}

describe("agent frontmatter extensions parsing", () => {
  test("agent with a single extension path is parsed correctly", () => {
    writeAgent(
      tmpDir,
      "my-agent",
      `---
name: my-agent
description: A test agent
extensions: ../extensions/some-extension.ts
---
You are a test agent.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "user");
    expect(agents).toHaveLength(1);
    expect(agents[0].extensions).toEqual(["../extensions/some-extension.ts"]);
  });

  test("agent with multiple extension paths (comma-separated) is parsed correctly", () => {
    writeAgent(
      tmpDir,
      "multi-ext-agent",
      `---
name: multi-ext-agent
description: Agent with multiple extensions
extensions: ../extensions/ext-a.ts, ../extensions/ext-b.ts
---
You are a multi-extension agent.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "project");
    expect(agents).toHaveLength(1);
    expect(agents[0].extensions).toEqual(["../extensions/ext-a.ts", "../extensions/ext-b.ts"]);
  });

  test("agent without extensions field has undefined extensions", () => {
    writeAgent(
      tmpDir,
      "no-ext-agent",
      `---
name: no-ext-agent
description: Agent without extensions
---
You are an agent with no extensions.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "user");
    expect(agents).toHaveLength(1);
    expect(agents[0].extensions).toBeUndefined();
  });

  test("agent with empty extensions field has undefined extensions", () => {
    writeAgent(
      tmpDir,
      "empty-ext-agent",
      `---
name: empty-ext-agent
description: Agent with empty extensions field
extensions: 
---
You are an agent with an empty extensions field.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "user");
    expect(agents).toHaveLength(1);
    // Empty / whitespace-only value should yield undefined (empty array filtered out)
    expect(agents[0].extensions).toBeUndefined();
  });

  test("extensions as YAML array are parsed correctly", () => {
    writeAgent(
      tmpDir,
      "yaml-array-ext-agent",
      `---
name: yaml-array-ext-agent
description: Agent with extensions as YAML array
extensions:
  - ../extensions/ext-a.ts
  - ../extensions/ext-b.ts
---
You are a YAML array extensions agent.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "project");
    expect(agents).toHaveLength(1);
    expect(agents[0].extensions).toEqual(["../extensions/ext-a.ts", "../extensions/ext-b.ts"]);
  });

  test("tools as YAML array are parsed correctly", () => {
    writeAgent(
      tmpDir,
      "yaml-array-tools-agent",
      `---
name: yaml-array-tools-agent
description: Agent with tools as YAML array
tools:
  - read
  - write
  - edit
---
You are a YAML array tools agent.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "user");
    expect(agents).toHaveLength(1);
    expect(agents[0].tools).toEqual(["read", "write", "edit"]);
  });

  test("tools as comma-separated string are parsed correctly", () => {
    writeAgent(
      tmpDir,
      "string-tools-agent",
      `---
name: string-tools-agent
description: Agent with tools as comma-separated string
tools: read, write, edit
---
You are a string tools agent.
`,
    );

    const agents = loadAgentsFromDir(tmpDir, "user");
    expect(agents).toHaveLength(1);
    expect(agents[0].tools).toEqual(["read", "write", "edit"]);
  });
});
