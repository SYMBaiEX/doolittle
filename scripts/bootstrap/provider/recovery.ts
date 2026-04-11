import type { LinkedProviderAccountsSnapshot } from "../../../packages/agent/src/runtime/native/account-auth/index";

export type CloudRecoveryChoice =
  | "retry"
  | "key"
  | "codex"
  | "claude-code"
  | "openai"
  | "anthropic"
  | "offline";

export interface CloudRecoveryOption {
  value: CloudRecoveryChoice;
  label: string;
  detail: string;
}

export function buildCloudRecoveryOptions(
  linkedAccounts: LinkedProviderAccountsSnapshot,
  openaiApiKey: string,
  anthropicApiKey: string,
): CloudRecoveryOption[] {
  const options: CloudRecoveryOption[] = [
    {
      value: "retry",
      label: "Retry Cloud login",
      detail: "Try the native Eliza Cloud browser login flow again right now.",
    },
    {
      value: "key",
      label: "Paste cloud key",
      detail: "Paste ELIZAOS_CLOUD_API_KEY manually if you already have it.",
    },
  ];

  if (linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable) {
    options.push({
      value: "codex",
      label: "Switch to Codex",
      detail:
        "Use the local ChatGPT/Codex specialist path for now instead of managed Cloud.",
    });
  }
  if (
    linkedAccounts.claudeCode.nativeReady ||
    linkedAccounts.claudeCode.reusable
  ) {
    options.push({
      value: "claude-code",
      label: "Switch to Claude Code",
      detail:
        "Use the local Claude Code specialist path for now instead of managed Cloud.",
    });
  }
  if (openaiApiKey.trim()) {
    options.push({
      value: "openai",
      label: "Switch to OpenAI API",
      detail: "Use the direct OpenAI API path for now.",
    });
  }
  if (anthropicApiKey.trim()) {
    options.push({
      value: "anthropic",
      label: "Switch to Anthropic API",
      detail: "Use the direct Anthropic API path for now.",
    });
  }
  options.push({
    value: "offline",
    label: "Leave the mind dormant",
    detail:
      "Do not silently switch providers. Finish onboarding and reconnect Cloud later.",
  });
  return options;
}
