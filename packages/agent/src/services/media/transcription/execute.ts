import type { MediaTranscriptionBundle } from "../types";
import { applyAnthropicTranscription } from "./anthropic-transcription";
import { persistMediaTranscriptionArtifacts } from "./artifacts";
import { applyOfflineTranscription } from "./offline-transcription";
import { applyOpenAiTranscription } from "./openai-transcription";
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

  state = await applyOpenAiTranscription(state, transcription);
  state = applySidecarTranscription(state, transcription);
  state = await applyAnthropicTranscription(state, transcription);
  state = applyOfflineTranscription(state, transcription);

  return persistMediaTranscriptionArtifacts(transcription, state);
}
