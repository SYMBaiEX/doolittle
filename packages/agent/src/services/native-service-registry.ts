export interface NativeServiceRegistry {
  officialBacked: string[];
  customEliza: string[];
  productOrchestration: string[];
}

export const DEFAULT_NATIVE_SERVICE_REGISTRY: NativeServiceRegistry = {
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

export function createNativeServiceRegistry(): NativeServiceRegistry {
  return {
    officialBacked: [...DEFAULT_NATIVE_SERVICE_REGISTRY.officialBacked],
    customEliza: [...DEFAULT_NATIVE_SERVICE_REGISTRY.customEliza],
    productOrchestration: [
      ...DEFAULT_NATIVE_SERVICE_REGISTRY.productOrchestration,
    ],
  };
}

export function describeNativeServiceRegistry(
  registry: NativeServiceRegistry,
): Array<{ group: string; services: string[]; count: number }> {
  return [
    {
      group: "officialBacked",
      services: registry.officialBacked,
      count: registry.officialBacked.length,
    },
    {
      group: "customEliza",
      services: registry.customEliza,
      count: registry.customEliza.length,
    },
    {
      group: "productOrchestration",
      services: registry.productOrchestration,
      count: registry.productOrchestration.length,
    },
  ];
}
