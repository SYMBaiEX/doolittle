import { readFileSync } from "node:fs";
import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export async function applyOpenAiTranscription(
  state: MediaTranscriptionState,
  transcription: PreparedMediaTranscription,
): Promise<MediaTranscriptionState> {
  const { inspection, modelContext, options, prompt } = transcription;

  if (
    state.transcriptText ||
    modelContext?.provider !== "openai" ||
    !modelContext.openAiApiKey ||
    !inspection.exists ||
    inspection.isDirectory
  ) {
    return state;
  }

  try {
    const fileBytes = readFileSync(inspection.path);
    const form = new FormData();

    form.append("model", modelContext.model);
    form.append(
      "file",
      new Blob([fileBytes], {
        type: inspection.mimeType || "application/octet-stream",
      }),
      inspection.basename,
    );

    if (options.language) {
      form.append("language", options.language);
    }

    form.append("prompt", options.prompt ?? prompt);

    const transcriptionResponse = await fetch(
      `${modelContext.baseUrl}/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${modelContext.openAiApiKey}`,
        },
        body: form,
      },
    );

    if (!transcriptionResponse.ok) {
      const body = await transcriptionResponse.text();
      throw new Error(
        `OpenAI transcription failed (${transcriptionResponse.status}): ${body}`,
      );
    }

    const data = (await transcriptionResponse.json()) as {
      text?: string;
    };
    const transcriptText = data.text?.trim() ?? "";

    return {
      transcriptText,
      response: transcriptText,
      source: "openai",
    };
  } catch (error) {
    return {
      ...state,
      response: error instanceof Error ? error.message : String(error),
    };
  }
}
