import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSkillHubCatalogManifest,
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
  tagsFromSkillHubCatalog,
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
    tagsFromCatalog: tagsFromSkillHubCatalog,
  };
}

describe("skills-hub manifests", () => {
  it("builds a catalog manifest with normalized paths and catalog metadata", () => {
    const host = createManifestHost("/tmp/skills-hub-manifests");
    const manifest = buildSkillHubCatalogManifest(
      host,
      "Planning/Coordination",
      {
        slug: "planning/coordination",
        displayName: "Planning Coordination",
        summary: "Coordinate planning work across projects.",
        tags: { domain: "planning", scope: "coordination" },
        createdAt: 1,
        updatedAt: 2,
        latestVersion: {
          version: "1.0.0",
          createdAt: 1,
          changelog: "Initial release",
        },
        stats: {
          comments: 0,
          downloads: 0,
          installsAllTime: 22,
          installsCurrent: 7,
          stars: 4,
          versions: 1,
        },
      },
    );

    expect(manifest.slug).toBe("planning/coordination");
    expect(manifest.path).toBe(
      "/tmp/skills-hub-manifests/manifests/planning/coordination.json",
    );
    expect(manifest.root).toBe("planning");
    expect(manifest.category).toBe("planning/coordination");
    expect(manifest.tagList).toContain("domain");
    expect(manifest.tagList).toContain("scope:coordination");
    expect(manifest.catalog?.installsCurrent).toBe(7);
  });

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
