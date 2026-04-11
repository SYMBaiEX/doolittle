export interface MediaBundlePaths {
  manifestPath: string;
  reportPath: string;
}

export interface MediaAnalysisPaths extends MediaBundlePaths {
  responsePath: string;
}

export interface MediaTranscriptionPaths extends MediaBundlePaths {
  promptPath: string;
  transcriptPath: string;
  responsePath: string;
}

export interface MediaGenerationPaths extends MediaBundlePaths {
  promptPath: string;
  artifactPath: string;
  responsePath?: string;
}

export interface MediaSpeechPaths extends MediaBundlePaths {
  promptPath: string;
  artifactPath: string;
  responsePath: string;
}

function buildStampedPath(
  outputDir: string,
  stamp: number,
  slug: string,
  suffix: string,
): string {
  return `${outputDir}/media-${stamp}-${slug}${suffix}`;
}

export function slugifyMediaPath(path: string): string {
  return (
    path
      .replace(/^[./\\]+/u, "")
      .replace(/[^a-z0-9]+/giu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 72)
      .toLowerCase() || "media"
  );
}

export function slugifyMediaText(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "media"
  );
}

export function buildMediaBundlePaths(
  outputDir: string,
  stamp: number,
  slug: string,
): MediaBundlePaths {
  return {
    manifestPath: buildStampedPath(outputDir, stamp, slug, ".json"),
    reportPath: buildStampedPath(outputDir, stamp, slug, ".md"),
  };
}

export function buildMediaAnalysisPaths(
  outputDir: string,
  stamp: number,
  slug: string,
): MediaAnalysisPaths {
  return {
    ...buildMediaBundlePaths(outputDir, stamp, slug),
    responsePath: buildStampedPath(
      outputDir,
      stamp,
      slug,
      "-analysis-response.md",
    ),
  };
}

export function buildMediaTranscriptionPaths(
  outputDir: string,
  stamp: number,
  slug: string,
): MediaTranscriptionPaths {
  return {
    promptPath: buildStampedPath(
      outputDir,
      stamp,
      slug,
      "-transcription-prompt.md",
    ),
    manifestPath: buildStampedPath(
      outputDir,
      stamp,
      slug,
      "-transcription.json",
    ),
    reportPath: buildStampedPath(outputDir, stamp, slug, "-transcription.md"),
    transcriptPath: buildStampedPath(outputDir, stamp, slug, "-transcript.txt"),
    responsePath: buildStampedPath(
      outputDir,
      stamp,
      slug,
      "-transcription-response.txt",
    ),
  };
}

export function buildMediaGenerationPaths(
  outputDir: string,
  stamp: number,
  slug: string,
): MediaGenerationPaths {
  return {
    promptPath: buildStampedPath(outputDir, stamp, slug, "-prompt.md"),
    manifestPath: buildStampedPath(outputDir, stamp, slug, "-generation.json"),
    reportPath: buildStampedPath(outputDir, stamp, slug, "-generation.md"),
    artifactPath: buildStampedPath(outputDir, stamp, slug, ".svg"),
  };
}

export function buildMediaSpeechPaths(
  outputDir: string,
  stamp: number,
  slug: string,
): MediaSpeechPaths {
  return {
    promptPath: buildStampedPath(outputDir, stamp, slug, "-speech-prompt.md"),
    manifestPath: buildStampedPath(outputDir, stamp, slug, "-speech.json"),
    reportPath: buildStampedPath(outputDir, stamp, slug, "-speech.md"),
    artifactPath: buildStampedPath(outputDir, stamp, slug, "-speech.svg"),
    responsePath: buildStampedPath(
      outputDir,
      stamp,
      slug,
      "-speech-response.txt",
    ),
  };
}
