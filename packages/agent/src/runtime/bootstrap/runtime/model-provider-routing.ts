import type { AgentRuntime } from "@elizaos/core";
import { isElizaTextGenerationModelType } from "@elizaos/provider-transport";

const PROVIDER_PLUGIN_NAMES: Readonly<Record<string, string>> = {
  anthropic: "anthropic",
  "claude-code": "@elizaos/plugin-claude-code",
  codex: "@elizaos/plugin-codex",
  devin: "@elizaos/plugin-devin",
  elizacloud: "@elizaos/plugin-elizacloud",
  ollama: "ollama",
  openai: "openai",
};

export function resolveModelProviderPlugin(input: {
  modelType: string;
  activeProvider: string;
  requestedProvider?: string;
}): string | undefined {
  if (input.requestedProvider) {
    return input.requestedProvider;
  }
  if (!isElizaTextGenerationModelType(input.modelType)) {
    return undefined;
  }
  return PROVIDER_PLUGIN_NAMES[input.activeProvider];
}

type RuntimeModelInvoker = (
  modelType: string,
  params: unknown,
  provider?: string,
) => Promise<unknown>;

export function installDynamicModelProviderRouting(
  runtime: AgentRuntime,
  getActiveProvider: () => string,
): void {
  const mutableRuntime = runtime as unknown as {
    useModel: RuntimeModelInvoker;
  };
  const originalUseModel = mutableRuntime.useModel.bind(mutableRuntime);

  mutableRuntime.useModel = (modelType, params, requestedProvider) =>
    originalUseModel(
      modelType,
      params,
      resolveModelProviderPlugin({
        modelType,
        activeProvider: getActiveProvider(),
        requestedProvider,
      }),
    );
}
