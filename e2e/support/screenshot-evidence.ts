import { lstatSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

export interface ScreenshotEvidenceConfig {
  desktopDir: string;
  narrowDir: string;
  manifestPath: string;
}

/** Only remove known screenshots, never recursively erase an operator path. */
export function prepareScreenshotEvidence(
  rawRoot: string,
  routes: readonly string[],
): ScreenshotEvidenceConfig {
  const root = resolve(rawRoot);
  const forbidden = [parse(root).root, homedir(), process.cwd(), tmpdir()];
  const assertBounded = (path: string) => {
    if (
      forbidden.some(
        (base) => path === resolve(base) || path === realpathSync(base),
      )
    ) {
      throw new Error(
        "Screenshot output must be a dedicated evidence directory.",
      );
    }
  };
  assertBounded(root);
  if (routes.some((route) => !/^[a-z0-9-]+$/u.test(route))) {
    throw new Error("Screenshot route names must be static identifiers.");
  }
  mkdirSync(root, { recursive: true });
  if (lstatSync(root).isSymbolicLink()) {
    throw new Error("Screenshot output cannot be a symlink.");
  }
  const canonicalRoot = realpathSync(root);
  assertBounded(canonicalRoot);
  const directories = [
    join(canonicalRoot, "desktop"),
    join(canonicalRoot, "narrow"),
  ];
  // Validate both children before removing any existing screenshots.
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true });
    if (
      lstatSync(directory).isSymbolicLink() ||
      realpathSync(directory) !== directory
    ) {
      throw new Error("Screenshot evidence directories cannot be symlinks.");
    }
  }
  for (const directory of directories) {
    for (const route of routes)
      rmSync(join(directory, `${route}.png`), { force: true });
  }
  const manifestPath = join(canonicalRoot, "visual-manifest.json");
  rmSync(manifestPath, { force: true });
  return {
    desktopDir: directories[0],
    narrowDir: directories[1],
    manifestPath,
  };
}
