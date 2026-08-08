import { readFileSync } from "node:fs";
import type { IAgentRuntime, IMediaGenerationService } from "@elizaos/core";
import { isAudioStreamResult, ModelType, ServiceType } from "@elizaos/core";

export interface ElizaImageGenerationResult {
  base64?: string;
  url?: string;
}

function hasModel(runtime: IAgentRuntime, modelType: string): boolean {
  return (
    typeof runtime.getModel === "function" &&
    runtime.getModel(modelType) !== undefined
  );
}

export async function generateImageWithEliza(
  runtime: IAgentRuntime | undefined,
  prompt: string,
  size: string,
): Promise<ElizaImageGenerationResult | undefined> {
  if (!runtime) {
    return undefined;
  }

  if (typeof runtime.getService === "function") {
    try {
      const mediaService = runtime.getService<IMediaGenerationService>(
        ServiceType.MEDIA_GENERATION,
      );
      if (
        mediaService &&
        (await mediaService.canGenerateMedia({ mediaType: "image" }))
      ) {
        const result = await mediaService.generateMedia({
          mediaType: "image",
          prompt,
          size,
        });
        const url = result.imageUrl ?? result.url;
        if (result.imageBase64 || url) {
          return {
            base64: result.imageBase64,
            url,
          };
        }
      }
    } catch {
      // Runtime model handlers are the official fallback when the media
      // service has no viable configured provider for this request.
    }
  }

  if (!hasModel(runtime, ModelType.IMAGE)) {
    return undefined;
  }

  const images = await runtime.useModel(ModelType.IMAGE, {
    prompt,
    count: 1,
    size,
  });
  const url = images[0]?.url;
  return url ? { url } : undefined;
}

export async function synthesizeSpeechWithEliza(
  runtime: IAgentRuntime | undefined,
  text: string,
  options: { voice: string; speed?: number },
): Promise<Uint8Array | undefined> {
  if (!runtime || !hasModel(runtime, ModelType.TEXT_TO_SPEECH)) {
    return undefined;
  }

  const result = await runtime.useModel(ModelType.TEXT_TO_SPEECH, {
    text,
    voice: options.voice,
    speed: options.speed,
  });

  if (isAudioStreamResult(result)) {
    return result.bytes;
  }
  if (result instanceof Uint8Array) {
    return result;
  }
  if (result instanceof ArrayBuffer) {
    return new Uint8Array(result);
  }
  return undefined;
}

export async function transcribeWithEliza(
  runtime: IAgentRuntime | undefined,
  path: string,
): Promise<string | undefined> {
  if (!runtime || !hasModel(runtime, ModelType.TRANSCRIPTION)) {
    return undefined;
  }

  const transcript = await runtime.useModel(
    ModelType.TRANSCRIPTION,
    readFileSync(path),
  );
  const normalized = transcript.trim();
  return normalized || undefined;
}
