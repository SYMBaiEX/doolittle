import type { MediaTextRequestMetadata } from "../types";

export function buildOfflineMediaTextResponse(
  prompt: string,
  metadata: MediaTextRequestMetadata,
): string {
  return [
    `Offline analysis for ${metadata.focus}.`,
    metadata.inspection ? `Kind: ${metadata.inspection.kind}` : undefined,
    metadata.inspection?.textPreview
      ? `Preview: ${metadata.inspection.textPreview}`
      : undefined,
    metadata.inspection?.transcriptPreview
      ? `Transcript: ${metadata.inspection.transcriptPreview}`
      : undefined,
    metadata.inspection?.captionPreview
      ? `Caption: ${metadata.inspection.captionPreview}`
      : undefined,
    ...(metadata.signals?.length
      ? [`Signals: ${metadata.signals.join("; ")}`]
      : []),
    "",
    prompt.slice(0, 1200),
  ]
    .filter(Boolean)
    .join("\n");
}
