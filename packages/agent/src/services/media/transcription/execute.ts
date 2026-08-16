import type { MediaTranscriptionBundle } from "../types";
import { throwIfTranscriptionAborted } from "./abort";
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
  throwIfTranscriptionAborted(input.options?.signal);
  const transcription = prepareMediaTranscription(input);
  let state: MediaTranscriptionState = {
    transcriptText: "",
    response: "",
    source: "offline",
  };

  state = await applyElizaTranscription(state, transcription);
  throwIfTranscriptionAborted(transcription.options.signal);
  state = applySidecarTranscription(state, transcription);
  throwIfTranscriptionAborted(transcription.options.signal);
  state = await applyModelSummaryTranscription(state, transcription);
  throwIfTranscriptionAborted(transcription.options.signal);
  state = applyOfflineTranscription(state, transcription);
  throwIfTranscriptionAborted(transcription.options.signal);

  return persistMediaTranscriptionArtifacts(transcription, state);
}
