import { summarizeTransportInventory } from "@/gateway/transport";
import { getLatestRuntimeLine } from "@/runtime/native/package-audit";
import type { DiagnosticCheck } from "@/types";
import type {
  GatewayTransportOverview,
  ProviderOwnershipContext,
} from "./types";

export function buildProviderOwnershipChecks(
  context: ProviderOwnershipContext,
  gatewayTransportOverview?: GatewayTransportOverview,
): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const {
    config,
    nativeWorkspacePath,
    nativeAudit,
    nativePlugins,
    linkedAccounts,
    normalizedCloudBaseUrl,
    cloudBaseUrlValidation,
    ecosystem,
    compatibility,
    workspaceEcosystem,
    ownership,
    formsControl,
    runtimeExecutionControl,
  } = context;
  const registrySnapshot = ecosystem?.registry;
  const skillCatalog = ecosystem?.skillCatalog;

  checks.push({
    id: "native.workspace",
    status: nativeWorkspacePath ? "pass" : "warn",
    summary: "Native Eliza workspace packages",
    detail: nativeWorkspacePath,
  });

  checks.push({
    id: "provider.configured",
    status:
      config.openAiApiKey ||
      config.anthropicApiKey ||
      linkedAccounts.elizaCloud.nativeReady ||
      linkedAccounts.elizaCloud.reusable ||
      linkedAccounts.codex.nativeReady ||
      linkedAccounts.claudeCode.nativeReady ||
      linkedAccounts.codex.reusable ||
      linkedAccounts.claudeCode.reusable
        ? "pass"
        : "warn",
    summary: "Model provider credentials",
    detail:
      config.openAiApiKey || config.anthropicApiKey
        ? "At least one provider key is present."
        : config.offlineBootstrapMode
          ? "Explicit offline bootstrap mode is enabled; runtime can answer without a live provider while onboarding."
          : linkedAccounts.elizaCloud.nativeReady ||
              linkedAccounts.elizaCloud.reusable
            ? "A managed Eliza Cloud account is available."
            : linkedAccounts.codex.nativeReady ||
                linkedAccounts.claudeCode.nativeReady
              ? "A native linked Codex or Claude Code account is available."
              : linkedAccounts.codex.reusable ||
                  linkedAccounts.claudeCode.reusable
                ? "A linked provider fallback path is available, but native auth may still need to be completed."
                : "No OpenAI, Anthropic, Eliza Cloud, Codex, or Claude Code provider credentials are configured, and explicit offline bootstrap mode is disabled.",
  });

  checks.push({
    id: "provider.linked-accounts",
    status:
      linkedAccounts.elizaCloud.nativeReady ||
      linkedAccounts.elizaCloud.reusable ||
      linkedAccounts.codex.nativeReady ||
      linkedAccounts.claudeCode.nativeReady ||
      linkedAccounts.codex.reusable ||
      linkedAccounts.claudeCode.reusable
        ? "pass"
        : "warn",
    summary: "Linked CLI account detection",
    detail: `elizacloud=${linkedAccounts.elizaCloud.nativeReady ? "native" : linkedAccounts.elizaCloud.available ? "detected" : "missing"} codex=${linkedAccounts.codex.nativeReady ? "native" : linkedAccounts.codex.available ? "detected" : "missing"} claudeCode=${linkedAccounts.claudeCode.nativeReady ? "native" : linkedAccounts.claudeCode.fallbackReady ? "fallback" : linkedAccounts.claudeCode.available ? "detected" : "missing"}`,
  });

  checks.push({
    id: "provider.elizacloud-base-url",
    status: cloudBaseUrlValidation ? "warn" : "pass",
    summary: "Eliza Cloud API base URL",
    detail: cloudBaseUrlValidation
      ? `${cloudBaseUrlValidation} normalized=${normalizedCloudBaseUrl}`
      : `normalized=${normalizedCloudBaseUrl}`,
  });

  checks.push({
    id: "provider.elizacloud-embeddings",
    status:
      config.elizaCloudEnabled && config.elizaCloudEmbeddingModel
        ? "pass"
        : "warn",
    summary: "Eliza Cloud embedding route",
    detail: `model=${config.elizaCloudEmbeddingModel} url=${config.elizaCloudEmbeddingUrl ?? normalizedCloudBaseUrl} dimensions=${config.elizaCloudEmbeddingDimensions ?? "default"} apiKey=${config.elizaCloudEmbeddingApiKey ? "dedicated" : config.elizaCloudApiKey ? "shared-cloud-key" : "missing"}`,
  });

  checks.push({
    id: "provider.embeddings-active",
    status:
      config.elizaCloudEmbeddingUrl ||
      config.elizaCloudEmbeddingApiKey ||
      config.elizaCloudEmbeddingDimensions
        ? "pass"
        : "warn",
    summary: "Active embedding provider",
    detail:
      config.elizaCloudEmbeddingUrl ||
      config.elizaCloudEmbeddingApiKey ||
      config.elizaCloudEmbeddingDimensions
        ? "Eliza Cloud embeddings are explicitly configured."
        : "Local embeddings are the active startup-safe default. Eliza Cloud embeddings stay optional unless explicitly configured.",
  });

  checks.push({
    id: "native.runtime-line",
    status:
      nativeAudit.runtime.alpha === getLatestRuntimeLine().alpha
        ? "pass"
        : "warn",
    summary: "Alpha Eliza runtime line",
    detail: `alpha=${nativeAudit.runtime.alpha} latest=${nativeAudit.runtime.latest}`,
  });

  checks.push({
    id: "native.package-alignment",
    status:
      nativeAudit.summary.alphaOnly > 0 ||
      nativeAudit.summary.laggingLatest > 0 ||
      nativeAudit.summary.workspaceOnly > 0 ||
      nativeAudit.summary.vendored > 0
        ? "warn"
        : "pass",
    summary: "Native package compatibility audit",
    detail: `aligned=${nativeAudit.summary.aligned} vendored=${nativeAudit.summary.vendored} alphaOnly=${nativeAudit.summary.alphaOnly} laggingLatest=${nativeAudit.summary.laggingLatest} workspaceOnly=${nativeAudit.summary.workspaceOnly}`,
  });

  checks.push({
    id: "ecosystem.registry",
    status: registrySnapshot?.available ? "pass" : "warn",
    summary: "ElizaOS registry snapshot",
    detail: registrySnapshot?.available
      ? `Registry snapshot available with ${registrySnapshot.total} entries and ${registrySnapshot.nonAppPlugins} non-app plugins.`
      : `Registry snapshot unavailable: ${registrySnapshot?.error ?? "unknown error"}`,
  });

  checks.push({
    id: "ecosystem.skills.catalog",
    status: skillCatalog?.available ? "pass" : "warn",
    summary: "ElizaOS skill catalog",
    detail: skillCatalog?.available
      ? `Skill catalog available with ${skillCatalog.total} cached skills.`
      : `Skill catalog unavailable: ${skillCatalog?.error ?? "unknown error"}`,
  });

  checks.push({
    id: "ecosystem.compatibility",
    status: compatibility
      ? compatibility.compatible
        ? "pass"
        : "warn"
      : "warn",
    summary: "ElizaOS plugin compatibility",
    detail: compatibility
      ? compatibility.compatible
        ? `All ${compatibility.checked} checked plugins are compatible with core ${compatibility.coreVersion}.`
        : `${compatibility.failures}/${compatibility.checked} plugins need attention for core ${compatibility.coreVersion}: ${compatibility.failing.map((entry) => entry.plugin).join(", ")}`
      : "Compatibility report unavailable.",
  });

  if (workspaceEcosystem) {
    checks.push({
      id: "ecosystem.workspace.benchmarks",
      status: workspaceEcosystem.benchmarkPacks > 0 ? "pass" : "warn",
      summary: "Benchmark workspace packs",
      detail: `benchmark packs=${workspaceEcosystem.benchmarkPacks}`,
    });
    checks.push({
      id: "ecosystem.workspace.distributions",
      status: workspaceEcosystem.distributionChannels > 0 ? "pass" : "warn",
      summary: "Distribution workspace channels",
      detail: `distribution channels=${workspaceEcosystem.distributionChannels}`,
    });
    checks.push({
      id: "ecosystem.workspace.modeling",
      status: workspaceEcosystem.modelingProfiles > 0 ? "pass" : "warn",
      summary: "Modeling workspace profiles",
      detail: `modeling profiles=${workspaceEcosystem.modelingProfiles}`,
    });
  }

  checks.push({
    id: "native.transport-mediation",
    status: nativePlugins.some((entry) => entry.category === "messaging")
      ? "pass"
      : "warn",
    summary: "Native messaging plugin mediation",
    detail: nativePlugins
      .filter((entry) => entry.category === "messaging")
      .map(
        (entry) =>
          `${entry.id}:${entry.enabled ? "enabled" : "disabled"}:${entry.source}`,
      )
      .join(", "),
  });

  if (ownership) {
    const controlPlane = ownership.transportControl;
    const pluginManager = ownership.pluginManager;
    const messagingBridge = controlPlane.messagingBridge;
    checks.push({
      id: "native.messaging.services",
      status: messagingBridge.some((entry) => entry.live) ? "pass" : "warn",
      summary: "Native messaging runtime services",
      detail: messagingBridge
        .map(
          (entry) =>
            `${entry.platform}:available=${entry.serviceAvailable}:live=${entry.live}:plugin=${entry.pluginId ?? "n/a"}`,
        )
        .join(", "),
    });
    checks.push({
      id: "native.messaging.control-plane",
      status: controlPlane.totals.operationalTransports > 0 ? "pass" : "warn",
      summary: "Native messaging control plane",
      detail: `configured=${controlPlane.totals.configured} gatewayEnabled=${controlPlane.totals.gatewayEnabled} enabled=${controlPlane.totals.enabledPlugins} available=${controlPlane.totals.availableServices} live=${controlPlane.totals.liveServices} operational=${controlPlane.totals.operationalTransports} official=${controlPlane.totals.officialPlugins} vendored=${controlPlane.totals.vendoredPlugins} custom=${controlPlane.totals.customTransports} product=${controlPlane.totals.productTransports}`,
    });
    checks.push({
      id: "native.plugin-manager",
      status: pluginManager?.summary.total ? "pass" : "warn",
      summary: "Native plugin manager summary",
      detail: pluginManager
        ? `total=${pluginManager.summary.total} enabled=${pluginManager.summary.enabled} official=${pluginManager.summary.official} vendored=${pluginManager.summary.vendored} categories=${pluginManager.summary.categories}`
        : "Plugin manager inventory unavailable.",
    });
    checks.push({
      id: "gateway.transport.inventory",
      status:
        controlPlane.transportInventory.filter((entry) => entry.operational)
          .length > 0
          ? "pass"
          : "warn",
      summary: "Gateway transport inventory",
      detail: summarizeTransportInventory(
        controlPlane.transportInventory,
        "diagnostics",
      ),
    });
    checks.push({
      id: "native.ownership.snapshot",
      status: ownership.serviceResolution.length > 0 ? "pass" : "warn",
      summary: "Native ownership control plane",
      detail: `serviceResolution=${ownership.serviceResolution.length} transportOperational=${controlPlane.totals.operationalTransports} pluginManagerEnabled=${pluginManager?.summary.enabled ?? 0}`,
    });
    if (gatewayTransportOverview) {
      checks.push({
        id: "gateway.transport.overview",
        status: gatewayTransportOverview.mismatchCount > 0 ? "warn" : "pass",
        summary: "Gateway transport overview",
        detail: `operational=${gatewayTransportOverview.operationalCount} mismatches=${gatewayTransportOverview.mismatchCount}; ${gatewayTransportOverview.details
          .map(
            (entry) =>
              `${entry.platform}:${entry.mismatchFlags.length ? entry.mismatchFlags.join("|") : "ok"}`,
          )
          .join(", ")}`,
      });
    }
  }

  if (formsControl) {
    checks.push({
      id: "native.forms",
      status: formsControl.available ? "pass" : "warn",
      summary: "Native forms ownership",
      detail: `available=${formsControl.available} templates=${formsControl.templates} total=${formsControl.forms.total} active=${formsControl.forms.active} persistence=${formsControl.persistenceAvailable}`,
    });
  }

  if (runtimeExecutionControl) {
    checks.push({
      id: "native.execution.e2b",
      status: runtimeExecutionControl.e2b.available ? "pass" : "warn",
      summary: "Native E2B sandbox ownership",
      detail: `available=${runtimeExecutionControl.e2b.available} sandboxes=${runtimeExecutionControl.e2b.sandboxes} execution=${runtimeExecutionControl.e2b.supportsExecution} root=${runtimeExecutionControl.e2b.sandboxRoot ?? "n/a"}`,
    });
    checks.push({
      id: "native.execution.codegen",
      status: runtimeExecutionControl.codeGeneration.ready ? "pass" : "warn",
      summary: "Native code generation ownership",
      detail: `available=${runtimeExecutionControl.codeGeneration.available} ready=${runtimeExecutionControl.codeGeneration.ready} methods=${runtimeExecutionControl.codeGeneration.methods.join(",") || "none"} github=${runtimeExecutionControl.github.available} secrets=${runtimeExecutionControl.secretsManager.available}`,
    });
  }

  return checks;
}
