import type {
  MediaGenerationOptions,
  MediaGenerationBundle as MediaGenerationResult,
  MediaModelContext,
  MediaSpeechOptions,
  MediaSpeechBundle as MediaSpeechResult,
} from "../types";

export interface MediaImageGenerationDependencies {
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string },
  ) => Promise<string>;
}

export interface MediaSpeechGenerationDependencies {
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string },
  ) => Promise<string>;
}

export interface MediaImageGenerationInput {
  outputDir: string;
  prompt: string;
  options?: MediaGenerationOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaImageGenerationDependencies;
}

export interface MediaSpeechGenerationInput {
  outputDir: string;
  text: string;
  options?: MediaSpeechOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaSpeechGenerationDependencies;
}

export type { MediaGenerationResult, MediaSpeechResult };
