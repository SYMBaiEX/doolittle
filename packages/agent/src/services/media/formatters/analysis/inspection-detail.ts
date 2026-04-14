import type { MediaInspection } from "../../types";

export type MediaInspectionDetailContext = {
  imageDimensions?: { width: number; height: number };
  audioMetadata?: { durationMs?: number };
  structuredMetadata?: {
    preview: string;
    lineCount?: number;
    wordCount?: number;
    pageCount?: number;
    title?: string;
    author?: string;
  };
};

export function formatMediaInspectionDetail(
  inspection: Pick<MediaInspection, "kind" | "mimeType">,
  context: MediaInspectionDetailContext = {},
  extension?: string,
): string {
  const { imageDimensions, audioMetadata, structuredMetadata } = context;
  return imageDimensions
    ? `Image file detected with dimensions ${imageDimensions.width}x${imageDimensions.height}.`
    : audioMetadata?.durationMs
      ? `Audio file detected with duration about ${Math.round(audioMetadata.durationMs / 1000)}s.`
      : structuredMetadata
        ? extension === ".pdf"
          ? `PDF detected${structuredMetadata.pageCount ? ` with about ${structuredMetadata.pageCount} pages` : ""}${structuredMetadata.title ? ` titled ${structuredMetadata.title}` : ""}.`
          : `Detected as ${inspection.kind} (${inspection.mimeType}) with ${structuredMetadata.wordCount} words across ${structuredMetadata.lineCount} lines.`
        : `Detected as ${inspection.kind} (${inspection.mimeType}).`;
}
