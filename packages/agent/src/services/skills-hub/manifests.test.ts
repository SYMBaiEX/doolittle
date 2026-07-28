import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  importSkillHubManifest,
  listInstalledSkillHubManifests,
  readSkillHubInstalledIndex,
} from "./manifests";
import {
  categoryFromSkillHubSlug,
  countSkillHubLines,
  hashSkillHubContent,
  normalizeSkillHubSlug,
  rootFromSkillHubSlug,
  tagsFromSkillHubText,
} from "./records";

function createManifestHost(root: string) {
  return {
    manifestsDir: join(root, "manifests"),
    importsDir: join(root, "imports"),
    installedIndexPath: join(root, "installs", "index.json"),
    nowIso: () => "2026-04-11T12:00:00.000Z",
    normalizeSlug: normalizeSkillHubSlug,
    rootFromSlug: rootFromSkillHubSlug,
    categoryFromSlug: categoryFromSkillHubSlug,
    countLines: countSkillHubLines,
    hashContent: hashSkillHubContent,
    tagsFromText: tagsFromSkillHubText,
  };
}

describe("skills-hub manifests", () => {
  it("imports a manifest, writes fallback content, and updates installed index", () => {
    const root = join(tmpdir(), `skills-hub-manifests-${Date.now()}`);
    const host = createManifestHost(root);
    mkdirSync(join(root, "installs"), { recursive: true });

    try {
      const sourcePath = join(root, "incoming.json");
      writeFileSync(
        sourcePath,
        JSON.stringify(
          {
            slug: "Imports/New Skill",
            title: "Imported Skill",
            description: "Imported from a manifest without inline content.",
          },
          null,
          2,
        ),
        "utf8",
      );

      const imported = importSkillHubManifest(host, sourcePath);

      expect(imported.slug).toBe("imports/new-skill");
      expect(readFileSync(imported.skillPath, "utf8")).toContain(
        "Imported from a manifest without inline content.",
      );
      expect(readFileSync(imported.skillPath, "utf8")).toContain(
        `Imported from ${sourcePath}.`,
      );
      expect(
        listInstalledSkillHubManifests(host.installedIndexPath).some(
          (entry) => entry.slug === imported.slug,
        ),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns an empty installed index when the file is malformed", () => {
    const root = join(tmpdir(), `skills-hub-manifests-malformed-${Date.now()}`);
    const installedIndexPath = join(root, "installs", "index.json");
    mkdirSync(join(root, "installs"), { recursive: true });

    try {
      writeFileSync(installedIndexPath, "{not-json", "utf8");
      expect(readSkillHubInstalledIndex(installedIndexPath)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
