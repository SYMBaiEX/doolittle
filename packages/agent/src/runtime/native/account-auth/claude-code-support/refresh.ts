import { refreshOAuthCredentials } from "../oauth-refresh";
import type { LinkedClaudeCodeCredentials } from "../types";

const CLAUDE_CODE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_CODE_OAUTH_TOKEN_URL =
  "https://console.anthropic.com/v1/oauth/token";

export async function refreshClaudeOAuthCredentialsFromRecord(
  refreshToken: string,
  source: string,
  accountLabel?: string,
): Promise<LinkedClaudeCodeCredentials | undefined> {
  const refreshResponse = await refreshOAuthCredentials({
    tokenUrl: CLAUDE_CODE_OAUTH_TOKEN_URL,
    clientId: CLAUDE_CODE_CLIENT_ID,
    refreshToken,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "claude-cli/2.1.74 (external, cli)",
    },
  });
  if (!refreshResponse) {
    return undefined;
  }
  const refreshPayload = refreshResponse.rawPayload ?? {};
  const expiresInSeconds =
    typeof refreshPayload.expires_in === "number"
      ? (refreshPayload.expires_in as number)
      : 3600;

  const { accessToken } = refreshResponse;
  return {
    accessToken,
    refreshToken: refreshResponse.refreshToken || refreshToken,
    expiresAt: String(Date.now() + expiresInSeconds * 1000),
    accountLabel,
    authMode: "oauth",
    source,
  };
}
