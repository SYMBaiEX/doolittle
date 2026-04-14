import { existsSync, readFileSync } from "node:fs";
import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export function applySidecarTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): MediaTranscriptionState {
  const { inspection } = transcription;

  if (
    state.transcriptText ||
    !inspection.transcriptPath ||
    !existsSync(inspection.transcriptPath)
  ) {
    return state;
  }

  return {
    transcriptText: readFileSync(inspection.transcriptPath, "utf8").trim(),
    response: `Used existing transcript sidecar at ${inspection.transcriptPath}.`,
    source: "sidecar",
  };
}
