import { writeFileSync } from "node:fs";
import {
  buildMediaTranscriptionManifest,
  buildMediaTranscriptionReport,
} from "../formatters/transcription";
import type { MediaTranscriptionBundle } from "../types";
import type {
  MediaTranscriptionState,
  PreparedMediaTranscription,
} from "./types";

export function persistMediaTranscriptionArtifacts(
  transcription: PreparedMediaTranscription,
  state: MediaTranscriptionState,
): MediaTranscriptionBundle {
  const { bundle, inspection, modelContext, paths, prompt, signals } =
    transcription;
  const provider = modelContext?.provider ?? "offline";
  const model = modelContext?.model ?? "offline";

  writeFileSync(
    paths.transcriptPath,
    `${state.transcriptText.trim()}\n`,
    "utf8",
  );
  writeFileSync(
    paths.promptPath,
    [
      "# Transcription Prompt",
      "",
      `Source path: ${inspection.path}`,
      `Provider: ${provider}`,
      `Model: ${model}`,
      `Source: ${state.source}`,
      "",
      prompt,
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    paths.manifestPath,
    JSON.stringify(
      buildMediaTranscriptionManifest(
        new Date().toISOString(),
        prompt,
        state.transcriptText,
        state.source,
        provider,
        model,
        {
          transcriptPath: paths.transcriptPath,
          responsePath: paths.responsePath,
        },
        inspection,
        bundle,
        state.response,
      ),
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    paths.reportPath,
    buildMediaTranscriptionReport(
      inspection,
      prompt,
      state.transcriptText,
      state.response,
      bundle,
      signals,
      provider,
      model,
      state.source,
    ),
    "utf8",
  );

  return {
    inspection,
    bundle,
    prompt,
    transcriptText: state.transcriptText,
    transcriptPath: paths.transcriptPath,
    promptPath: paths.promptPath,
    manifestPath: paths.manifestPath,
    reportPath: paths.reportPath,
    responsePath: paths.responsePath,
    response: state.response,
    model,
    provider,
    source: state.source,
  };
}
