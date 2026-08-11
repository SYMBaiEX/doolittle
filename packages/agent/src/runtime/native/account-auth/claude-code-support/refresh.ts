import { refreshAnthropicToken } from "@elizaos/agent/auth/anthropic";
import type { LinkedClaudeCodeCredentials } from "../types";

export async function refreshClaudeOAuthCredentialsFromRecord(
  refreshToken: string,
  source: string,
  accountLabel?: string,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  let refreshed: Awaited<ReturnType<typeof refreshAnthropicToken>>;
  try {
    refreshed = await refreshAnthropicToken(refreshToken);
  } catch {
    return undefined;
  }

  if (
    typeof refreshed.access !== "string" ||
    !refreshed.access.trim() ||
    !Number.isFinite(refreshed.expires)
  ) {
    return undefined;
  }

  return {
    accessToken: refreshed.access,
    refreshToken:
      typeof refreshed.refresh === "string" && refreshed.refresh.trim()
        ? refreshed.refresh
        : refreshToken,
    expiresAt: String(refreshed.expires),
    accountLabel,
    authMode: "oauth",
    source,
  };
}
