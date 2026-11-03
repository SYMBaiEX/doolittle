import type { LinkedProviderName } from "./types";

export function resolveLinkedProviderName(
  raw: string | undefined,
): LinkedProviderName | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value === "codex") {
    return "codex";
  }
  if (value === "elizacloud" || value === "eliza-cloud" || value === "cloud") {
    return "elizacloud";
  }
  if (value === "claude-code" || value === "claude" || value === "claudecode") {
    return "claude-code";
  }
  return undefined;
}
