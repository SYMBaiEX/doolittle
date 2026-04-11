import type { getLinkedProviderAccountsSnapshot } from "../../../packages/agent/src/runtime/native/account-auth/index";
import type { ReviewResult, TransportName, WizardAnswers } from "../types";

export interface LinkedProviderReadiness {
  codex: boolean;
  claudeCode: boolean;
}

export function getLinkedProviderReadiness(
  linkedAccounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): LinkedProviderReadiness {
  return {
    codex: Boolean(
      linkedAccounts.codex.nativeReady || linkedAccounts.codex.reusable,
    ),
    claudeCode: Boolean(
      linkedAccounts.claudeCode.nativeReady ||
        linkedAccounts.claudeCode.reusable,
    ),
  };
}

export function applyProviderFallbacks(
  next: WizardAnswers,
  readiness: LinkedProviderReadiness,
  notices: string[],
): void {
  const cloudReady = Boolean(next.elizaCloudApiKey.trim());

  if (next.provider === "elizacloud" && !cloudReady) {
    next.provider = "offline";
    notices.push(
      "Eliza Cloud is still selected, but no managed cloud key is active yet. I left the mind dormant instead of silently switching you onto another provider.",
    );
  }

  if (
    next.provider === "openai" &&
    !next.openaiApiKey.trim() &&
    !next.useLinkedCodexAuth
  ) {
    if (readiness.codex) {
      next.provider = "codex";
      next.useLinkedCodexAuth = true;
      next.openaiModel = next.openaiModel || "gpt-5.4";
      notices.push(
        "No OPENAI_API_KEY was provided, so I switched the active mind to linked Codex.",
      );
    } else if (readiness.claudeCode) {
      next.provider = "claude-code";
      next.useLinkedClaudeCodeAuth = true;
      next.anthropicModel = next.anthropicModel || "claude-sonnet-4.6";
      notices.push(
        "OpenAI had no key, so I switched the active mind to linked Claude Code instead of leaving you with a silent boot.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "No OpenAI key or linked account was available, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (
    next.provider === "anthropic" &&
    !next.anthropicApiKey.trim() &&
    !next.useLinkedClaudeCodeAuth
  ) {
    if (readiness.claudeCode) {
      next.provider = "claude-code";
      next.useLinkedClaudeCodeAuth = true;
      notices.push(
        "No ANTHROPIC_API_KEY was provided, so I switched the active mind to linked Claude Code.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "No Anthropic key or linked Claude Code auth was available, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (
    next.provider === "codex" &&
    !next.useLinkedCodexAuth &&
    !readiness.codex
  ) {
    if (next.openaiApiKey.trim()) {
      next.provider = "openai";
      notices.push(
        "Codex was selected without linked auth, so I fell back to OpenAI API mode.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "Codex was selected without linked auth, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }

  if (
    next.provider === "claude-code" &&
    !next.useLinkedClaudeCodeAuth &&
    !next.claudeCodeOauthToken.trim() &&
    !next.claudeCodeCliFallback
  ) {
    if (next.anthropicApiKey.trim()) {
      next.provider = "anthropic";
      notices.push(
        "Claude Code was selected without native auth, so I fell back to Anthropic API mode.",
      );
    } else {
      next.provider = "offline";
      notices.push(
        "Claude Code was selected without native auth, so I left the mind dormant instead of writing a broken provider state.",
      );
    }
  }
}

export function pruneUnavailableTools(
  next: WizardAnswers,
  notices: string[],
): void {
  if (next.tools.mcp && !next.mcpServerCommand.trim()) {
    next.tools.mcp = false;
    notices.push("MCP stayed disabled because no server command was bound.");
  }

  if (next.tools.acp && !next.acpServerCommand.trim()) {
    next.tools.acp = false;
    notices.push(
      "ACP stayed disabled because no editor binding command was set.",
    );
  }

  if (
    next.tools.codegen &&
    !next.e2bApiKey.trim() &&
    !next.githubToken.trim()
  ) {
    next.tools.codegen = false;
    notices.push(
      "Codegen stayed disabled because neither E2B nor GitHub credentials were provided.",
    );
  }
}

export function pruneUnavailableTransports(
  next: WizardAnswers,
  notices: string[],
): void {
  const requiredTransportSecrets: Partial<Record<TransportName, boolean>> = {
    telegram: Boolean(next.telegramBotToken.trim()),
    discord: Boolean(next.discordBotToken.trim()),
    slack: Boolean(
      next.slackWebhookUrl.trim() && next.slackSigningSecret.trim(),
    ),
    homeassistant: Boolean(
      next.homeAssistantUrl.trim() && next.homeAssistantToken.trim(),
    ),
  };

  next.transports = next.transports.filter((transport) => {
    if (!(transport in requiredTransportSecrets)) {
      return true;
    }

    const ready = requiredTransportSecrets[transport];
    if (!ready) {
      notices.push(
        `${transport} was deselected because its required credentials were left blank.`,
      );
    }
    return Boolean(ready);
  });
}

export function reviewWizardAnswers(
  answers: WizardAnswers,
  linkedAccounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>,
): ReviewResult {
  const notices: string[] = [];
  const next: WizardAnswers = {
    ...answers,
    tools: { ...answers.tools },
    transports: [...answers.transports],
  };

  const readiness = getLinkedProviderReadiness(linkedAccounts);
  applyProviderFallbacks(next, readiness, notices);
  pruneUnavailableTools(next, notices);
  pruneUnavailableTransports(next, notices);

  return { answers: next, notices };
}
