import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { assertWorkspacePathResolvesInside } from "@/services/workspace-service/path";
import { isStrictlyContainedPath } from "@/utils/path-containment";
import type { SkillHubImportResult, SkillHubManifest } from "../types";
import {
  normalizeInstalledSkillHubManifest,
  readSkillHubInstalledIndex,
  writeSkillHubInstalledIndex,
} from "./installed";
import type { SkillsHubManifestHost } from "./types";

export function importSkillHubManifest(
  host: SkillsHubManifestHost,
  sourcePath: string,
): SkillHubImportResult {
  const manifest = JSON.parse(readFileSync(sourcePath, "utf8")) as
    | SkillHubManifest
    | {
        slug?: string;
        title?: string;
        description?: string;
        content?: string;
        source?: string;
      };
  const slug = host.normalizeSlug(manifest.slug ?? "imported-skill");
  if (
    slug
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      "Imported skill slug must stay inside the imports directory.",
    );
  }
  const title = manifest.title ?? slug;
  const description = manifest.description ?? "Imported skill manifest.";
  const installDir = join(host.importsDir, slug);
  if (!isStrictlyContainedPath(resolve(host.importsDir), resolve(installDir))) {
    throw new Error(
      "Imported skill slug must stay inside the imports directory.",
    );
  }
  mkdirSync(host.importsDir, { recursive: true, mode: 0o700 });
  assertWorkspacePathResolvesInside(host.importsDir, installDir);
  mkdirSync(installDir, { recursive: true, mode: 0o700 });
  const skillPath = join(installDir, "SKILL.md");
  const content =
    "content" in manifest && typeof manifest.content === "string"
      ? manifest.content
      : [
          `# ${title}`,
          "",
          description,
          "",
          "## Install Notes",
          `Imported from ${sourcePath}.`,
        ].join("\n");

  const descriptor = openSync(
    skillPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      (constants.O_NOFOLLOW ?? 0) |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error("Imported skill is not a regular file.");
    fchmodSync(descriptor, 0o600);
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, content, "utf8");
  } finally {
    closeSync(descriptor);
  }
  const manifestPath = join(installDir, "manifest.json");
  writeJsonAtomicSync(manifestPath, {
    kind: "skill-manifest",
    ...manifest,
    slug,
    title,
    description,
    source: "installed",
    installedAt: host.nowIso(),
    skillPath,
  });

  const installedManifest = normalizeInstalledSkillHubManifest({
    ...manifest,
    slug,
    title,
    description,
    source: "installed",
    path: manifestPath,
    root: host.rootFromSlug(slug),
    category: host.categoryFromSlug(slug),
    installable: true,
    content,
    contentLength: content.length,
    lineCount: host.countLines(content),
    hash: host.hashContent(content),
    tags: host.tagsFromText(content),
    generatedAt: host.nowIso(),
    workspacePath: skillPath,
    kind: "skill-manifest",
  });
  const installed = readSkillHubInstalledIndex(host.installedIndexPath).filter(
    (entry) => host.normalizeSlug(entry.slug) !== slug,
  );
  writeSkillHubInstalledIndex(host, [...installed, installedManifest]);

  return {
    sourcePath,
    manifestPath,
    skillPath,
    slug,
    title,
    source: "installed",
  };
}
