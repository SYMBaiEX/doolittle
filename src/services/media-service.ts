import { statSync } from "node:fs";
import { extname, resolve } from "node:path";

export class MediaService {
  constructor(private readonly workspaceDir: string) {}

  inspect(path: string): {
    path: string;
    extension: string;
    sizeBytes: number;
    kind: "image" | "audio" | "video" | "document" | "unknown";
  } {
    const resolvedPath = resolve(this.workspaceDir, path);
    const stat = statSync(resolvedPath);
    const extension = extname(resolvedPath).toLowerCase();
    const kind = this.detectKind(extension);

    return {
      path: resolvedPath,
      extension,
      sizeBytes: stat.size,
      kind,
    };
  }

  private detectKind(
    extension: string,
  ): "image" | "audio" | "video" | "document" | "unknown" {
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(extension)) {
      return "image";
    }
    if ([".mp3", ".wav", ".m4a", ".ogg"].includes(extension)) {
      return "audio";
    }
    if ([".mp4", ".mov", ".webm", ".avi"].includes(extension)) {
      return "video";
    }
    if ([".pdf", ".txt", ".md", ".json"].includes(extension)) {
      return "document";
    }
    return "unknown";
  }
}
