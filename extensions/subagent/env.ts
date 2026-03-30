export function buildSubagentEnv(extra?: Record<string, string>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  if (extra) {
    Object.assign(env, extra);
  }

  return env;
}
