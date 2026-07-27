import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { basename, extname, isAbsolute, relative, sep } from "node:path";
import type { AutocoderPipelineRunRecord } from "./service";

export const MAX_AUTOCODER_ARTIFACT_BYTES = 5 * 1024 * 1024;

export type AutocoderArtifactKind =
  | "diff"
  | "markdown"
  | "json"
  | "text"
  | "png"
  | "html"
  | "audio";

export interface AutocoderArtifactPayload {
  artifact: {
    runId: string;
    index: number;
    name: string;
    kind: AutocoderArtifactKind;
    mimeType: string;
    sizeBytes: number;
  };
  encoding: "utf8" | "base64";
  content: string;
}

export class AutocoderArtifactError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AutocoderArtifactError";
  }
}

const ARTIFACT_TYPES: Record<
  string,
  {
    kind: AutocoderArtifactKind;
    mimeType: string;
    encoding: "utf8" | "base64";
  }
> = {
  ".diff": { kind: "diff", mimeType: "text/x-diff", encoding: "utf8" },
  ".patch": { kind: "diff", mimeType: "text/x-diff", encoding: "utf8" },
  ".md": { kind: "markdown", mimeType: "text/markdown", encoding: "utf8" },
  ".markdown": {
    kind: "markdown",
    mimeType: "text/markdown",
    encoding: "utf8",
  },
  ".json": {
    kind: "json",
    mimeType: "application/json",
    encoding: "utf8",
  },
  ".txt": { kind: "text", mimeType: "text/plain", encoding: "utf8" },
  ".log": { kind: "text", mimeType: "text/plain", encoding: "utf8" },
  ".png": { kind: "png", mimeType: "image/png", encoding: "base64" },
  ".html": { kind: "html", mimeType: "text/html", encoding: "utf8" },
  ".htm": { kind: "html", mimeType: "text/html", encoding: "utf8" },
  ".mp3": { kind: "audio", mimeType: "audio/mpeg", encoding: "base64" },
  ".wav": { kind: "audio", mimeType: "audio/wav", encoding: "base64" },
  ".ogg": { kind: "audio", mimeType: "audio/ogg", encoding: "base64" },
  ".m4a": { kind: "audio", mimeType: "audio/mp4", encoding: "base64" },
  ".aac": { kind: "audio", mimeType: "audio/aac", encoding: "base64" },
  ".flac": { kind: "audio", mimeType: "audio/flac", encoding: "base64" },
  ".webm": { kind: "audio", mimeType: "audio/webm", encoding: "base64" },
};

function isContainedPath(rootPath: string, candidatePath: string): boolean {
  const childPath = relative(rootPath, candidatePath);
  return (
    childPath.length > 0 &&
    childPath !== ".." &&
    !childPath.startsWith(`..${sep}`) &&
    !isAbsolute(childPath)
  );
}

export function readAutocoderArtifact(input: {
  artifactRoot: string;
  run: AutocoderPipelineRunRecord | undefined;
  runId: string;
  index: number;
}): AutocoderArtifactPayload {
  if (!input.run) {
    throw new AutocoderArtifactError("Autocoder pipeline run not found.", 404);
  }
  const artifactPath = input.run.artifactPaths[input.index];
  if (!artifactPath) {
    throw new AutocoderArtifactError("Autocoder artifact not found.", 404);
  }

  let canonicalRoot: string;
  let canonicalArtifact: string;
  try {
    canonicalRoot = realpathSync(input.artifactRoot);
    const linkInfo = lstatSync(artifactPath);
    if (linkInfo.isSymbolicLink()) {
      throw new AutocoderArtifactError(
        "Autocoder artifact is not an allowed regular file.",
        403,
      );
    }
    canonicalArtifact = realpathSync(artifactPath);
  } catch (error) {
    if (error instanceof AutocoderArtifactError) throw error;
    throw new AutocoderArtifactError("Autocoder artifact not found.", 404);
  }

  if (!isContainedPath(canonicalRoot, canonicalArtifact)) {
    throw new AutocoderArtifactError(
      "Autocoder artifact is outside the artifact store.",
      403,
    );
  }

  const type = ARTIFACT_TYPES[extname(canonicalArtifact).toLowerCase()];
  if (!type) {
    throw new AutocoderArtifactError(
      "Autocoder artifact type is not supported.",
      415,
    );
  }

  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      canonicalArtifact,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const fileInfo = fstatSync(descriptor);
    if (!fileInfo.isFile()) {
      throw new AutocoderArtifactError(
        "Autocoder artifact is not an allowed regular file.",
        403,
      );
    }
    if (fileInfo.size > MAX_AUTOCODER_ARTIFACT_BYTES) {
      throw new AutocoderArtifactError(
        `Autocoder artifact exceeds the ${MAX_AUTOCODER_ARTIFACT_BYTES} byte limit.`,
        413,
      );
    }
    const bytes = readFileSync(descriptor);
    if (bytes.byteLength > MAX_AUTOCODER_ARTIFACT_BYTES) {
      throw new AutocoderArtifactError(
        `Autocoder artifact exceeds the ${MAX_AUTOCODER_ARTIFACT_BYTES} byte limit.`,
        413,
      );
    }
    return {
      artifact: {
        runId: input.runId,
        index: input.index,
        name: basename(canonicalArtifact),
        kind: type.kind,
        mimeType: type.mimeType,
        sizeBytes: bytes.byteLength,
      },
      encoding: type.encoding,
      content:
        type.encoding === "base64"
          ? bytes.toString("base64")
          : bytes.toString("utf8"),
    };
  } catch (error) {
    if (error instanceof AutocoderArtifactError) throw error;
    throw new AutocoderArtifactError(
      "Autocoder artifact could not be read.",
      404,
    );
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
