import type { OnboardingConnection } from "@elizaos/autonomous/contracts/onboarding";

export interface AutonomousConnectionSummary {
  source: "provider-switch-config";
  configured: boolean;
  kind: OnboardingConnection["kind"] | "missing";
  provider: string | null;
  detail: string;
  primaryModel?: string;
  smallModel?: string;
  largeModel?: string;
  remoteApiBase?: string;
}

export interface AutonomousCompatConfig extends Record<string, unknown> {
  env: NodeJS.ProcessEnv;
  connectors: Record<string, unknown>;
  features: Record<string, { enabled: boolean }>;
  agents: {
    defaults: {
      model?: {
        primary: string;
      };
    };
  };
  cloud?: {
    enabled?: boolean;
    provider: "elizacloud";
    inferenceMode: "cloud";
    runtime: "cloud";
    apiKey?: string;
  };
  models?: {
    small?: string;
    large?: string;
  };
}

export interface AutonomousCompatSnapshot {
  env: NodeJS.ProcessEnv;
  config: AutonomousCompatConfig;
  connection: OnboardingConnection | null;
  pluginAutoEnable: {
    allow: string[];
    changes: unknown[];
  };
}
