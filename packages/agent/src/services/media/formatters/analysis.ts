import type {
  MediaAnalysisBundle,
  MediaBundle,
  MediaInspection,
} from "../types";
import { listMediaLines } from "./utils";

type MediaInspectionDetailContext = {
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

export function buildMediaAnalysisManifest(
  createdAt: string,
  analysis: MediaAnalysisBundle,
  response: string,
  provider: string,
  model: string,
): {
  createdAt: string;
  analysis: MediaAnalysisBundle;
  response: string;
  provider: string;
  model: string;
} {
  return {
    createdAt,
    analysis,
    response,
    provider,
    model,
  };
}

export function buildMediaAnalysisReport(
  analysis: MediaAnalysisBundle,
  response: string,
  provider: string,
  model: string,
): string {
  return [
    `# Media Analysis: ${analysis.inspection.basename}`,
    "",
    `- Focus: ${analysis.focus}`,
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Bundle manifest: ${analysis.bundle.manifestPath}`,
    `- Bundle report: ${analysis.bundle.reportPath}`,
    "",
    "## Signals",
    ...listMediaLines(analysis.signals),
    "",
    "## Prompt",
    analysis.prompt,
    "",
    "## Response",
    response,
  ].join("\n");
}

export function buildMediaAnalysisPrompt(
  inspection: MediaInspection,
  bundle: MediaBundle,
  focus: "voice" | "vision" | "research",
): string {
  const kindLabel =
    focus === "voice"
      ? "voice or audio"
      : focus === "vision"
        ? "vision or image"
        : "research";
  const contentPreview =
    inspection.transcriptPreview ??
    inspection.captionPreview ??
    inspection.textPreview ??
    inspection.detail;

  return [
    `You are reviewing a ${kindLabel} artifact for Doolittle and should provide concise, actionable analysis.`,
    `Focus on the content's meaning, any missing context, and useful downstream actions.`,
    `Keep the response short and structured: summary, signals, recommendations.`,
    "",
    `Path: ${inspection.path}`,
    `Kind: ${inspection.kind}`,
    `MIME: ${inspection.mimeType}`,
    `Exists: ${inspection.exists}`,
    `Size bytes: ${inspection.sizeBytes}`,
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
      ? `Transcript sidecar: ${inspection.transcriptPath}`
      : undefined,
    inspection.captionPath
      ? `Caption sidecar: ${inspection.captionPath}`
      : undefined,
    "",
    "Signals:",
    ...analysisSignals(inspection).map((signal) => `- ${signal}`),
    "",
    "Bundle artifacts:",
    `- Manifest: ${bundle.manifestPath}`,
    `- Report: ${bundle.reportPath}`,
    "",
    "Related files:",
    ...(bundle.relatedFiles.length
      ? bundle.relatedFiles.map((entry) => `- ${entry}`)
      : ["- none"]),
    "",
    "Preview:",
    contentPreview.slice(0, 2400) || "(empty)",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function analysisSignals(inspection: MediaInspection): string[] {
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

export function buildMediaAnalysisResponseSummary(
  analysis: MediaAnalysisBundle,
  provider: string,
  model: string,
): string {
  return `Analysis completed for ${analysis.inspection.basename} using ${provider}/${model}.`;
}
