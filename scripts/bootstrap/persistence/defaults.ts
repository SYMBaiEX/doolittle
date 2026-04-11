import { existsSync, readFileSync } from "node:fs";
import { RUN_DEPTH_ITERATION_PRESETS } from "../../../packages/agent/src/types";
import type { GatewayConfig, PairingMode, RuntimeSettings } from "../types";

export const REMOTE_TRANSPORTS = [
  "telegram",
  "discord",
  "slack",
  "whatsapp",
  "signal",
  "matrix",
  "email",
  "sms",
  "mattermost",
  "homeassistant",
  "dingtalk",
] as const satisfies ReadonlyArray<keyof GatewayConfig["platforms"]>;

export function createDefaultSettings(
  theme: RuntimeSettings["ui"]["theme"],
): RuntimeSettings {
  return {
    model: {
      provider: "openai",
      model: "gpt-5.4",
      baseUrl: "https://api.openai.com/v1",
      temperature: 0.4,
      maxTokens: 1200,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      remoteSyncMode: "mirror",
      remoteSyncInclude: ["**/*"],
      remoteSyncExclude: [
        ".git",
        ".doolittle",
        "node_modules",
        "dist",
        "coverage",
        ".cache",
        ".turbo",
        ".DS_Store",
      ],
      remoteArtifactPaths: [
        ".doolittle/remote-artifacts",
        ".doolittle/trajectories",
        ".doolittle/cron-output",
      ],
      remoteArtifactPolicy: "metadata-only",
      remoteWorkspaceLabel: "doolittle-workspace",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: [
        "PATH",
        "HOME",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
      ],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 10_000,
    },
    agent: {
      runDepth: "standard",
      maxIterations: RUN_DEPTH_ITERATION_PRESETS.standard,
      toolProgressMode: "new",
    },
    ui: {
      theme,
    },
  };
}

export function loadBootstrapSettings(
  settingsPath: string,
  theme: RuntimeSettings["ui"]["theme"],
): RuntimeSettings {
  if (!existsSync(settingsPath)) {
    return createDefaultSettings(theme);
  }
  try {
    const current = JSON.parse(
      readFileSync(settingsPath, "utf8"),
    ) as RuntimeSettings;
    const defaults = createDefaultSettings(theme);
    return {
      ...defaults,
      ...current,
      model: { ...defaults.model, ...current.model },
      gateway: { ...defaults.gateway, ...current.gateway },
      execution: { ...defaults.execution, ...current.execution },
      mcp: { ...defaults.mcp, ...current.mcp },
      agent: { ...defaults.agent, ...current.agent },
      ui: { ...defaults.ui, ...current.ui },
    };
  } catch {
    return createDefaultSettings(theme);
  }
}

export function createDefaultGatewayConfig(
  allowAllUsers: boolean,
  pairingMode: PairingMode,
): GatewayConfig {
  const config: GatewayConfig = {
    allowAllUsers,
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
    platforms: {},
  };

  for (const platform of [
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
    "mattermost",
    "homeassistant",
    "dingtalk",
  ] as const) {
    config.platforms[platform] = {
      enabled: platform === "api" || platform === "cli",
      allowedUserIds: [],
      pairingMode:
        platform === "api" || platform === "cli" ? "allow" : pairingMode,
      allowAllUsers:
        platform === "api" || platform === "cli" ? true : undefined,
    };
  }

  return config;
}

export function loadBootstrapGatewayConfig(
  gatewayPath: string,
  allowAllUsers: boolean,
  pairingMode: PairingMode,
): GatewayConfig {
  const defaults = createDefaultGatewayConfig(allowAllUsers, pairingMode);
  if (!existsSync(gatewayPath)) {
    return defaults;
  }
  try {
    const current = JSON.parse(
      readFileSync(gatewayPath, "utf8"),
    ) as GatewayConfig;
    return {
      ...defaults,
      ...current,
      platforms: {
        ...defaults.platforms,
        ...(current.platforms ?? {}),
      },
    };
  } catch {
    return defaults;
  }
}
