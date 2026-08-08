import type { MediaTranscriptionBundle } from "../types";
import { persistMediaTranscriptionArtifacts } from "./artifacts";
import { applyElizaTranscription } from "./eliza-transcription";
import { applyModelSummaryTranscription } from "./model-summary-transcription";
import { applyOfflineTranscription } from "./offline-transcription";
import { prepareMediaTranscription } from "./preparation";
import { applySidecarTranscription } from "./sidecar-transcription";
import type {
  ExecuteMediaTranscriptionInput,
  MediaTranscriptionState,
} from "./types";

export async function executeMediaTranscription(
  input: ExecuteMediaTranscriptionInput,
): Promise<MediaTranscriptionBundle> {
  const transcription = prepareMediaTranscription(input);
  let state: MediaTranscriptionState = {
    transcriptText: "",
    response: "",
    source: "offline",
  };

  state = await applyElizaTranscription(state, transcription);
  state = applySidecarTranscription(state, transcription);
  state = await applyModelSummaryTranscription(state, transcription);
  state = applyOfflineTranscription(state, transcription);

  return persistMediaTranscriptionArtifacts(transcription, state);
}
