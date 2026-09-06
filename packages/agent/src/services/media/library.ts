import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, extname } from "node:path";
import { isStrictlyContainedPath } from "@/utils/path-containment";

const MAX_MANIFEST_BYTES = 128 * 1024;
export const MAX_MEDIA_LIBRARY_ASSET_BYTES = 5 * 1024 * 1024;
const MEDIA_LIBRARY_ID = /^[a-z0-9][a-z0-9-]{0,180}$/u;

export type MediaLibraryAssetKind = "image" | "audio" | "video";

export interface MediaLibraryAsset {
  id: string;
  name: string;
  kind: MediaLibraryAssetKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  prompt: string;
  provider: string;
  model: string;
}

export interface MediaLibraryAssetPayload {
  asset: MediaLibraryAsset;
  encoding: "base64";
  content: string;
}

export class MediaLibraryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MediaLibraryError";
  }
}

type GeneratedManifest = Record<string, unknown> & {
  artifactPath?: unknown;
  artifactKind?: unknown;
  createdAt?: unknown;
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
};

const ASSET_TYPES: Record<
  string,
  { kind: MediaLibraryAssetKind; mimeType: string }
> = {
  ".png": { kind: "image", mimeType: "image/png" },
  ".svg": { kind: "image", mimeType: "image/svg+xml" },
  ".jpg": { kind: "image", mimeType: "image/jpeg" },
  ".jpeg": { kind: "image", mimeType: "image/jpeg" },
  ".webp": { kind: "image", mimeType: "image/webp" },
  ".gif": { kind: "image", mimeType: "image/gif" },
  ".mp3": { kind: "audio", mimeType: "audio/mpeg" },
  ".wav": { kind: "audio", mimeType: "audio/wav" },
  ".m4a": { kind: "audio", mimeType: "audio/mp4" },
  ".aac": { kind: "audio", mimeType: "audio/aac" },
  ".flac": { kind: "audio", mimeType: "audio/flac" },
  ".ogg": { kind: "audio", mimeType: "audio/ogg" },
  ".webm": { kind: "video", mimeType: "video/webm" },
  ".mp4": { kind: "video", mimeType: "video/mp4" },
  ".mov": { kind: "video", mimeType: "video/quicktime" },
};

function readManifest(path: string): GeneratedManifest | null {
  try {
    const info = lstatSync(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size > MAX_MANIFEST_BYTES
    ) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as GeneratedManifest)
      : null;
  } catch {
    return null;
  }
}

function manifestAsset(
  outputDir: string,
  canonicalRoot: string,
  manifestName: string,
): MediaLibraryAsset | null {
  if (
    !manifestName.endsWith("-generation.json") &&
    !manifestName.endsWith("-speech.json")
  ) {
    return null;
  }
  const manifest = readManifest(`${outputDir}/${manifestName}`);
  if (!manifest || typeof manifest.artifactPath !== "string") return null;

  try {
    const artifactInfo = lstatSync(manifest.artifactPath);
    if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink()) return null;
    const canonicalArtifact = realpathSync(manifest.artifactPath);
    if (!isStrictlyContainedPath(canonicalRoot, canonicalArtifact)) return null;
    const type = ASSET_TYPES[extname(canonicalArtifact).toLowerCase()];
    if (!type) return null;
    const id = manifestName.slice(0, -".json".length);
    if (!MEDIA_LIBRARY_ID.test(id)) return null;
    const createdAt =
      typeof manifest.createdAt === "string"
        ? manifest.createdAt
        : statSync(canonicalArtifact).mtime.toISOString();
    return {
      id,
      name: basename(canonicalArtifact),
      kind: type.kind,
      mimeType: type.mimeType,
      sizeBytes: artifactInfo.size,
      createdAt,
      prompt: typeof manifest.prompt === "string" ? manifest.prompt : "",
      provider:
        typeof manifest.provider === "string" ? manifest.provider : "unknown",
      model: typeof manifest.model === "string" ? manifest.model : "unknown",
    };
  } catch {
    return null;
  }
}

export function listMediaLibraryAssets(outputDir: string): MediaLibraryAsset[] {
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(outputDir);
  } catch {
    return [];
  }
  try {
    return readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
      .map((entry) => manifestAsset(outputDir, canonicalRoot, entry.name))
      .filter((asset): asset is MediaLibraryAsset => Boolean(asset))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 200);
  } catch {
    return [];
  }
}

export function readMediaLibraryAsset(
  outputDir: string,
  id: string,
): MediaLibraryAssetPayload {
  if (!MEDIA_LIBRARY_ID.test(id)) {
    throw new MediaLibraryError("Media asset id is invalid.", 400);
  }
  const asset = listMediaLibraryAssets(outputDir).find(
    (candidate) => candidate.id === id,
  );
  if (!asset) throw new MediaLibraryError("Media asset not found.", 404);

  let descriptor: number | undefined;
  try {
    const manifest = readManifest(`${outputDir}/${id}.json`);
    if (!manifest || typeof manifest.artifactPath !== "string") {
      throw new MediaLibraryError("Media asset not found.", 404);
    }
    const canonicalRoot = realpathSync(outputDir);
    const artifactInfo = lstatSync(manifest.artifactPath);
    if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink()) {
      throw new MediaLibraryError("Media asset is not a regular file.", 403);
    }
    const canonicalArtifact = realpathSync(manifest.artifactPath);
    if (!isStrictlyContainedPath(canonicalRoot, canonicalArtifact)) {
      throw new MediaLibraryError("Media asset is outside the library.", 403);
    }
    if (basename(canonicalArtifact) !== asset.name) {
      throw new MediaLibraryError("Media asset changed before preview.", 409);
    }
    descriptor = openSync(
      canonicalArtifact,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const info = fstatSync(descriptor);
    if (!info.isFile()) {
      throw new MediaLibraryError("Media asset is not a regular file.", 403);
    }
    if (info.size > MAX_MEDIA_LIBRARY_ASSET_BYTES) {
      throw new MediaLibraryError(
        `Media asset exceeds the ${MAX_MEDIA_LIBRARY_ASSET_BYTES} byte preview limit.`,
        413,
      );
    }
    return {
      asset,
      encoding: "base64",
      content: readFileSync(descriptor).toString("base64"),
    };
  } catch (error) {
    if (error instanceof MediaLibraryError) throw error;
    throw new MediaLibraryError("Media asset could not be read.", 404);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
