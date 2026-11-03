import {
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  type TextGenerationModelType,
} from "@elizaos/core";

/**
 * The complete text-generation surface currently defined by ElizaOS.
 *
 * Provider plugins and Doolittle's dynamic provider selector share this one
 * list so a new SDK model class cannot be registered by one layer while being
 * silently ignored by another.
 */
export const ELIZA_TEXT_GENERATION_MODEL_TYPES = [
  ModelType.TEXT_NANO,
  ModelType.TEXT_SMALL,
  ModelType.TEXT_MEDIUM,
  ModelType.TEXT_LARGE,
  ModelType.TEXT_MEGA,
  ModelType.RESPONSE_HANDLER,
  ModelType.ACTION_PLANNER,
  ModelType.TEXT_REASONING_SMALL,
  ModelType.TEXT_REASONING_LARGE,
  ModelType.TEXT_COMPLETION,
] as const satisfies readonly TextGenerationModelType[];

const ELIZA_TEXT_GENERATION_MODEL_TYPE_SET = new Set<string>(
  ELIZA_TEXT_GENERATION_MODEL_TYPES,
);

export function isElizaTextGenerationModelType(
  modelType: unknown,
): modelType is TextGenerationModelType {
  return ELIZA_TEXT_GENERATION_MODEL_TYPE_SET.has(String(modelType));
}

export type ElizaTextGenerationHandler = (
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  modelType: TextGenerationModelType,
) => Promise<string>;

export type ElizaTextGenerationModelHandlers = {
  [K in TextGenerationModelType]: (
    runtime: IAgentRuntime,
    params: GenerateTextParams,
  ) => Promise<string>;
};

/**
 * Register one provider implementation across Eliza's full text model surface.
 *
 * The selected model type is forwarded to providers that need tier-specific
 * behavior; providers with one transport can ignore it.
 */
export function createElizaTextGenerationModelHandlers(
  handler: ElizaTextGenerationHandler,
): ElizaTextGenerationModelHandlers {
  return Object.fromEntries(
    ELIZA_TEXT_GENERATION_MODEL_TYPES.map((modelType) => [
      modelType,
      (runtime: IAgentRuntime, params: GenerateTextParams) =>
        handler(runtime, params, modelType),
    ]),
  ) as ElizaTextGenerationModelHandlers;
}
