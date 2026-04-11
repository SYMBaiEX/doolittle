import type { NativeOnboardingMirrorResult } from "../answers";
import type {
  GatewayConfig,
  OnboardingSummary,
  RuntimeSettings,
  WizardAnswers,
} from "../types";
import { buildBootstrapEnvUpdates } from "./environment";
import { buildBootstrapGateway } from "./gateway";
import { buildBootstrapOnboardingSummary } from "./onboarding";
import { buildBootstrapSettings } from "./settings";

export interface BootstrapPersistencePlanArgs {
  answers: WizardAnswers;
  nativeOnboarding: NativeOnboardingMirrorResult;
  nativeConnection: {
    kind: string;
    provider: string | null;
    detail: string;
  };
  settings: RuntimeSettings;
  gateway: GatewayConfig;
  timestamp: string;
  mode: OnboardingSummary["mode"];
}

export function buildBootstrapPersistencePlan(
  args: BootstrapPersistencePlanArgs,
): {
  envUpdates: Record<string, string | undefined>;
  settings: RuntimeSettings;
  gateway: GatewayConfig;
  onboarding: OnboardingSummary;
} {
  return {
    envUpdates: buildBootstrapEnvUpdates(args.answers),
    settings: buildBootstrapSettings(args.settings, args.answers),
    gateway: buildBootstrapGateway(args.gateway, args.answers),
    onboarding: buildBootstrapOnboardingSummary(args),
  };
}
