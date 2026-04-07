import { join } from "node:path";

export interface ServiceDirectoryConfig {
  dataDir: string;
  workspaceDir: string;
  gatewayDataDir: string;
  hooksDir: string;
  webDir?: string;
}

export interface ServiceDirectoryLayout {
  apiDir: string;
  workspaceDir: string;
  gatewayPairingDir: string;
  gatewaySessionDir: string;
  gatewayApprovalDir: string;
  gatewayDeliveryDir: string;
  autocoderDir: string;
  cronDir: string;
  hooksDir: string;
  delegationDir: string;
  terminalDir: string;
  webDir: string;
  mediaDir: string;
  trajectoriesDir: string;
  profilesDir: string;
  personalityDir: string;
  traitsDir: string;
  settingsDir: string;
}

export function createServiceDirectoryLayout(
  config: ServiceDirectoryConfig,
): ServiceDirectoryLayout {
  return {
    apiDir: join(config.dataDir, "api"),
    workspaceDir: config.workspaceDir,
    gatewayPairingDir: join(config.gatewayDataDir, "pairing"),
    gatewaySessionDir: join(config.gatewayDataDir, "sessions"),
    gatewayApprovalDir: join(config.gatewayDataDir, "approvals"),
    gatewayDeliveryDir: join(config.gatewayDataDir, "delivery"),
    autocoderDir: join(config.dataDir, "autocoder"),
    cronDir: join(config.dataDir, "cron"),
    delegationDir: join(config.dataDir, "delegation"),
    hooksDir: config.hooksDir,
    terminalDir: join(config.dataDir, "terminal"),
    webDir:
      (config as { webDir?: string }).webDir ?? join(config.dataDir, "web"),
    mediaDir: join(config.dataDir, "media"),
    trajectoriesDir: join(config.dataDir, "trajectories"),
    profilesDir: join(config.dataDir, "profiles"),
    personalityDir: config.dataDir,
    traitsDir: config.workspaceDir,
    settingsDir: config.dataDir,
  };
}
