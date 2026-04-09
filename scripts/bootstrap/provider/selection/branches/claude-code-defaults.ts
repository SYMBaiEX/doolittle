import type { ProviderSelectionState } from "./state";

export function resolveClaudeCodeBondDefault(
  state: Pick<
    ProviderSelectionState,
    "claudeCodeCliFallback" | "claudeCodeOauthToken"
  >,
): "login" | "setup-token" | "local-cli-fallback" {
  if (state.claudeCodeCliFallback) {
    return "local-cli-fallback";
  }
  if (state.claudeCodeOauthToken) {
    return "setup-token";
  }
  return "login";
}
