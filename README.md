# pi-superpowers-plus

![pi-superpowers-plus banner](banner-plus.jpg)

Structured workflow skills and active enforcement extensions for [pi](https://github.com/badlogic/pi-mono). Your coding agent doesn't just know the rules — it follows them.

**Skills** teach the agent *what* to do: brainstorm before building, write tests before code, verify before claiming done. **Extensions** enforce it in real time: the TDD monitor watches every file write and warns when you skip the test.

Based on [pi-superpowers](https://github.com/coctostan/pi-superpowers) (itself adapted from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent), with active enforcement on top.

## Install

```bash
pi install git:github.com/coctostan/pi-superpowers-plus
```

Or add to `.pi/settings.json` (project-level) or `~/.pi/agent/settings.json` (global):

```json
{
  "packages": ["git:github.com/coctostan/pi-superpowers-plus"]
}
```

## What's Different from pi-superpowers

| | pi-superpowers | pi-superpowers-plus |
|---|---|---|
| **Skills** | 12 workflow skills | Same 12 skills (leaner TDD skill) |
| **TDD enforcement** | Skill tells agent the rules | Extension *watches* and injects warnings on violations |
| **TDD widget** | — | TUI widget shows RED → GREEN → REFACTOR phase |
| **Reference tool** | Everything in SKILL.md (373 lines) | Lean skill (110 lines) + on-demand `workflow_reference` tool |
| **Plan tracker** | ✓ | ✓ (unchanged) |
| **Debug enforcement** | Manual discipline | Extension escalates debug warnings after repeated non-TDD failures |

## Extensions

### Workflow Monitor

The `workflow-monitor` extension runs silently in the background, observing tool calls and results.

**TDD Enforcement:**
- Detects when the agent writes production code without a failing test first
- Injects a violation warning directly into the tool result — the agent sees it immediately
- Tracks the TDD phase (RED → GREEN → REFACTOR → idle) across the session
- Resets the cycle on `git commit`

**TDD Widget:**
Shows the current phase in the TUI status bar:
```
TDD: RED
```
Color-coded: red for RED, green for GREEN, accent for REFACTOR. Hidden when idle.

**Debug Enforcement:**
- Debug mode activates only after **2 consecutive failing test runs**
- The first failing test run immediately after writing a new test (intentional TDD RED verification) is excluded
- When debug mode is active, write-time warnings enforce investigation-first behavior

**Reference Tool:**
The `workflow_reference` tool serves extracted TDD reference content on demand, keeping the skill file lean while making detailed guidance available when needed:

```
workflow_reference({ topic: "tdd-rationalizations" })  — Why order matters, excuse table, red flags
workflow_reference({ topic: "tdd-examples" })           — Good/bad code examples, bug fix walkthrough
workflow_reference({ topic: "tdd-when-stuck" })         — Blocker solutions, verification checklist
workflow_reference({ topic: "tdd-anti-patterns" })      — Mock pitfalls, test-only methods
```

### Plan Tracker

The `plan_tracker` tool stores task state in the session and shows progress in the TUI:

```
Tasks: ✓✓→○○ (2/5)  Task 3: Recovery modes
```

```
plan_tracker({ action: "init", tasks: ["Task 1: Setup", "Task 2: Core", ...] })
plan_tracker({ action: "update", index: 0, status: "complete" })
plan_tracker({ action: "status" })
plan_tracker({ action: "clear" })
```

## Skills

| Skill | Description |
|-------|-------------|
| **brainstorming** | Socratic design refinement — questions, alternatives, incremental validation |
| **writing-plans** | Detailed implementation plans with bite-sized TDD tasks |
| **executing-plans** | Batch execution with checkpoints for architect review |
| **subagent-driven-development** | Fresh subagent per task with two-stage review |
| **test-driven-development** | RED-GREEN-REFACTOR cycle, enforced by the workflow monitor |
| **systematic-debugging** | 4-phase root cause investigation |
| **verification-before-completion** | Evidence before claims, always |
| **requesting-code-review** | Pre-merge review with severity categories |
| **receiving-code-review** | Technical evaluation of review feedback |
| **dispatching-parallel-agents** | Concurrent subagent workflows |
| **using-git-worktrees** | Isolated development branches |
| **finishing-a-development-branch** | Merge/PR decision workflow |

Each skill cross-references related skills so the agent knows what to use next.

## The Workflow

```
Brainstorm → Isolate → Plan → Execute → Verify → Review → Finish
```

1. **Brainstorm** — `/skill:brainstorming` refines your idea into a design document
2. **Isolate** — `/skill:using-git-worktrees` creates a clean workspace
3. **Plan** — `/skill:writing-plans` breaks work into bite-sized TDD tasks
4. **Execute** — `/skill:executing-plans` or `/skill:subagent-driven-development` works through the plan
5. **Verify** — `/skill:verification-before-completion` proves it works
6. **Review** — `/skill:requesting-code-review` catches issues
7. **Finish** — `/skill:finishing-a-development-branch` merges or creates a PR

Throughout steps 3–5, the workflow monitor enforces TDD discipline automatically.

## Subagent Dispatch

Skills that reference subagent dispatch (subagent-driven-development, requesting-code-review, dispatching-parallel-agents) work with any dispatch mechanism:

- **With pi-superteam:** The agent uses the `team` tool automatically
- **Without pi-superteam:** Run `pi -p "prompt"` in another terminal

## Architecture

```
pi-superpowers-plus/
├── extensions/
│   ├── plan-tracker.ts              # Task tracking tool + TUI widget
│   ├── workflow-monitor.ts          # Extension entry point (event wiring)
│   └── workflow-monitor/
│       ├── heuristics.ts            # File classification (test vs source)
│       ├── tdd-monitor.ts           # Phase state machine
│       ├── test-runner.ts           # Test command/result detection
│       ├── warnings.ts              # Violation warning content
│       ├── workflow-handler.ts      # Testable core logic
│       └── reference-tool.ts        # On-demand reference loading
├── skills/
│   ├── test-driven-development/
│   │   ├── SKILL.md                 # Lean TDD skill (110 lines)
│   │   ├── testing-anti-patterns.md
│   │   └── reference/               # Extracted reference content
│   │       ├── rationalizations.md
│   │       ├── examples.md
│   │       └── when-stuck.md
│   └── .../                         # 11 other workflow skills
└── tests/
    └── extension/workflow-monitor/   # 127 unit tests
```

## Development

```bash
# Run tests
npm test

# Run specific test file
npx vitest run tests/extension/workflow-monitor/heuristics.test.ts
```

## Attribution

Skill content adapted from [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent, licensed under MIT.

## License

MIT — see [LICENSE](LICENSE) for details.
