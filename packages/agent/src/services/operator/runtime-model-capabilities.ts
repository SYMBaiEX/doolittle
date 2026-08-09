import { type IAgentRuntime, ModelType } from "@elizaos/core";

export type RuntimeModelCapabilityId =
  | "chat"
  | "research"
  | "image"
  | "speech"
  | "transcription";

export interface RuntimeModelCapability {
  id: RuntimeModelCapabilityId;
  label: string;
  modelType: string;
  handlerRegistered: boolean;
  state: "available" | "unavailable";
  detail: string;
}

const MODEL_CAPABILITIES: Array<
  Omit<RuntimeModelCapability, "handlerRegistered" | "state" | "detail">
> = [
  { id: "chat", label: "Chat", modelType: ModelType.TEXT_LARGE },
  { id: "research", label: "Research", modelType: ModelType.RESEARCH },
  { id: "image", label: "Image generation", modelType: ModelType.IMAGE },
  {
    id: "speech",
    label: "Text to speech",
    modelType: ModelType.TEXT_TO_SPEECH,
  },
  {
    id: "transcription",
    label: "Transcription",
    modelType: ModelType.TRANSCRIPTION,
  },
];

/**
 * Capability truth comes from Eliza's resolved model handler registry. This
 * intentionally makes no claim about which configured provider owns a handler:
 * provider catalog readiness and runtime capability readiness are separate.
 */
export function listRuntimeModelCapabilities(
  runtime: Pick<IAgentRuntime, "getModel">,
): RuntimeModelCapability[] {
  return MODEL_CAPABILITIES.map((capability) => {
    let handlerRegistered = false;
    try {
      handlerRegistered = Boolean(runtime.getModel(capability.modelType));
    } catch {
      handlerRegistered = false;
    }
    return {
      ...capability,
      handlerRegistered,
      state: handlerRegistered ? "available" : "unavailable",
      detail: handlerRegistered
        ? `An Eliza ${capability.modelType} handler is registered.`
        : `No Eliza ${capability.modelType} handler is registered.`,
    };
  });
}
