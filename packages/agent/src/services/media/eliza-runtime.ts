import { readFileSync } from "node:fs";
import type { IAgentRuntime, IMediaGenerationService } from "@elizaos/core";
import { isAudioStreamResult, ModelType, ServiceType } from "@elizaos/core";
import { isMediaAbort, raceMediaAbort, throwIfMediaAborted } from "./abort";
import type { MediaTranscriptionOptions } from "./types";

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
  signal?: AbortSignal,
): Promise<ElizaImageGenerationResult | undefined> {
  throwIfMediaAborted(signal);
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
        (await raceMediaAbort(
          Promise.resolve(
            mediaService.canGenerateMedia({ mediaType: "image" }),
          ),
          signal,
        ))
      ) {
        const result = await raceMediaAbort(
          mediaService.generateMedia({
            mediaType: "image",
            prompt,
            size,
          }),
          signal,
        );
        throwIfMediaAborted(signal);
        const url = result.imageUrl ?? result.url;
        if (result.imageBase64 || url) {
          return {
            base64: result.imageBase64,
            url,
          };
        }
      }
    } catch (error) {
      if (isMediaAbort(error, signal)) throw error;
      // Runtime model handlers are the official fallback when the media
      // service has no viable configured provider for this request.
    }
  }

  if (!hasModel(runtime, ModelType.IMAGE)) {
    return undefined;
  }

  const images = await raceMediaAbort(
    runtime.useModel(ModelType.IMAGE, {
      prompt,
      count: 1,
      size,
    }),
    signal,
  );
  throwIfMediaAborted(signal);
  const url = images[0]?.url;
  return url ? { url } : undefined;
}

export async function synthesizeSpeechWithEliza(
  runtime: IAgentRuntime | undefined,
  text: string,
  options: { voice: string; speed?: number; signal?: AbortSignal },
): Promise<Uint8Array | undefined> {
  throwIfMediaAborted(options.signal);
  if (!runtime || !hasModel(runtime, ModelType.TEXT_TO_SPEECH)) {
    return undefined;
  }

  const result = await raceMediaAbort(
    runtime.useModel(ModelType.TEXT_TO_SPEECH, {
      text,
      voice: options.voice,
      speed: options.speed,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
    options.signal,
  );
  throwIfMediaAborted(options.signal);

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
  options: Pick<
    MediaTranscriptionOptions,
    "language" | "prompt" | "signal"
  > = {},
): Promise<string | undefined> {
  if (!runtime || !hasModel(runtime, ModelType.TRANSCRIPTION)) {
    return undefined;
  }

  options.signal?.throwIfAborted();
  const audio = readFileSync(path);
  const transcript = await raceMediaAbort(
    runtime.useModel(
      ModelType.TRANSCRIPTION,
      // The official model contract carries its cancellation signal on the
      // parameter object. `audio` keeps Doolittle compatible with Eliza's local
      // and cloud transcription handlers, which accept in-memory audio bytes.
      {
        audio,
        language: options.language,
        prompt: options.prompt,
        signal: options.signal,
      } as never,
    ),
    options.signal,
  );
  options.signal?.throwIfAborted();
  const normalized = transcript.trim();
  return normalized || undefined;
}
