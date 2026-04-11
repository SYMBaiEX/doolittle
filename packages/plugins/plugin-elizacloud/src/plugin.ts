import {
  Service as ElizaService,
  type IAgentRuntime,
  ModelType,
  type Plugin,
  type TextEmbeddingParams,
} from "@elizaos/core";
import { DEFAULT_ELIZA_CLOUD_BASE_URL } from "./constants";
import {
  runElizaCloudEmbeddingGeneration,
  runElizaCloudTextGeneration,
} from "./generation";
import type { ElizaCloudPluginOptions, ElizaCloudStatus } from "./types";

export function createElizaCloudPlugin(
  options: ElizaCloudPluginOptions,
): Plugin {
  const enableEmbeddings = options.enableEmbeddings ?? true;

  class ElizaCloudService extends ElizaService {
    static serviceType = "elizacloud";

    capabilityDescription =
      "Managed Eliza Cloud provider bridge for first-party ElizaOS inference.";

    static async start(runtime?: IAgentRuntime): Promise<ElizaCloudService> {
      return new ElizaCloudService(runtime);
    }

    async stop(): Promise<void> {}

    status(): ElizaCloudStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "elizacloud",
        upstreamProvider: "elizacloud",
        available: status.available,
        reusable: status.reusable,
        baseUrl: DEFAULT_ELIZA_CLOUD_BASE_URL,
        authMode: status.authMode ?? "api-key",
        source: status.source,
        detail: status.detail,
      };
    }

    async generateText(params: { prompt: string; maxTokens?: number }) {
      return runElizaCloudTextGeneration(
        this.runtime,
        params,
        options,
        ModelType.TEXT_LARGE,
      );
    }
  }

  return {
    name: "@elizaos/plugin-elizacloud",
    description:
      "Workspace-native Eliza Cloud plugin for managed cloud inference and account-aware runtime routing.",
    services: [ElizaCloudService],
    models: options.enabled
      ? {
          [ModelType.TEXT_SMALL]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_SMALL,
            ),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_LARGE,
            ),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_REASONING_SMALL,
            ),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_REASONING_LARGE,
            ),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runElizaCloudTextGeneration(
              runtime,
              params,
              options,
              ModelType.TEXT_COMPLETION,
            ),
          ...(enableEmbeddings
            ? {
                [ModelType.TEXT_EMBEDDING]: (
                  runtime: IAgentRuntime,
                  params: TextEmbeddingParams | string | null,
                ) => runElizaCloudEmbeddingGeneration(runtime, params, options),
              }
            : {}),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
