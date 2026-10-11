import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
  it.each(["../escape", "safe/../../escape", "safe/./skill", "", "/absolute"])(
    "rejects unsafe manifest output slug %j",
    (slug) => {
      const root = mkdtempSync(join(tmpdir(), "skills-hub-import-slug-"));
      try {
        const source = join(root, "incoming.json");
        writeFileSync(source, JSON.stringify({ slug, content: "unexpected" }));
        expect(() =>
          importSkillHubManifest(createManifestHost(root), source),
        ).toThrow("slug must stay inside");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a linked import ancestor outside the imports root",
    () => {
      const root = mkdtempSync(join(tmpdir(), "skills-hub-import-ancestor-"));
      try {
        const host = createManifestHost(root);
        mkdirSync(host.importsDir);
        const outside = join(root, "outside");
        mkdirSync(outside);
        symlinkSync(outside, join(host.importsDir, "linked"));
        const source = join(root, "incoming.json");
        writeFileSync(
          source,
          JSON.stringify({ slug: "linked/skill", content: "unexpected" }),
        );
        expect(() => importSkillHubManifest(host, source)).toThrow(
          "cannot resolve outside",
        );
        expect(() =>
          readFileSync(join(outside, "skill", "SKILL.md")),
        ).toThrow();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects linked skill output, then imports a private regular file",
    () => {
      const root = mkdtempSync(join(tmpdir(), "skills-hub-import-link-"));
      try {
        const host = createManifestHost(root);
        const source = join(root, "incoming.json");
        const target = join(root, "target");
        const installDir = join(host.importsDir, "safe-skill");
        const skillPath = join(installDir, "SKILL.md");
        mkdirSync(installDir, { recursive: true });
        writeFileSync(
          source,
          JSON.stringify({ slug: "safe-skill", content: "new skill" }),
        );
        writeFileSync(target, "keep");
        symlinkSync(target, skillPath);
        expect(() => importSkillHubManifest(host, source)).toThrow();
        expect(readFileSync(target, "utf8")).toBe("keep");
        unlinkSync(skillPath);
        const imported = importSkillHubManifest(host, source);
        expect(readFileSync(imported.skillPath, "utf8")).toBe("new skill");
        expect(statSync(imported.skillPath).mode & 0o777).toBe(0o600);
        writeFileSync(
          source,
          JSON.stringify({ slug: "safe-skill", content: "short" }),
        );
        importSkillHubManifest(host, source);
        expect(readFileSync(imported.skillPath, "utf8")).toBe("short");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("imports a manifest, writes fallback content, and updates installed index", () => {
    const root = mkdtempSync(join(tmpdir(), "skills-hub-manifests-"));
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
    const root = mkdtempSync(join(tmpdir(), "skills-hub-manifests-malformed-"));
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
