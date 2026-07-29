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
} from "./local-ollama";
import { normalizePlugin } from "./support";

export async function loadProviderPlugins(
  services: AppServices,
  config: EnvConfig,
): Promise<Plugin[]> {
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
    { createElizaCloudPlugin },
  ] = await Promise.all([
    import("@elizaos/plugin-sql"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex"),
    import("@elizaos/plugin-claude-code"),
    import("@elizaos/plugin-devin"),
    import("@elizaos/plugin-elizacloud"),
  ]);

  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
    createCodexPlugin({
      enabled: true,
      getStatus: () => getLinkedProviderAccountsSnapshot().codex,
      getCredentials: () => getLinkedCodexCredentials(),
      refreshCredentials: () => refreshLinkedCodexCredentials(),
    }),
    createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: config.claudeCodeCliFallback,
      getStatus: () => getLinkedProviderAccountsSnapshot().claudeCode,
      getCredentials: () => getLinkedClaudeCodeCredentials(),
      refreshCredentials: () => refreshLinkedClaudeCodeCredentials(),
    }),
    createDevinPlugin({
      enabled: true,
      command: config.devinCliCommand,
      model: config.devinModel,
      timeoutMs: config.devinTimeoutMs,
      getCwd: () => config.workspaceDir,
      getStatus: () => getLinkedProviderAccountsSnapshot().devin,
    }),
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
  ];

  if (config.ollamaApiEndpoint?.trim()) {
    const { default: ollamaPlugin } = await import("@elizaos/plugin-ollama");
    const normalizedOllamaPlugin = normalizePlugin(ollamaPlugin);
    providers.push(
      normalizedOllamaPlugin,
      createDoolittleOllamaUxPlugin(config),
    );
  }

  const optionalProviderImports: Promise<Plugin | null>[] = [];
  if (config.openAiApiKey) {
    optionalProviderImports.push(
      import("@elizaos/plugin-openai").then(({ openaiPlugin }) =>
        normalizePlugin(openaiPlugin),
      ),
    );
  }
  if (config.anthropicApiKey) {
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
