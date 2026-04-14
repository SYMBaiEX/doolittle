import { getOnboardingProviderOption } from "@elizaos/autonomous/contracts/onboarding";
import type { EnvConfig } from "@/types/runtime";
import { buildAutonomousCompatSnapshot } from "./snapshot";
import type { AutonomousConnectionSummary } from "./types";

function summarizeCloudManagedConnection(
  smallModel?: string,
  largeModel?: string,
): AutonomousConnectionSummary {
  return {
    source: "provider-switch-config",
    configured: true,
    kind: "cloud-managed",
    provider: "elizacloud",
    detail: `cloud-managed via Eliza Cloud (${smallModel ?? "small-model-unset"} / ${largeModel ?? "large-model-unset"})`,
    smallModel,
    largeModel,
  };
}

function summarizeRemoteProviderConnection(
  provider: string | null | undefined,
  remoteApiBase: string,
  primaryModel?: string,
): AutonomousConnectionSummary {
  const providerLabel = provider
    ? (getOnboardingProviderOption(provider)?.name ?? provider)
    : "none";

  return {
    source: "provider-switch-config",
    configured: true,
    kind: "remote-provider",
    provider: provider ?? "remote",
    detail: `remote-provider via ${remoteApiBase} (local=${providerLabel}${primaryModel ? ` model=${primaryModel}` : ""})`,
    primaryModel,
    remoteApiBase,
  };
}

function summarizeLocalProviderConnection(
  provider: string,
  primaryModel?: string,
): AutonomousConnectionSummary {
  const providerLabel = getOnboardingProviderOption(provider)?.name ?? provider;

  return {
    source: "provider-switch-config",
    configured: true,
    kind: "local-provider",
    provider,
    detail: `local-provider via ${providerLabel}${primaryModel ? ` (${primaryModel})` : ""}`,
    primaryModel,
  };
}

export function summarizeAutonomousConnection(
  config?: EnvConfig,
): AutonomousConnectionSummary {
  const snapshot = buildAutonomousCompatSnapshot(config);
  if (!config) {
    return {
      source: "provider-switch-config",
      configured: false,
      kind: "missing",
      provider: null,
      detail:
        "No EnvConfig was supplied, so the native connection view could not be resolved.",
    };
  }

  const connection = snapshot?.connection;
  if (!connection) {
    return {
      source: "provider-switch-config",
      configured: false,
      kind: "missing",
      provider: null,
      detail:
        "No native cloud-managed, local-provider, or remote-provider connection could be derived from the current env.",
    };
  }

  if (connection.kind === "cloud-managed") {
    return summarizeCloudManagedConnection(
      connection.smallModel,
      connection.largeModel,
    );
  }

  if (connection.kind === "remote-provider") {
    return summarizeRemoteProviderConnection(
      connection.provider,
      connection.remoteApiBase,
      connection.primaryModel,
    );
  }

  return summarizeLocalProviderConnection(
    connection.provider,
    connection.primaryModel,
  );
}
