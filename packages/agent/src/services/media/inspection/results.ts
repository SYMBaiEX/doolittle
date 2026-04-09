import { basename } from "node:path";
import { formatMediaInspectionDetail } from "../formatters";
import type { MediaInspection } from "../types";
import {
  detectMediaKind,
  hashMediaFile,
  readMediaAudioMetadata,
  readMediaImageDimensions,
  readMediaPdfMetadata,
  readMediaSidecars,
  readMediaTextMetadata,
} from "./readers";

export function buildMissingMediaInspection(
  resolvedPath: string,
  extension: string,
  mimeType: string,
): MediaInspection {
  return {
    path: resolvedPath,
    basename: basename(resolvedPath),
    extension,
    sizeBytes: 0,
    kind: "unknown",
    mimeType,
    exists: false,
    isDirectory: false,
    detail: "Path does not exist.",
  };
}

export function buildDirectoryMediaInspection(
  resolvedPath: string,
  extension: string,
  sizeBytes: number,
): MediaInspection {
  return {
    path: resolvedPath,
    basename: basename(resolvedPath),
    extension,
    sizeBytes,
    kind: "unknown",
    mimeType: "inode/directory",
    exists: true,
    isDirectory: true,
    detail: "Path is a directory.",
  };
}

export function inspectResolvedMediaFile(input: {
  resolvedPath: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
}): MediaInspection {
  const kind = detectMediaKind(input.extension);
  const imageDimensions =
    kind === "image"
      ? readMediaImageDimensions(input.resolvedPath, input.extension)
      : undefined;
  const audioMetadata =
    kind === "audio"
      ? readMediaAudioMetadata(input.resolvedPath, input.extension)
      : undefined;
  const structuredMetadata =
    kind === "document"
      ? input.extension === ".pdf"
        ? readMediaPdfMetadata(input.resolvedPath)
        : readMediaTextMetadata(input.resolvedPath, input.extension)
      : undefined;
  const sidecars = readMediaSidecars(input.resolvedPath, kind);

  return {
    path: input.resolvedPath,
    basename: basename(input.resolvedPath),
    extension: input.extension,
    sizeBytes: input.sizeBytes,
    kind,
    mimeType: input.mimeType,
    exists: true,
    isDirectory: false,
    detail: formatMediaInspectionDetail(
      { kind, mimeType: input.mimeType },
      {
        imageDimensions,
        audioMetadata,
        structuredMetadata,
      },
      input.extension,
    ),
    contentHash: hashMediaFile(input.resolvedPath),
    textPreview: structuredMetadata?.preview,
    lineCount: structuredMetadata?.lineCount,
    wordCount: structuredMetadata?.wordCount,
    width: imageDimensions?.width,
    height: imageDimensions?.height,
    pageCount: structuredMetadata?.pageCount,
    title: structuredMetadata?.title,
    author: structuredMetadata?.author,
    durationMs: audioMetadata?.durationMs,
    transcriptPath: sidecars.transcriptPath,
    transcriptPreview: sidecars.transcriptPreview,
    captionPath: sidecars.captionPath,
    captionPreview: sidecars.captionPreview,
  };
}

export function buildMediaInspectionSignals(
  inspection: MediaInspection,
): string[] {
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
  ].filter((entry): entry is string => Boolean(entry));
}
