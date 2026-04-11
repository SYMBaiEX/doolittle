import {
  createOnboardingStateMachine,
  getOnboardingSummary,
  isOnboardingComplete,
  OnboardingStep,
} from "@elizaos/core";
import type { WizardAnswers } from "../types";
import type { NativeOnboardingMirrorResult } from "./types";

export async function buildNativeOnboardingMirror(
  answers: WizardAnswers,
  runtimeMode: "cli" | "wizard",
): Promise<NativeOnboardingMirrorResult> {
  try {
    const machine = createOnboardingStateMachine({
      platform: "cli",
      mode: runtimeMode,
    });

    await machine.advanceStep({
      step: OnboardingStep.WELCOME,
      data: {
        acknowledged: true,
        userName: answers.agentName,
      },
    });

    await machine.advanceStep({
      step: OnboardingStep.RISK_ACK,
      data: {
        accepted: true,
        warningText:
          "Doolittle can inspect files, run tools, and connect managed or local providers.",
      },
    });

    const authInput =
      answers.provider === "offline"
        ? { method: "api_key" as const, provider: "offline", skip: true }
        : answers.elizaCloudApiKey
          ? {
              method: "api_key" as const,
              provider: "elizacloud",
              apiKey: answers.elizaCloudApiKey,
            }
          : answers.openaiApiKey
            ? {
                method: "api_key" as const,
                provider: answers.provider === "codex" ? "codex" : "openai",
                apiKey: answers.openaiApiKey,
              }
            : answers.anthropicApiKey
              ? {
                  method: "api_key" as const,
                  provider:
                    answers.provider === "claude-code"
                      ? "claude-code"
                      : "anthropic",
                  apiKey: answers.anthropicApiKey,
                }
              : answers.claudeCodeOauthToken
                ? {
                    method: "setup_token" as const,
                    provider: "claude-code",
                    setupToken: answers.claudeCodeOauthToken,
                  }
                : {
                    method: "api_key" as const,
                    provider: answers.provider,
                    skip: true,
                  };

    await machine.advanceStep({
      step: OnboardingStep.AUTH,
      data: authInput,
    });

    const channels: Array<{
      type: string;
      enabled: boolean;
      credentials?: Record<string, string>;
      settings?: Record<string, string | boolean | number>;
    }> = answers.transports.map((transport) => {
      let credentials: Record<string, string> | undefined;
      if (transport === "telegram" && answers.telegramBotToken) {
        credentials = { botToken: answers.telegramBotToken };
      } else if (transport === "discord" && answers.discordBotToken) {
        credentials = { botToken: answers.discordBotToken };
      } else if (
        transport === "slack" &&
        (answers.slackWebhookUrl || answers.slackSigningSecret)
      ) {
        credentials = {
          webhookUrl: answers.slackWebhookUrl,
          signingSecret: answers.slackSigningSecret,
        };
      } else if (
        transport === "homeassistant" &&
        (answers.homeAssistantUrl || answers.homeAssistantToken)
      ) {
        credentials = {
          url: answers.homeAssistantUrl,
          token: answers.homeAssistantToken,
        };
      }

      return {
        type: transport,
        enabled: true,
        credentials,
      };
    });

    await machine.advanceStep({
      step: OnboardingStep.CHANNELS,
      data: {
        channels,
        dmPolicy: {
          allowUnknownSenders: answers.allowAllUsers,
          requireApproval: answers.pairingMode === "pair",
        },
        skip: channels.length === 0,
      },
    });

    const skills = [
      ...(answers.tools.mcp ? ["mcp"] : []),
      ...(answers.tools.acp ? ["acp"] : []),
      ...(answers.tools.tts ? ["tts"] : []),
      ...(answers.tools.codegen ? ["codegen"] : []),
      `run-depth:${answers.runDepth}`,
      `tool-progress:${answers.toolProgressMode}`,
    ];

    await machine.advanceStep({
      step: OnboardingStep.SKILLS,
      data: {
        skills,
        install: [],
        preferences: {
          nodeManager: "bun",
        },
        skip: skills.length === 0,
      },
    });

    return {
      serialized: machine.toJSON(),
      complete: isOnboardingComplete(machine.getContext()),
      currentStep: machine.getCurrentStep(),
      summary: getOnboardingSummary(machine.getContext()),
    };
  } catch (error) {
    return {
      complete: false,
      currentStep: "ERROR",
      summary:
        error instanceof Error && error.message.trim()
          ? `Native onboarding mirror unavailable: ${error.message.trim()}`
          : "Native onboarding mirror unavailable.",
    };
  }
}
