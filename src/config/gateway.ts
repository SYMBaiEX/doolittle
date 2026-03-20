import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvConfig, GatewayConfig, PlatformName } from "@/types";

function basePlatformConfig() {
  return {
    enabled: false,
    allowedUserIds: [],
    pairingMode: "pair" as const,
  };
}

export function getDefaultGatewayConfig(config: EnvConfig): GatewayConfig {
  const platforms: PlatformName[] = [
    "api",
    "cli",
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "matrix",
    "email",
    "sms",
  ];

  const platformConfigs = {} as Record<PlatformName, GatewayConfig["platforms"][PlatformName]>;
  for (const platform of platforms) {
    platformConfigs[platform] = {
      ...basePlatformConfig(),
      enabled: platform === "api" || platform === "cli",
      allowAllUsers: platform === "api" || platform === "cli" ? true : undefined,
      pairingMode:
        platform === "api" || platform === "cli" ? "allow" : config.pairingDefaultMode,
    };
  }

  return {
    allowAllUsers: config.allowAllUsers,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: platformConfigs,
  };
}

export function loadGatewayConfig(config: EnvConfig): GatewayConfig {
  mkdirSync(config.gatewayDataDir, { recursive: true });
  const path = join(config.gatewayDataDir, "gateway.json");
  if (!existsSync(path)) {
    const defaults = getDefaultGatewayConfig(config);
    writeFileSync(path, JSON.stringify(defaults, null, 2), "utf8");
    return defaults;
  }

  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as GatewayConfig;
}

export function saveGatewayConfig(config: EnvConfig, gatewayConfig: GatewayConfig): void {
  mkdirSync(config.gatewayDataDir, { recursive: true });
  const path = join(config.gatewayDataDir, "gateway.json");
  writeFileSync(path, JSON.stringify(gatewayConfig, null, 2), "utf8");
}
