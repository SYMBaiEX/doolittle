import type {
  GatewayConfig,
  OnboardingSummary,
  RuntimeSettings,
} from "../types";

export interface BootstrapPersistencePaths {
  envPath: string;
  settingsPath: string;
  gatewayPath: string;
  onboardingPath: string;
  nativeOnboardingPath: string;
}

export interface BootstrapPersistencePlan {
  envUpdates: Record<string, string | undefined>;
  settings: RuntimeSettings;
  gateway: GatewayConfig;
  onboarding: OnboardingSummary;
}
