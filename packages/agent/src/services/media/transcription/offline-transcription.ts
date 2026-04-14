import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export function applyOfflineTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): MediaTranscriptionState {
  if (state.transcriptText) {
    return state;
  }

  const { inspection } = transcription;

  return {
    ...state,
    transcriptText: [
      `Doolittle offline transcript for ${inspection.basename}.`,
      inspection.transcriptPreview
        ? `Transcript sidecar preview: ${inspection.transcriptPreview}`
        : undefined,
      inspection.captionPreview
        ? `Caption sidecar preview: ${inspection.captionPreview}`
        : undefined,
      inspection.detail,
    ]
      .filter(Boolean)
      .join("\n"),
    response: "Generated an offline transcript fallback.",
  };
}
