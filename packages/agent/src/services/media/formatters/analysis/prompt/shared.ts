import type { MediaInspection } from "../../../types";

export function buildAnalysisSignals(inspection: MediaInspection): string[] {
  return [
    `Kind: ${inspection.kind}`,
    `MIME: ${inspection.mimeType}`,
    `Exists: ${inspection.exists}`,
    `Size: ${inspection.sizeBytes}`,
    inspection.width && inspection.height
      ? `Dimensions: ${inspection.width}x${inspection.height}`
      : undefined,
    inspection.durationMs
      ? `Duration: ${Math.round(inspection.durationMs / 1000)}s`
      : undefined,
    inspection.pageCount ? `Pages: ${inspection.pageCount}` : undefined,
    inspection.title ? `Title: ${inspection.title}` : undefined,
    inspection.author ? `Author: ${inspection.author}` : undefined,
    inspection.transcriptPath
      ? `Transcript: ${inspection.transcriptPath}`
      : undefined,
    inspection.captionPath ? `Caption: ${inspection.captionPath}` : undefined,
  ].filter(Boolean) as string[];
}

export function resolveAnalysisFocusLabel(
  focus: "voice" | "vision" | "research",
): string {
  return focus === "voice"
    ? "voice or audio"
    : focus === "vision"
      ? "vision or image"
      : "research";
}

export function resolveAnalysisPreview(inspection: MediaInspection): string {
  return (
    inspection.transcriptPreview ??
    inspection.captionPreview ??
    inspection.textPreview ??
    inspection.detail
  );
}
