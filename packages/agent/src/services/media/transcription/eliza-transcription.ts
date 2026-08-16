import { ModelType } from "@elizaos/core";
import { isTranscriptionAbort } from "./abort";
import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export async function applyElizaTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): Promise<MediaTranscriptionState> {
  const { dependencies, inspection } = transcription;

  if (
    state.transcriptText ||
    !dependencies.requestTranscription ||
    !inspection.exists ||
    inspection.isDirectory
  ) {
    return state;
  }

  try {
    const transcriptText =
      (await dependencies.requestTranscription(inspection.path))?.trim() ?? "";
    if (!transcriptText) {
      return state;
    }
    return {
      transcriptText,
      response: "Generated through the Eliza runtime transcription model.",
      source: "eliza",
      provider: "eliza",
      model: ModelType.TRANSCRIPTION,
    };
  } catch (error) {
    if (isTranscriptionAbort(error, transcription.options.signal)) {
      throw error;
    }
    return {
      ...state,
      response: error instanceof Error ? error.message : String(error),
    };
  }
}
