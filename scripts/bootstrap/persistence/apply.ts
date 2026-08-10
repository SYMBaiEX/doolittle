import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { loadConfig } from "@/config/env";
import { summarizeAutonomousConnection } from "@/runtime/native/autonomous-stack";
import { updateEnvFile } from "../core/env-file";
import type { BootstrapOptions, WizardAnswers } from "../types";
import { loadBootstrapGatewayConfig, loadBootstrapSettings } from "./defaults";
import { buildBootstrapPersistencePlan } from "./plan";
import type { BootstrapPersistencePaths } from "./types";

export async function applyBootstrapAnswers(
  answers: WizardAnswers,
  paths: BootstrapPersistencePaths,
  options: Pick<BootstrapOptions, "checkOnly" | "headless" | "skipWizard">,
): Promise<{
  envMessages: string[];
  settings: ReturnType<typeof loadBootstrapSettings>;
  gateway: ReturnType<typeof loadBootstrapGatewayConfig>;
  onboarding: ReturnType<typeof buildBootstrapPersistencePlan>["onboarding"];
}> {
  const settings = loadBootstrapSettings(paths.settingsPath, answers.theme);
  const gateway = loadBootstrapGatewayConfig(
    paths.gatewayPath,
    answers.allowAllUsers,
    answers.pairingMode,
  );
  const nativeConnection = summarizeAutonomousConnection({
    ...loadConfig(),
    elizaCloudApiKey: answers.elizaCloudApiKey || undefined,
    elizaCloudEnabled:
      answers.provider === "elizacloud" && Boolean(answers.elizaCloudApiKey),
    elizaCloudSmallModel: answers.elizaCloudSmallModel,
    elizaCloudLargeModel: answers.elizaCloudModel,
    elizaCloudEmbeddingModel: answers.elizaCloudEmbeddingModel,
    ollamaApiEndpoint: answers.ollamaApiEndpoint,
    ollamaSmallModel: answers.ollamaSmallModel,
    ollamaLargeModel: answers.ollamaLargeModel,
    ollamaEmbeddingModel: answers.ollamaEmbeddingModel,
    openAiApiKey:
      answers.provider === "openai" || answers.provider === "hybrid"
        ? answers.openaiApiKey || undefined
        : undefined,
    useLinkedCodexAuth:
      answers.useLinkedCodexAuth ||
      answers.provider === "codex" ||
      answers.provider === "hybrid",
    openAiModel:
      answers.provider === "openai" ||
      answers.provider === "hybrid" ||
      answers.provider === "codex"
        ? answers.openaiModel
        : "gpt-5.4",
    useLinkedDevinAuth:
      answers.useLinkedDevinAuth || answers.provider === "devin",
    devinCliCommand: answers.devinCliCommand ?? "devin",
    devinModel: answers.devinModel ?? "swe-1-6-fast",
    devinTimeoutMs: answers.devinTimeoutMs ?? 120_000,
    anthropicApiKey:
      answers.provider === "anthropic" || answers.provider === "hybrid"
        ? answers.anthropicApiKey || undefined
        : undefined,
    useLinkedClaudeCodeAuth:
      answers.useLinkedClaudeCodeAuth ||
      answers.provider === "claude-code" ||
      answers.provider === "hybrid",
    claudeCodeCliFallback:
      answers.provider === "claude-code" && answers.claudeCodeCliFallback,
    anthropicLargeModel:
      answers.provider === "anthropic" ||
      answers.provider === "hybrid" ||
      answers.provider === "claude-code"
        ? answers.anthropicModel
        : "claude-sonnet-4.6",
    telegramBotToken: answers.telegramBotToken || undefined,
    discordBotToken: answers.discordBotToken || undefined,
  });

  const plan = buildBootstrapPersistencePlan({
    answers,
    nativeConnection,
    settings,
    gateway,
    timestamp: new Date().toISOString(),
    mode: options.headless || options.skipWizard ? "headless" : answers.mode,
  });

  const envMessages = updateEnvFile(plan.envUpdates, {
    envPath: paths.envPath,
    checkOnly: options.checkOnly,
  });

  if (!options.checkOnly) {
    writeJsonAtomicSync(paths.settingsPath, plan.settings);
    writeJsonAtomicSync(paths.gatewayPath, plan.gateway);
    writeJsonAtomicSync(paths.onboardingPath, plan.onboarding);
  }

  return {
    envMessages,
    settings: plan.settings,
    gateway: plan.gateway,
    onboarding: plan.onboarding,
  };
}
