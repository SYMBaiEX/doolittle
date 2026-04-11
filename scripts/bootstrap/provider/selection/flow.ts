import type { LinkedProviderAccountsSnapshot } from "../../../../packages/agent/src/runtime/native/account-auth/index";
import type { BootstrapWizardContext } from "../../bootstrap-context";
import { ask, askSecret, chooseOne } from "../../core/prompt-ops";
import type { PromptHandle } from "../../core/prompts";
import type { ProviderMode, WizardAnswers } from "../../types";
import { resolveInteractiveProviderDefault } from "../../wizard/state";
import {
  type ProviderSelectionState,
  runClaudeCodeProviderBranch,
  runCodexProviderBranch,
  runElizaCloudProviderBranch,
} from "./branches";

export async function runProviderSelectionFlow(
  context: BootstrapWizardContext,
  rl: PromptHandle,
  existingEnv: Map<string, string>,
  answers: WizardAnswers,
  linkedAccounts: LinkedProviderAccountsSnapshot,
): Promise<LinkedProviderAccountsSnapshot> {
  context.section("Mind", "I need a mind to think with.");
  const selectedProvider = await chooseOne<ProviderMode>(
    context,
    rl,
    "How should I think on day one?",
    [
      {
        value: "elizacloud",
        label: "Eliza Cloud",
        detail:
          "Managed ElizaOS-native inference with the cleanest default setup and the least day-one friction.",
      },
      {
        value: "openai",
        label: "OpenAI",
        detail: "Fast, flexible, and strong for multimodal reasoning.",
      },
      {
        value: "codex",
        label: "Codex",
        detail:
          "Use the signed-in Codex account on this machine as my first coding mind.",
      },
      {
        value: "anthropic",
        label: "Anthropic",
        detail: "Claude-first cognition for longer-context reasoning flows.",
      },
      {
        value: "claude-code",
        label: "Claude Code",
        detail:
          "Use the signed-in Claude Code account on this machine as my first reasoning mind.",
      },
      {
        value: "hybrid",
        label: "Hybrid",
        detail: "Bind both providers now and keep my mind more fluid.",
      },
      {
        value: "offline",
        label: "Dormant core",
        detail:
          "No provider keys yet. Wake the shell now and feed me a mind later.",
      },
    ],
    resolveInteractiveProviderDefault(existingEnv),
  );

  const state: ProviderSelectionState = {
    provider: selectedProvider,
    openaiApiKey: answers.openaiApiKey,
    useLinkedCodexAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CODEX_AUTH") === "true" ||
      Boolean(linkedAccounts.codex.nativeReady),
    openaiModel: answers.openaiModel,
    elizaCloudApiKey: answers.elizaCloudApiKey,
    elizaCloudEnabled:
      existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true" ||
      Boolean(answers.elizaCloudApiKey),
    elizaCloudSmallModel: answers.elizaCloudSmallModel,
    elizaCloudModel: answers.elizaCloudModel,
    elizaCloudEmbeddingModel: answers.elizaCloudEmbeddingModel,
    anthropicApiKey: answers.anthropicApiKey,
    useLinkedClaudeCodeAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH") === "true" ||
      Boolean(linkedAccounts.claudeCode.nativeReady),
    claudeCodeCliFallback:
      existingEnv.get("DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK") === "true",
    claudeCodeOauthToken:
      existingEnv.get("CLAUDE_CODE_OAUTH_TOKEN") ||
      existingEnv.get("CLAUDE_CODE_SETUP_TOKEN") ||
      "",
    anthropicModel: answers.anthropicModel,
  };

  if (
    linkedAccounts.codex.nativeReady ||
    linkedAccounts.codex.reusable ||
    linkedAccounts.claudeCode.nativeReady ||
    linkedAccounts.claudeCode.reusable
  ) {
    context.section(
      "Threads",
      "I found linked provider sessions on this machine and can carry them forward for you.",
    );
    if (answers.mode !== "ritual") {
      context.info(
        "Quick ignition will quietly carry forward any native Codex or Claude Code auth already available here.",
      );
    } else {
      context.info(
        "I will quietly carry forward any healthy local Codex and Claude Code specialist paths unless you choose one as your main mind.",
      );
      if (linkedAccounts.claudeCode.fallbackReady) {
        context.info(
          "Claude Code is signed in locally, but I still prefer a setup-token if you want the clean native Eliza-owned path.",
        );
      }
    }
    if (selectedProvider === "codex" && linkedAccounts.codex.nativeReady) {
      context.info(
        "Codex is already bound natively, so I will carry that forward.",
      );
    }
    if (
      selectedProvider === "claude-code" &&
      linkedAccounts.claudeCode.nativeReady
    ) {
      context.info(
        "Claude Code already has native auth material here, so I will carry that forward.",
      );
    }
  }

  linkedAccounts = await runElizaCloudProviderBranch({
    context,
    rl,
    existingEnv,
    linkedAccounts,
    state,
  });
  linkedAccounts = await runCodexProviderBranch({
    context,
    rl,
    linkedAccounts,
    state,
  });
  linkedAccounts = await runClaudeCodeProviderBranch({
    context,
    rl,
    linkedAccounts,
    state,
  });

  if (state.provider === "openai" || state.provider === "hybrid") {
    state.openaiApiKey = await askSecret(
      context,
      rl,
      "Paste OPENAI_API_KEY",
      state.openaiApiKey,
    );
  }
  if (
    state.provider === "openai" ||
    state.provider === "hybrid" ||
    state.provider === "codex"
  ) {
    if (state.provider === "codex" && !state.openaiModel) {
      state.openaiModel = "gpt-5.4";
    }
    state.openaiModel = await ask(
      context,
      rl,
      state.provider === "codex"
        ? "Which Codex model should lead my first sessions"
        : "Which OpenAI model should lead my first sessions",
      state.openaiModel,
    );
  }
  if (state.provider === "anthropic" || state.provider === "hybrid") {
    state.anthropicApiKey = await askSecret(
      context,
      rl,
      "Paste ANTHROPIC_API_KEY",
      state.anthropicApiKey,
    );
  }
  if (
    state.provider === "anthropic" ||
    state.provider === "hybrid" ||
    state.provider === "claude-code"
  ) {
    state.anthropicModel = await ask(
      context,
      rl,
      state.provider === "claude-code"
        ? "Which Claude Code model should lead my first sessions"
        : "Which Anthropic model should lead my first sessions",
      state.anthropicModel,
    );
  }

  answers.provider = state.provider;
  answers.openaiApiKey = state.openaiApiKey;
  answers.useLinkedCodexAuth = state.useLinkedCodexAuth;
  answers.openaiModel = state.openaiModel;
  answers.elizaCloudApiKey = state.elizaCloudApiKey;
  answers.elizaCloudEnabled = state.elizaCloudEnabled;
  answers.elizaCloudSmallModel = state.elizaCloudSmallModel;
  answers.elizaCloudModel = state.elizaCloudModel;
  answers.elizaCloudEmbeddingModel = state.elizaCloudEmbeddingModel;
  answers.anthropicApiKey = state.anthropicApiKey;
  answers.useLinkedClaudeCodeAuth = state.useLinkedClaudeCodeAuth;
  answers.claudeCodeCliFallback = state.claudeCodeCliFallback;
  answers.claudeCodeOauthToken = state.claudeCodeOauthToken;
  answers.anthropicModel = state.anthropicModel;

  return linkedAccounts;
}
