import {
  type GenerateTextParams,
  type IAgentRuntime,
  logger,
  ModelType,
  type PipelineHookContext,
  type Plugin,
  type TextGenerationModelType,
} from "@elizaos/core";
import type { EnvConfig } from "@/types/runtime";

type MutableRecord = Record<string, unknown>;

const OLLAMA_PROVIDER_NAME = "ollama";
const CAP_HOOK_ID = "doolittle-ollama-cap-model-budget";
const TIMING_HOOK_ID = "doolittle-ollama-timing";

const TEXT_MODEL_TOKEN_CAPS: Record<string, number> = {
  [ModelType.TEXT_NANO]: 96,
  [ModelType.RESPONSE_HANDLER]: 64,
  [ModelType.TEXT_SMALL]: 256,
  [ModelType.TEXT_MEDIUM]: 320,
  [ModelType.ACTION_PLANNER]: 160,
  [ModelType.TEXT_REASONING_SMALL]: 320,
  [ModelType.TEXT_LARGE]: 640,
  [ModelType.TEXT_COMPLETION]: 640,
  [ModelType.TEXT_REASONING_LARGE]: 768,
  [ModelType.TEXT_MEGA]: 1024,
};

function isRecord(value: unknown): value is MutableRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberFromRecord(
  record: MutableRecord,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function runtimeSetting(
  runtime: IAgentRuntime,
  key: string,
  fallback: string,
): string {
  const value = runtime.getSetting(key);
  return typeof value === "string" && value.trim() ? value : fallback;
}

function textFromParams(params: unknown): string {
  if (typeof params === "string") {
    return params;
  }
  if (!isRecord(params)) {
    return "";
  }
  if (typeof params.prompt === "string") {
    return params.prompt;
  }
  if (typeof params.text === "string") {
    return params.text;
  }
  if (typeof params.input === "string") {
    return params.input;
  }
  return "";
}

function maxPredictForType(
  config: EnvConfig,
  modelType: string,
  requestedMaxTokens?: number,
): number | undefined {
  const cap = TEXT_MODEL_TOKEN_CAPS[modelType];
  if (!cap) {
    return undefined;
  }

  const requested = Math.max(
    1,
    Math.floor(requestedMaxTokens ?? config.openAiMaxTokens),
  );
  return Math.min(requested, cap);
}

function capOllamaTextBudget(
  config: EnvConfig,
  modelType: string,
  params: unknown,
): void {
  if (!isRecord(params)) {
    return;
  }

  const cappedMaxTokens = maxPredictForType(
    config,
    modelType,
    numberFromRecord(params, "maxTokens"),
  );
  if (cappedMaxTokens !== undefined) {
    params.maxTokens = cappedMaxTokens;
  }
}

function shouldTraceOllama(runtime: IAgentRuntime): boolean {
  const raw =
    runtime.getSetting("DOOLITTLE_OLLAMA_TRACE") ??
    process.env.DOOLITTLE_OLLAMA_TRACE;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return true;
  }
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function modelForType(
  runtime: IAgentRuntime,
  config: EnvConfig,
  modelType: string,
): string {
  const small = runtimeSetting(
    runtime,
    "OLLAMA_SMALL_MODEL",
    config.ollamaSmallModel,
  );
  const medium = runtimeSetting(runtime, "OLLAMA_MEDIUM_MODEL", small);
  const large = runtimeSetting(
    runtime,
    "OLLAMA_LARGE_MODEL",
    config.ollamaLargeModel,
  );
  const nano = runtimeSetting(runtime, "OLLAMA_NANO_MODEL", small);
  const mega = runtimeSetting(runtime, "OLLAMA_MEGA_MODEL", large);
  const response = runtimeSetting(
    runtime,
    "OLLAMA_RESPONSE_HANDLER_MODEL",
    runtimeSetting(runtime, "OLLAMA_SHOULD_RESPOND_MODEL", nano),
  );
  const planner = runtimeSetting(
    runtime,
    "OLLAMA_ACTION_PLANNER_MODEL",
    runtimeSetting(runtime, "OLLAMA_PLANNER_MODEL", medium),
  );
  const embedding = runtimeSetting(
    runtime,
    "OLLAMA_EMBEDDING_MODEL",
    config.ollamaEmbeddingModel,
  );

  switch (modelType) {
    case ModelType.TEXT_NANO:
      return nano;
    case ModelType.RESPONSE_HANDLER:
      return response;
    case ModelType.TEXT_SMALL:
      return small;
    case ModelType.TEXT_MEDIUM:
    case ModelType.TEXT_REASONING_SMALL:
      return medium;
    case ModelType.ACTION_PLANNER:
      return planner;
    case ModelType.TEXT_MEGA:
      return mega;
    case ModelType.TEXT_EMBEDDING:
      return embedding;
    default:
      return large;
  }
}

function resultDimensions(result: unknown): number | undefined {
  return Array.isArray(result) &&
    result.every((value) => typeof value === "number")
    ? result.length
    : undefined;
}

function logOllamaTiming(
  runtime: IAgentRuntime,
  config: EnvConfig,
  ctx: Extract<PipelineHookContext, { phase: "post_model" }>,
): void {
  if (!shouldTraceOllama(runtime)) {
    return;
  }

  const params = isRecord(ctx.params) ? ctx.params : {};
  logger.info(
    {
      src: "doolittle:ollama",
      modelType: ctx.resolvedModelKey,
      requestedModelType: ctx.requestedModelType,
      model: modelForType(runtime, config, ctx.resolvedModelKey),
      promptChars: textFromParams(ctx.params).length,
      maxTokens: numberFromRecord(params, "maxTokens"),
      elapsedMs: ctx.durationMs,
      dimensions: resultDimensions(ctx.result.current),
    },
    "Ollama model call complete",
  );
}

function officialTextModel(
  modelType: TextGenerationModelType,
): (runtime: IAgentRuntime, params: GenerateTextParams) => Promise<string> {
  return (runtime, params) =>
    runtime.useModel(
      modelType,
      params,
      OLLAMA_PROVIDER_NAME,
    ) as Promise<string>;
}

export function createDoolittleOllamaUxPlugin(config: EnvConfig): Plugin {
  return {
    name: "doolittle-ollama-ux",
    description:
      "Doolittle UX hooks and compatibility model-slot bridges for the SDK Ollama plugin.",
    init: (_pluginConfig, runtime) => {
      runtime.unregisterPipelineHook(CAP_HOOK_ID);
      runtime.unregisterPipelineHook(TIMING_HOOK_ID);
      runtime.registerPipelineHook({
        id: CAP_HOOK_ID,
        phase: "pre_model",
        position: -100,
        mutatesPrimary: true,
        schedule: "serial",
        handler: (_runtime, ctx) => {
          if (
            ctx.phase !== "pre_model" ||
            ctx.provider !== OLLAMA_PROVIDER_NAME
          ) {
            return;
          }
          capOllamaTextBudget(config, ctx.resolvedModelKey, ctx.params);
        },
      });
      runtime.registerPipelineHook({
        id: TIMING_HOOK_ID,
        phase: "post_model",
        position: 100,
        mutatesPrimary: false,
        schedule: "concurrent",
        handler: (hookRuntime, ctx) => {
          if (
            ctx.phase !== "post_model" ||
            ctx.provider !== OLLAMA_PROVIDER_NAME
          ) {
            return;
          }
          logOllamaTiming(hookRuntime, config, ctx);
        },
      });
    },
    models: {
      [ModelType.TEXT_REASONING_SMALL]: officialTextModel(
        ModelType.TEXT_MEDIUM,
      ),
      [ModelType.TEXT_REASONING_LARGE]: officialTextModel(ModelType.TEXT_LARGE),
      [ModelType.TEXT_COMPLETION]: officialTextModel(ModelType.TEXT_LARGE),
    },
    priority: -10,
  };
}

export function createOllamaEmbeddingOnlyPlugin(ollamaPlugin: Plugin): Plugin {
  const embeddingHandler = ollamaPlugin.models?.[ModelType.TEXT_EMBEDDING];

  return {
    name: ollamaPlugin.name,
    description: "SDK Ollama embedding handler for non-Ollama text providers.",
    config: ollamaPlugin.config,
    init: ollamaPlugin.init,
    models: embeddingHandler
      ? {
          [ModelType.TEXT_EMBEDDING]: embeddingHandler,
        }
      : undefined,
  };
}
