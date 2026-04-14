import { getLatestRuntimeLine } from "@/runtime/native/package-audit";
import type { DiagnosticCheck } from "@/types";
import type { ProviderOwnershipContext } from "../types";

export function buildProviderChecks(
  context: ProviderOwnershipContext,
): DiagnosticCheck[] {
  const {
    config,
    nativeWorkspacePath,
    linkedAccounts,
    normalizedCloudBaseUrl,
    cloudBaseUrlValidation,
    nativeAudit,
  } = context;

  return [
    {
      id: "native.workspace",
      status: nativeWorkspacePath ? "pass" : "warn",
      summary: "Native Eliza workspace packages",
      detail: nativeWorkspacePath,
    },
    {
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
    },
    {
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
    },
    {
      id: "provider.elizacloud-base-url",
      status: cloudBaseUrlValidation ? "warn" : "pass",
      summary: "Eliza Cloud API base URL",
      detail: cloudBaseUrlValidation
        ? `${cloudBaseUrlValidation} normalized=${normalizedCloudBaseUrl}`
        : `normalized=${normalizedCloudBaseUrl}`,
    },
    {
      id: "provider.elizacloud-embeddings",
      status:
        config.elizaCloudEnabled && config.elizaCloudEmbeddingModel
          ? "pass"
          : "warn",
      summary: "Eliza Cloud embedding route",
      detail: `model=${config.elizaCloudEmbeddingModel} url=${config.elizaCloudEmbeddingUrl ?? normalizedCloudBaseUrl} dimensions=${config.elizaCloudEmbeddingDimensions ?? "default"} apiKey=${config.elizaCloudEmbeddingApiKey ? "dedicated" : config.elizaCloudApiKey ? "shared-cloud-key" : "missing"}`,
    },
    {
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
    },
    {
      id: "native.runtime-line",
      status:
        nativeAudit.runtime.alpha === getLatestRuntimeLine().alpha
          ? "pass"
          : "warn",
      summary: "Alpha Eliza runtime line",
      detail: `alpha=${nativeAudit.runtime.alpha} latest=${nativeAudit.runtime.latest}`,
    },
    {
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
    },
  ];
}
