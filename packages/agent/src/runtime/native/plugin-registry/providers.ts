import type { Plugin } from "@elizaos/core";
import type { EnvConfig } from "../../../types/runtime";
import {
  getLinkedClaudeCodeCredentials,
  getLinkedProviderAccountsSnapshot,
  refreshLinkedClaudeCodeCredentials,
} from "../account-auth";
import { createDoolittleOllamaUxPlugin } from "./local-ollama";
import { normalizePlugin } from "./support";

export async function loadProviderPlugins(
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
    { codexCliPlugin },
    { createClaudeCodePlugin },
    { createDevinPlugin },
    { default: elizaCloudPlugin },
  ] = await Promise.all([
    import("@doolittle/plugin-sql-compat"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex-cli"),
    import("@doolittle/plugin-claude-code"),
    import("@doolittle/plugin-devin"),
    import("@elizaos/plugin-elizacloud"),
  ]);

  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
    normalizePlugin(codexCliPlugin),
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
    normalizePlugin({
      ...elizaCloudPlugin,
      models: enableCloudEmbeddings
        ? elizaCloudPlugin.models
        : Object.fromEntries(
            Object.entries(elizaCloudPlugin.models ?? {}).filter(
              ([modelType]) => !modelType.includes("EMBEDDING"),
            ),
          ),
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
