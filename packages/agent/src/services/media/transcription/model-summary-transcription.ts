import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export async function applyModelSummaryTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): Promise<MediaTranscriptionState> {
  const { dependencies, inspection, modelContext, prompt, signals } =
    transcription;

  if (
    state.transcriptText ||
    !modelContext ||
    modelContext.provider === "offline"
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
      response:
        "Generated a best-effort transcript summary through the selected Eliza text model.",
      source: "model-summary",
      provider: modelContext.provider,
      model: modelContext.model,
    };
  } catch (error) {
    return {
      ...state,
      response: error instanceof Error ? error.message : String(error),
    };
  }
}
