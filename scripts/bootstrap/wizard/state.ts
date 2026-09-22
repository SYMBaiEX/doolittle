import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import type { LinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import { readEnvBase } from "../answers";
import type { WizardAnswers } from "../types";

export function resolveInteractiveProviderDefault(
  existingEnv: Map<string, string>,
): WizardAnswers["provider"] {
  return existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true"
    ? "elizacloud"
    : existingEnv.get("DOOLITTLE_USE_LINKED_CODEX_AUTH") === "true"
      ? "codex"
      : existingEnv.get("DOOLITTLE_USE_LINKED_DEVIN_AUTH") === "true"
        ? "devin"
        : existingEnv.get("ANTHROPIC_API_KEY")
          ? existingEnv.get("OPENAI_API_KEY")
            ? "hybrid"
            : "anthropic"
          : existingEnv.get("OPENAI_API_KEY")
            ? "openai"
            : existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
                existingEnv.get("CLAUDE_CODE_SETUP_TOKEN")
              ? "claude-code"
              : existingEnv.get("DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH") ===
                  "true"
                ? "claude-code"
                : "codex";
}

export function createInteractiveWizardAnswers(
  existingEnv: Map<string, string>,
  linkedAccounts: LinkedProviderAccountsSnapshot,
): WizardAnswers {
  const base = readEnvBase(existingEnv);
  const provider = resolveInteractiveProviderDefault(existingEnv);
  return {
    ...base,
    mode: "ritual",
    provider,
    openaiModel:
      provider === "codex" && !existingEnv.get("OPENAI_MODEL")
        ? DEFAULT_MODEL_ROUTE.model
        : base.openaiModel,
    elizaCloudEnabled:
      existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true" ||
      Boolean(base.elizaCloudApiKey),
    useLinkedCodexAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CODEX_AUTH") === "true" ||
      Boolean(linkedAccounts.codex.nativeReady),
    useLinkedDevinAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_DEVIN_AUTH") === "true" ||
      Boolean(
        linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable,
      ),
    useLinkedClaudeCodeAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH") === "true" ||
      Boolean(linkedAccounts.claudeCode.nativeReady),
  };
}
