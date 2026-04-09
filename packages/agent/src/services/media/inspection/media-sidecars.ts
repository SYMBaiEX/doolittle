import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

import { buildMediaPreview } from "./media-preview";

export function buildMediaSidecarCandidates(
  resolvedPath: string,
  kind: "image" | "audio" | "video" | "document" | "unknown",
): {
  transcriptCandidates: string[];
  captionCandidates: string[];
} {
  const extension = extname(resolvedPath);
  const basePath = resolvedPath.slice(
    0,
    resolvedPath.length - extension.length,
  );

  return {
    transcriptCandidates:
      kind === "audio" || kind === "video"
        ? [
            `${basePath}.txt`,
            `${basePath}.md`,
            `${basePath}.transcript.txt`,
            `${basePath}.srt`,
            `${basePath}.vtt`,
          ]
        : [],
    captionCandidates:
      kind === "image"
        ? [
            `${basePath}.txt`,
            `${basePath}.md`,
            `${basePath}.caption.txt`,
            `${basePath}.alt.txt`,
          ]
        : [],
  };
}

export function buildMediaRelatedFileCandidates(
  resolvedPath: string,
): string[] {
  const extension = extname(resolvedPath);
  const basePath = resolvedPath.slice(
    0,
    resolvedPath.length - extension.length,
  );

  return [
    `${basePath}.txt`,
    `${basePath}.md`,
    `${basePath}.caption.txt`,
    `${basePath}.alt.txt`,
    `${basePath}.transcript.txt`,
    `${basePath}.srt`,
    `${basePath}.vtt`,
  ];
}

export function readMediaSidecars(
  resolvedPath: string,
  kind: "image" | "audio" | "video" | "document" | "unknown",
): {
  transcriptPath?: string;
  transcriptPreview?: string;
  captionPath?: string;
  captionPreview?: string;
} {
  const { transcriptCandidates, captionCandidates } =
    buildMediaSidecarCandidates(resolvedPath, kind);

  const transcriptPath = transcriptCandidates.find((candidate) =>
    existsSync(candidate),
  );
  const captionPath = captionCandidates.find((candidate) =>
    existsSync(candidate),
  );

  return {
    transcriptPath,
    transcriptPreview: transcriptPath
      ? buildMediaPreview(
          readFileSync(transcriptPath, "utf8"),
          extname(transcriptPath).toLowerCase(),
        )
      : undefined,
    captionPath,
    captionPreview: captionPath
      ? buildMediaPreview(
          readFileSync(captionPath, "utf8"),
          extname(captionPath).toLowerCase(),
        )
      : undefined,
  };
}

export function listMediaRelatedFiles(resolvedPath: string): string[] {
  return buildMediaRelatedFileCandidates(resolvedPath).filter(
    (candidate) => candidate !== resolvedPath && existsSync(candidate),
  );
}
