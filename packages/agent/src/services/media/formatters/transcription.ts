import type {
  MediaBundle,
  MediaInspection,
  MediaTranscriptionBundle,
} from "../types";
import { formatOptionalMediaNumber, joinMediaLines } from "./utils";

export function buildMediaTranscriptionPrompt(
  inspection: MediaInspection,
  signals: string[],
  _options: {
    prompt?: string;
    language?: string;
  } = {},
): string {
  return joinMediaLines([
    "Create a concise Doolittle transcript or spoken-content summary for the attached media.",
    "Prefer exact transcription when the provider supports it; otherwise return a best-effort plain-text transcript.",
    "Keep the output readable and free of filler.",
    "",
    `Path: ${inspection.path}`,
    `Kind: ${inspection.kind}`,
    `MIME: ${inspection.mimeType}`,
    `Duration: ${
      formatOptionalMediaNumber(
        inspection.durationMs
          ? Math.round(inspection.durationMs / 1000)
          : undefined,
        "s",
      ) ?? "unknown"
    }`,
    inspection.transcriptPreview
      ? `Existing transcript sidecar preview: ${inspection.transcriptPreview}`
      : undefined,
    inspection.captionPreview
      ? `Existing caption sidecar preview: ${inspection.captionPreview}`
      : undefined,
    "",
    "Signals:",
    ...signals.map((signal) => `- ${signal}`),
  ]);
}

export function buildMediaTranscriptionManifest(
  createdAt: string,
  prompt: string,
  transcriptText: string,
  source: MediaTranscriptionBundle["source"],
  provider: string,
  model: string,
  paths: {
    transcriptPath: string;
    responsePath: string;
  },
  inspection?: MediaInspection,
  bundle?: MediaBundle,
  response?: string,
): {
  createdAt: string;
  inspection?: MediaInspection;
  bundle?: MediaBundle;
  prompt: string;
  transcriptText: string;
  transcriptPath: string;
  source: MediaTranscriptionBundle["source"];
  provider: string;
  model: string;
  responsePath: string;
  response?: string;
} {
  return {
    createdAt,
    inspection,
    bundle,
    prompt,
    transcriptText,
    transcriptPath: paths.transcriptPath,
    source,
    provider,
    model,
    responsePath: paths.responsePath,
    response,
  };
}

export function buildMediaTranscriptionReport(
  inspection: MediaInspection,
  prompt: string,
  transcriptText: string,
  response: string,
  bundle: MediaBundle,
  _signals: string[],
  provider: string,
  model: string,
  source: MediaTranscriptionBundle["source"],
): string {
  return [
    `# Transcription: ${inspection.basename}`,
    "",
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Source: ${source}`,
    `- Bundle manifest: ${bundle.manifestPath}`,
    `- Transcript artifact: ${inspection.transcriptPath ?? "none"}`,
    "",
    "## Transcript",
    transcriptText,
    "",
    "## Prompt",
    prompt,
    "",
    "## Response",
    response,
  ].join("\n");
}
