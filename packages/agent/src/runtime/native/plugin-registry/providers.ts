import type { Plugin } from "@elizaos/core";
import type { ElizaCloudStatus } from "@elizaos/plugin-elizacloud";
import type { AppServices } from "../../../services";
import type { EnvConfig } from "../../../types/runtime";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedCodexCredentials,
  getLinkedElizaCloudCredentials,
  getLinkedProviderAccountsSnapshot,
  refreshLinkedClaudeCodeCredentials,
  refreshLinkedCodexCredentials,
} from "../account-auth";
import { normalizePlugin, shouldIncludeDirectProviderPlugin } from "./support";

export async function loadProviderPlugins(
  services: AppServices,
  config: EnvConfig,
): Promise<Plugin[]> {
  const selectedProvider = services.settings.get().model.provider;
  const enableCloudEmbeddings =
    Boolean(config.elizaCloudEmbeddingUrl?.trim()) ||
    Boolean(config.elizaCloudEmbeddingApiKey?.trim()) ||
    Boolean(config.elizaCloudEmbeddingDimensions) ||
    process.env.DOOLITTLE_EMBEDDING_PROVIDER?.trim().toLowerCase() ===
      "elizacloud";
  const [
    { default: sqlPlugin },
    { pdfPlugin },
    { createCodexPlugin },
    { createClaudeCodePlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-sql"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex"),
    import("@elizaos/plugin-claude-code"),
  ]);

  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
    createCodexPlugin({
      enabled: selectedProvider === "codex",
      getStatus: () => getLinkedProviderAccountsSnapshot().codex,
      getCredentials: () => getLinkedCodexCredentials(),
      refreshCredentials: () => refreshLinkedCodexCredentials(),
    }),
    createClaudeCodePlugin({
      enabled: selectedProvider === "claude-code",
      allowCliFallback: config.claudeCodeCliFallback,
      getStatus: () => getLinkedProviderAccountsSnapshot().claudeCode,
      getCredentials: () => getLinkedClaudeCodeCredentials(),
      refreshCredentials: () => refreshLinkedClaudeCodeCredentials(),
    }),
  ];

  if (selectedProvider === "elizacloud") {
    const { createElizaCloudPlugin } = await import(
      "@elizaos/plugin-elizacloud"
    );
    providers.push(
      createElizaCloudPlugin({
        enabled: true,
        enableEmbeddings: enableCloudEmbeddings,
        getStatus: (): ElizaCloudStatus => {
          const status = getLinkedProviderAccountsSnapshot().elizaCloud;
          return {
            provider: "elizacloud" as const,
            available: status.available,
            reusable: status.reusable,
            nativeReady: status.nativeReady,
            source: status.source,
            authMode: status.authMode,
            detail: status.detail,
          };
        },
        getCredentials: () => getLinkedElizaCloudCredentials(),
      }),
    );
  }

  const optionalProviderImports: Promise<Plugin | null>[] = [];
  if (
    config.openAiApiKey &&
    shouldIncludeDirectProviderPlugin(selectedProvider, "openai")
  ) {
    optionalProviderImports.push(
      import("@elizaos/plugin-openai").then(({ openaiPlugin }) =>
        normalizePlugin(openaiPlugin),
      ),
    );
  }
  if (
    config.anthropicApiKey &&
    shouldIncludeDirectProviderPlugin(selectedProvider, "anthropic")
  ) {
    optionalProviderImports.push(
      import("@elizaos/plugin-anthropic").then(({ default: anthropicPlugin }) =>
        normalizePlugin(anthropicPlugin),
      ),
    );
  }

  providers.push(
    ...(await Promise.all(optionalProviderImports)).filter(
      (plugin): plugin is Plugin => Boolean(plugin),
    ),
  );

  return providers;
}
