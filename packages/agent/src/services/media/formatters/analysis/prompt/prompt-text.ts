import type { MediaBundle, MediaInspection } from "../../../types";

import {
  buildAnalysisSignals,
  resolveAnalysisFocusLabel,
  resolveAnalysisPreview,
} from "./shared";

export function buildMediaAnalysisPrompt(
  inspection: MediaInspection,
  bundle: MediaBundle,
  focus: "voice" | "vision" | "research",
): string {
  const kindLabel = resolveAnalysisFocusLabel(focus);
  const contentPreview = resolveAnalysisPreview(inspection);

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
    ...buildAnalysisSignals(inspection).map((signal) => `- ${signal}`),
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
