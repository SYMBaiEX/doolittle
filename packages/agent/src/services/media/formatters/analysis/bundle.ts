import type { MediaInspection } from "../../types";
import { listMediaLines } from "../utils";

export function buildMediaBundleManifest(
  createdAt: string,
  inspection: MediaInspection,
  relatedFiles: string[],
): {
  createdAt: string;
  inspection: MediaInspection;
  relatedFiles: string[];
} {
  return {
    createdAt,
    inspection,
    relatedFiles,
  };
}

export function buildMediaBundleReport(
  inspection: MediaInspection,
  relatedFiles: string[],
): string {
  return [
    `# Media Bundle`,
    "",
    `Path: ${inspection.path}`,
    `Kind: ${inspection.kind}`,
    `MIME: ${inspection.mimeType}`,
    `Exists: ${inspection.exists}`,
    `Size: ${inspection.sizeBytes}`,
    ...(inspection.width && inspection.height
      ? [`Dimensions: ${inspection.width}x${inspection.height}`]
      : []),
    ...(inspection.durationMs
      ? [`Duration: ${Math.round(inspection.durationMs / 1000)}s`]
      : []),
    ...(inspection.title ? [`Title: ${inspection.title}`] : []),
    ...(inspection.author ? [`Author: ${inspection.author}`] : []),
    ...(inspection.pageCount ? [`Pages: ${inspection.pageCount}`] : []),
    "",
    "## Sidecars",
    `- Transcript: ${inspection.transcriptPath ?? "none"}`,
    `- Caption: ${inspection.captionPath ?? "none"}`,
    "",
    "## Related Files",
    ...listMediaLines(relatedFiles),
    "",
    "## Preview",
    inspection.transcriptPreview ??
      inspection.captionPreview ??
      inspection.textPreview ??
      inspection.detail,
  ].join("\n");
}
