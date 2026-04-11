import { writeFileSync } from "node:fs";
import { loadConfig } from "../../../packages/agent/src/config/env";
import { summarizeAutonomousConnection } from "../../../packages/agent/src/runtime/native/autonomous-stack";
import { buildNativeOnboardingMirror } from "../answers";
import { updateEnvFile } from "../core/env-file";
import type { BootstrapOptions, WizardAnswers } from "../types";
import { loadBootstrapGatewayConfig, loadBootstrapSettings } from "./defaults";
import { buildBootstrapPersistencePlan } from "./plan";
import type { BootstrapPersistencePaths } from "./types";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

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
  const nativeOnboarding = await buildNativeOnboardingMirror(
    answers,
    options.headless || options.skipWizard ? "cli" : "wizard",
  );
  if (nativeOnboarding.serialized) {
    writeJson(paths.nativeOnboardingPath, nativeOnboarding.serialized);
  }
  const nativeConnection = summarizeAutonomousConnection({
    ...loadConfig(),
    elizaCloudApiKey: answers.elizaCloudApiKey || undefined,
    elizaCloudEnabled:
      answers.provider === "elizacloud" && Boolean(answers.elizaCloudApiKey),
    elizaCloudSmallModel: answers.elizaCloudSmallModel,
    elizaCloudLargeModel: answers.elizaCloudModel,
    elizaCloudEmbeddingModel: answers.elizaCloudEmbeddingModel,
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
    nativeOnboarding,
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
    writeJson(paths.settingsPath, plan.settings);
    writeJson(paths.gatewayPath, plan.gateway);
    writeJson(paths.onboardingPath, plan.onboarding);
  }

  return {
    envMessages,
    settings: plan.settings,
    gateway: plan.gateway,
    onboarding: plan.onboarding,
  };
}
