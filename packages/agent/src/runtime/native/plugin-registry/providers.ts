import type { IAgentRuntime, Plugin } from "@elizaos/core";
import type { EnvConfig } from "../../../types/runtime";
import { refreshLinkedClaudeCodeCredentials } from "../account-auth";
import { getClaudeCodeAccountStatus } from "../account-auth/claude-code";
import { getDevinAccountStatus } from "../account-auth/devin";
import { createDoolittleCodexReasoningPlugin } from "./codex-reasoning";
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
    { default: anthropicPlugin },
    { createClaudeCodePlugin },
    { createDevinPlugin },
    { default: elizaCloudPlugin },
  ] = await Promise.all([
    import("@doolittle/plugin-sql-relationships"),
    import("@elizaos/plugin-pdf"),
    import("@elizaos/plugin-codex-cli"),
    import("@elizaos/plugin-anthropic"),
    import("@doolittle/plugin-claude-code"),
    import("@doolittle/plugin-devin"),
    import("@elizaos/plugin-elizacloud"),
  ]);

  const providers: Plugin[] = [
    normalizePlugin(sqlPlugin),
    normalizePlugin(pdfPlugin),
    createDoolittleCodexReasoningPlugin(normalizePlugin(codexCliPlugin)),
    normalizePlugin(anthropicPlugin),
    createClaudeCodePlugin({
      enabled: true,
      allowCliFallback: config.claudeCodeCliFallback,
      getStatus: () => getClaudeCodeAccountStatus(),
      refreshCredentials: () => refreshLinkedClaudeCodeCredentials(),
    }),
    createDevinPlugin({
      enabled: true,
      command: config.devinCliCommand,
      model: config.devinModel,
      timeoutMs: config.devinTimeoutMs,
      getCwd: () => config.workspaceDir,
      getStatus: () => getDevinAccountStatus(),
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
  // Direct API accounts are materialized into the process environment by the
  // official Eliza account-pool adapter before plugin assembly. Treat that
  // native credential path the same as an explicit config key so the OpenAI
  // plugin is registered even when the key never came from `.env`.
  if (config.openAiApiKey || process.env.OPENAI_API_KEY?.trim()) {
    optionalProviderImports.push(
      import("@elizaos/plugin-openai").then(({ openaiPlugin }) =>
        normalizePlugin(openaiPlugin),
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

/**
 * Hot-load providers whose credentials can arrive after runtime bootstrap.
 * Linked Anthropic is always registered; OpenAI is conditional because the
 * SDK plugin is only useful when a direct API credential is present.
 */
export async function ensureDoolittleDirectApiPlugins(
  runtime: Pick<IAgentRuntime, "plugins" | "registerPlugin">,
): Promise<void> {
  if (!process.env.OPENAI_API_KEY?.trim()) return;
  if (runtime.plugins.some((plugin) => plugin.name === "openai")) return;
  const { openaiPlugin } = await import("@elizaos/plugin-openai");
  await runtime.registerPlugin(normalizePlugin(openaiPlugin));
}
