import type { LinkedProviderAccountsSnapshot } from "@doolittle/agent/runtime/native/account-auth";
import type { BootstrapWizardContext } from "../../bootstrap-context";
import { ask, askSecret, chooseOne } from "../../core/prompt-ops";
import type { PromptHandle } from "../../prompting/types";
import type { ProviderMode, WizardAnswers } from "../../types";
import { resolveInteractiveProviderDefault } from "../../wizard/state";
import { runClaudeCodeProviderBranch } from "./branches/claude-code";
import { runCodexProviderBranch } from "./branches/codex";
import { runDevinProviderBranch } from "./branches/devin";
import { runElizaCloudProviderBranch } from "./branches/eliza-cloud";
import type { ProviderSelectionState } from "./branches/state";

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
        value: "devin",
        label: "Devin SWE",
        detail:
          "Use the signed-in Devin CLI on this machine as my default SWE model path.",
      },
      {
        value: "ollama",
        label: "Local Ollama",
        detail:
          "Run local/self-hosted inference through Ollama with no cloud API key.",
      },
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
    useLinkedDevinAuth:
      existingEnv.get("DOOLITTLE_USE_LINKED_DEVIN_AUTH") === "true" ||
      Boolean(
        linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable,
      ),
    devinCliCommand: answers.devinCliCommand ?? "devin",
    devinModel: answers.devinModel ?? "swe-1-6-fast",
    devinTimeoutMs: answers.devinTimeoutMs ?? 120_000,
    elizaCloudApiKey: answers.elizaCloudApiKey,
    elizaCloudEnabled:
      existingEnv.get("ELIZAOS_CLOUD_ENABLED") === "true" ||
      Boolean(answers.elizaCloudApiKey),
    elizaCloudSmallModel: answers.elizaCloudSmallModel,
    elizaCloudModel: answers.elizaCloudModel,
    elizaCloudEmbeddingModel: answers.elizaCloudEmbeddingModel,
    ollamaApiEndpoint: answers.ollamaApiEndpoint,
    ollamaSmallModel: answers.ollamaSmallModel,
    ollamaLargeModel: answers.ollamaLargeModel,
    ollamaEmbeddingModel: answers.ollamaEmbeddingModel,
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
    linkedAccounts.devin?.nativeReady ||
    linkedAccounts.devin?.reusable ||
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
      if (linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable) {
        context.info(
          "Devin is signed in locally, so I can use SWE model execution as the default mind.",
        );
      }
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
      selectedProvider === "devin" &&
      (linkedAccounts.devin?.nativeReady || linkedAccounts.devin?.reusable)
    ) {
      context.info(
        "Devin is already signed in locally, so I will carry that forward.",
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
  linkedAccounts = await runDevinProviderBranch({
    context,
    rl,
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
  if (state.provider === "ollama") {
    state.ollamaApiEndpoint = await ask(
      context,
      rl,
      "Which Ollama API endpoint should I use",
      state.ollamaApiEndpoint,
    );
    state.ollamaSmallModel = await ask(
      context,
      rl,
      "Which local small model should I use",
      state.ollamaSmallModel,
    );
    state.ollamaLargeModel = await ask(
      context,
      rl,
      "Which local large model should lead my first sessions",
      state.ollamaLargeModel,
    );
    state.ollamaEmbeddingModel = await ask(
      context,
      rl,
      "Which local embedding model should I use",
      state.ollamaEmbeddingModel,
    );
  }
  if (state.provider === "devin") {
    state.devinModel = await ask(
      context,
      rl,
      "Which Devin model should lead my first sessions",
      state.devinModel,
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
  answers.useLinkedDevinAuth = state.useLinkedDevinAuth;
  answers.devinCliCommand = state.devinCliCommand;
  answers.devinModel = state.devinModel;
  answers.devinTimeoutMs = state.devinTimeoutMs;
  answers.elizaCloudApiKey = state.elizaCloudApiKey;
  answers.elizaCloudEnabled = state.elizaCloudEnabled;
  answers.elizaCloudSmallModel = state.elizaCloudSmallModel;
  answers.elizaCloudModel = state.elizaCloudModel;
  answers.elizaCloudEmbeddingModel = state.elizaCloudEmbeddingModel;
  answers.ollamaApiEndpoint = state.ollamaApiEndpoint;
  answers.ollamaSmallModel = state.ollamaSmallModel;
  answers.ollamaLargeModel = state.ollamaLargeModel;
  answers.ollamaEmbeddingModel = state.ollamaEmbeddingModel;
  answers.anthropicApiKey = state.anthropicApiKey;
  answers.useLinkedClaudeCodeAuth = state.useLinkedClaudeCodeAuth;
  answers.claudeCodeCliFallback = state.claudeCodeCliFallback;
  answers.claudeCodeOauthToken = state.claudeCodeOauthToken;
  answers.anthropicModel = state.anthropicModel;

  return linkedAccounts;
}
