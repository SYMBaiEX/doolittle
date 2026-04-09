import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  buildMediaBundleManifest,
  buildMediaBundleReport,
} from "../formatters/analysis";
import { buildMediaBundlePaths, slugifyMediaPath } from "../paths";
import type { MediaBundle, MediaInspection } from "../types";
import { getMediaMimeType, listMediaRelatedFiles } from "./readers";
import {
  buildDirectoryMediaInspection,
  buildMediaInspectionSignals,
  buildMissingMediaInspection,
  inspectResolvedMediaFile,
} from "./results";

export class MediaInspectionSupport {
  constructor(
    private readonly workspaceDir: string,
    private readonly outputDir: string,
  ) {
    mkdirSync(this.outputDir, { recursive: true });
  }

  inspect(path: string): MediaInspection {
    const resolvedPath = resolve(this.workspaceDir, path);
    const extension = extname(resolvedPath).toLowerCase();
    const mimeType = getMediaMimeType(extension);

    if (!existsSync(resolvedPath)) {
      return buildMissingMediaInspection(resolvedPath, extension, mimeType);
    }

    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      return buildDirectoryMediaInspection(resolvedPath, extension, stat.size);
    }

    return inspectResolvedMediaFile({
      resolvedPath,
      extension,
      mimeType,
      sizeBytes: stat.size,
    });
  }

  bundle(path: string): MediaBundle {
    const inspection = this.inspect(path);
    const stamp = Date.now();
    const slug = slugifyMediaPath(path);
    const { manifestPath, reportPath } = buildMediaBundlePaths(
      this.outputDir,
      stamp,
      slug,
    );
    const relatedFiles = listMediaRelatedFiles(inspection.path);
    writeFileSync(
      manifestPath,
      JSON.stringify(
        buildMediaBundleManifest(
          new Date().toISOString(),
          inspection,
          relatedFiles,
        ),
        null,
        2,
      ),
      "utf8",
    );

    writeFileSync(
      reportPath,
      buildMediaBundleReport(inspection, relatedFiles),
      "utf8",
    );

    return {
      inspection,
      manifestPath,
      reportPath,
      relatedFiles,
    };
  }

  buildSignals(inspection: MediaInspection): string[] {
    return buildMediaInspectionSignals(inspection);
  }
}
