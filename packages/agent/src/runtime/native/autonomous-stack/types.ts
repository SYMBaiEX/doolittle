type OnboardingConnection =
  | { kind: "cloud-managed"; smallModel?: string; largeModel?: string }
  | {
      kind: "remote-provider";
      provider?: string;
      remoteApiBase: string;
      primaryModel?: string;
    }
  | { kind: "local-provider"; provider: string; primaryModel?: string };

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
      subscriptionProvider?: string;
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
