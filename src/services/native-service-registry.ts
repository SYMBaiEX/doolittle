export interface NativeServiceRegistry {
  officialBacked: string[];
  customEliza: string[];
  productOrchestration: string[];
}

export function createNativeServiceRegistry(): NativeServiceRegistry {
  return {
    officialBacked: [
      "documents",
      "mcp",
      "acp",
      "web",
      "media",
      "userProfiles",
      "personalities",
      "skills",
      "skillSynthesis",
      "trajectories",
    ],
    customEliza: [
      "memory",
      "sessions",
      "cron",
      "workspace",
      "terminal",
      "repository",
      "gatewaySessions",
      "delivery",
      "pairing",
      "hooks",
      "contextFiles",
      "settings",
      "tools",
      "diagnostics",
    ],
    productOrchestration: ["operator", "gatewayConfig", "delegation"],
  };
}
