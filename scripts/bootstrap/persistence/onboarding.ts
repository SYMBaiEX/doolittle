import { createHash } from "node:crypto";
import { loadConfig } from "../../../packages/agent/src/config/env";
import { summarizeAutonomousConnection } from "../../../packages/agent/src/runtime/native/autonomous-stack";
import type { NativeOnboardingMirrorResult } from "../answers";
import type { OnboardingSummary, WizardAnswers } from "../types";

function fingerprint(
  values: Record<string, string | boolean | string[]>,
): string {
  const stable = JSON.stringify(values, Object.keys(values).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 12);
}

export function buildBootstrapOnboardingSummary(args: {
  answers: WizardAnswers;
  nativeOnboarding: NativeOnboardingMirrorResult;
  nativeConnection: {
    kind: string;
    provider: string | null;
    detail: string;
  };
  timestamp: string;
  mode: OnboardingSummary["mode"];
}): OnboardingSummary {
  const { answers } = args;
  return {
    timestamp: args.timestamp,
    mode: args.mode,
    theme: answers.theme,
    provider: answers.provider,
    accounts: {
      elizaCloudLinked: Boolean(answers.elizaCloudApiKey),
      codexLinked: answers.useLinkedCodexAuth,
      claudeCodeLinked: answers.useLinkedClaudeCodeAuth,
    },
    backend: answers.backend,
    browser: answers.browser,
    agent: {
      runDepth: answers.runDepth,
      maxIterations: answers.maxIterations,
      toolProgressMode: answers.toolProgressMode,
    },
    transports: answers.transports,
    tools: answers.tools,
    nativeOnboarding: {
      complete: args.nativeOnboarding.complete,
      currentStep: args.nativeOnboarding.currentStep,
      summary: args.nativeOnboarding.summary,
    },
    nativeConnection: {
      kind: args.nativeConnection.kind,
      provider: args.nativeConnection.provider,
      detail: args.nativeConnection.detail,
    },
    profile: fingerprint({
      provider: answers.provider,
      backend: answers.backend,
      browser: answers.browser,
      theme: answers.theme,
      runDepth: answers.runDepth,
      maxIterations: String(answers.maxIterations),
      toolProgressMode: answers.toolProgressMode,
      transports: answers.transports,
      tts: answers.tools.tts,
      mcp: answers.tools.mcp,
      acp: answers.tools.acp,
      codegen: answers.tools.codegen,
    }),
  };
}

export { fingerprint };

export function buildAutonomousConnectionSummary() {
  return summarizeAutonomousConnection(loadConfig());
}
