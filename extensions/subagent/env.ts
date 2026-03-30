const ALLOWED_PREFIXES = ["PI_", "NODE_", "NPM_", "NVM_", "LC_", "XDG_"];

const ALLOWED_EXPLICIT = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "TERM",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "EDITOR",
  "VISUAL",
  "SSH_AUTH_SOCK",
  "COLORTERM",
  "FORCE_COLOR",
  "NO_COLOR",
  "LANG",
  "LANGUAGE",
  // Windows: needed by pi to locate Git Bash (shell resolution)
  "ProgramFiles",
  "ProgramFiles(x86)",
  "AppData",
  "LOCALAPPDATA",
  "SystemRoot",
  "SystemDrive",
  "COMSPEC",
  "OS",
  "PROCESSOR_ARCHITECTURE",
]);

export function buildSubagentEnv(extra?: Record<string, string>): Record<string, string | undefined> {
  const filtered: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (ALLOWED_EXPLICIT.has(key) || ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
      filtered[key] = value;
    }
  }

  const passthrough = process.env.PI_SUBAGENT_ENV_PASSTHROUGH;
  if (passthrough) {
    for (const name of passthrough
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const val = process.env[name];
      if (val !== undefined) filtered[name] = val;
    }
  }

  if (extra) {
    Object.assign(filtered, extra);
  }

  return filtered;
}
