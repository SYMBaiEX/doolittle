import type { ProviderMode, WizardAnswers } from "../types";
import { readEnvBase } from "./base-env";

export function resolveHeadlessProviderMode(
  existingEnv: Map<string, string>,
): ProviderMode {
  return existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
    ? "elizacloud"
    : existingEnv.get("OPENAI_API_KEY")
      ? existingEnv.get("ANTHROPIC_API_KEY")
        ? "hybrid"
        : "openai"
      : existingEnv.get("ANTHROPIC_API_KEY") ||
          existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
          existingEnv.get("CLAUDE_CODE_SETUP_TOKEN")
        ? "anthropic"
        : existingEnv.get("DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH") === "true"
          ? "claude-code"
          : existingEnv.get("DOOLITTLE_USE_LINKED_CODEX_AUTH") === "true"
            ? "codex"
            : "offline";
}

export function createHeadlessAnswers(
  existingEnv: Map<string, string>,
): WizardAnswers {
  const base = readEnvBase(existingEnv);
  const provider = resolveHeadlessProviderMode(existingEnv);

  return {
    ...base,
    mode: "quick",
    provider,
    elizaCloudEnabled: existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true",
    useLinkedCodexAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CODEX_AUTH") === "true",
    useLinkedClaudeCodeAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH") === "true",
  };
}
