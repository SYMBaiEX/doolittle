import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export async function applyAnthropicTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): Promise<MediaTranscriptionState> {
  const { dependencies, inspection, modelContext, prompt, signals } =
    transcription;

  if (
    state.transcriptText ||
    modelContext?.provider !== "anthropic" ||
    !modelContext.anthropicApiKey
  ) {
    return state;
  }

  try {
    return {
      transcriptText: await dependencies.requestModelText(
        prompt,
        modelContext,
        {
          focus: "voice",
          inspection,
          signals,
        },
      ),
      response: "Generated a best-effort provider-backed transcript summary.",
      source: "anthropic",
    };
  } catch (error) {
    return {
      ...state,
      response: error instanceof Error ? error.message : String(error),
    };
  }
}
