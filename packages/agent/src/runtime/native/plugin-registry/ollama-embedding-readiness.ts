import {
  type IAgentRuntime,
  ModelType,
  NoModelProviderConfiguredError,
  type Plugin,
} from "@elizaos/core";
import type { EnvConfig } from "@/types/runtime";
import { checkOllamaReadiness } from "./ollama-readiness";

function setting(runtime: IAgentRuntime, name: string, fallback: string) {
  const value = runtime.getSetting(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Registration, not a successful startup probe, enables the SDK embedding queue.
 * Omit an unavailable optional slot before registration so the SDK starts its
 * disabled embedding service rather than retrying every unembedded memory.
 * Text handlers remain intact. Recovery is an explicit clean runtime restart.
 */
export async function withOllamaEmbeddingStartupReadiness(
  plugin: Plugin,
  config: Pick<EnvConfig, "ollamaApiEndpoint" | "ollamaEmbeddingModel">,
): Promise<Plugin> {
  if (!plugin.models?.[ModelType.TEXT_EMBEDDING]) return plugin;
  const availability = await checkOllamaReadiness(
    config.ollamaApiEndpoint,
    config.ollamaEmbeddingModel,
  );
  if (availability.ready) return plugin;

  console.warn(
    `Semantic memory is unavailable: ${availability.detail} Optional Ollama embeddings are disabled for this runtime; text model handlers remain available. Restore the Ollama server and embedding model, then restart Doolittle to enable semantic memory.`,
  );
  return {
    ...plugin,
    models: Object.fromEntries(
      Object.entries(plugin.models).filter(
        ([key]) =>
          key !== ModelType.TEXT_EMBEDDING &&
          key !== ModelType.TEXT_EMBEDDING_BATCH,
      ),
    ),
  };
}

/**
 * Ollama is an optional local service, but the SDK probes every registered
 * embedding provider during core startup. An unavailable server must use the
 * SDK's no-provider path, not abort the entire CLI or invent semantic vectors.
 * Keep the real handler registered so starting Ollama restores embeddings.
 */
export function withOllamaEmbeddingReadiness(
  plugin: Plugin,
  config: Pick<EnvConfig, "ollamaApiEndpoint" | "ollamaEmbeddingModel">,
): Plugin {
  const embedding = plugin.models?.[ModelType.TEXT_EMBEDDING];
  if (!embedding) return plugin;

  const deferred = new WeakSet<IAgentRuntime>();
  const recovering = new WeakMap<IAgentRuntime, Promise<void>>();
  const unavailable = (runtime: IAgentRuntime, detail: string) => {
    const message = `Semantic memory is unavailable: ${detail} The shell remains available; chat requires a reachable selected provider. Use /model to check it.`;
    if (!deferred.has(runtime)) console.warn(message);
    deferred.add(runtime);
    return new NoModelProviderConfiguredError(message);
  };

  return {
    ...plugin,
    models: {
      ...plugin.models,
      [ModelType.TEXT_EMBEDDING]: async (runtime, params) => {
        const model = setting(
          runtime,
          "OLLAMA_EMBEDDING_MODEL",
          config.ollamaEmbeddingModel,
        );
        const availability = await checkOllamaReadiness(
          setting(runtime, "OLLAMA_API_ENDPOINT", config.ollamaApiEndpoint),
          model,
          runtime.fetch,
        );
        if (!availability.ready)
          throw unavailable(runtime, availability.detail);

        try {
          const vector = await embedding(runtime, params);
          // A deferred startup did not initialize the adapter's vector dimension.
          // Use the real result and public SDK adapter API before returning a
          // vector that a memory service could persist. Never guess dimensions.
          if (params !== null && deferred.has(runtime)) {
            if (!Array.isArray(vector) || vector.length === 0) {
              throw new Error("Ollama returned an invalid embedding vector.");
            }
            let recovery = recovering.get(runtime);
            if (!recovery) {
              recovery = runtime.adapter
                .ensureEmbeddingDimension(vector.length)
                .finally(() => {
                  recovering.delete(runtime);
                });
              recovering.set(runtime, recovery);
            }
            await recovery;
          }
          deferred.delete(runtime);
          return vector;
        } catch (error) {
          if (params !== null) throw error;
          throw unavailable(
            runtime,
            "Ollama could not initialize its embedding model. Check `ollama list` and the server logs, then retry.",
          );
        }
      },
    },
  };
}
