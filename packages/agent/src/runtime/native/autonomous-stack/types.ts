type OnboardingConnection =
  | { kind: "cloud-managed"; smallModel?: string; largeModel?: string }
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
