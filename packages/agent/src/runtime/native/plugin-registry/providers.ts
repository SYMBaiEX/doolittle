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
import {
  createDoolittleOllamaUxPlugin,
  createOllamaEmbeddingOnlyPlugin,
} from "./local-ollama";
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
    { createDevinPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-sql"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex"),
    import("@elizaos/plugin-claude-code"),
    import("@elizaos/plugin-devin"),
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
    createDevinPlugin({
      enabled: selectedProvider === "devin",
      command: config.devinCliCommand,
      model: config.devinModel,
      timeoutMs: config.devinTimeoutMs,
      cwd: config.workspaceDir,
      getStatus: () => getLinkedProviderAccountsSnapshot().devin,
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

  if (selectedProvider === "ollama") {
    const { default: ollamaPlugin } = await import("@elizaos/plugin-ollama");
    const normalizedOllamaPlugin = normalizePlugin(ollamaPlugin);
    providers.push(
      normalizedOllamaPlugin,
      createDoolittleOllamaUxPlugin(config),
    );
  }

  if (
    selectedProvider !== "ollama" &&
    !enableCloudEmbeddings &&
    config.ollamaApiEndpoint?.trim()
  ) {
    const { default: ollamaPlugin } = await import("@elizaos/plugin-ollama");
    providers.push(
      createOllamaEmbeddingOnlyPlugin(normalizePlugin(ollamaPlugin)),
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
