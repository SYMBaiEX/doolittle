import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DelegationTaskRecord } from "@/types";
import { SkillSynthesisService } from "../skill-synthesis/service";
import { SkillsService } from "../skills/service";
import { SkillsHubService } from "./service";
import type { SkillHubCatalogRecord, SkillHubInstalledRecord } from "./types";

describe("SkillsHubService", () => {
  it("projects official catalog records and distributes local skill manifests", async () => {
    const root = join(tmpdir(), `doolittle-skills-hub-${Date.now()}`);
    const skillsDir = join(root, "skills");
    const dataDir = join(root, "data");
    mkdirSync(join(dataDir, "exports"), { recursive: true });
    mkdirSync(join(skillsDir, "planning", "coordination"), {
      recursive: true,
    });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "index.md"),
      [
        "- `planning/coordination` - [`coordination`](./planning/coordination/README.md)",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(skillsDir, "README.md"),
      [
        "# Skills",
        "",
        "## Category map",
        "- `planning/coordination`",
        "  - Coordinate planning work across multiple projects.",
      ].join("\n"),
      "utf8",
    );

    const workspaceSkillPath = join(
      skillsDir,
      "planning",
      "coordination",
      "SKILL.md",
    );
    writeFileSync(
      workspaceSkillPath,
      [
        "---",
        "name: coordination",
        "description: Coordinate planning work across multiple projects.",
        "---",
        "",
        "# Planning Coordination",
        "",
        "Coordinate planning work across multiple projects.",
        "",
        "## Tags",
        "- planning",
        "- coordination",
      ].join("\n"),
      "utf8",
    );

    const workspaceCatalogEntry: SkillHubCatalogRecord = {
      slug: "planning/coordination",
      displayName: "Planning Coordination",
      summary: "Coordinate planning work across multiple projects.",
      tags: { domain: "planning" },
      tagList: ["domain", "planning", "domain:planning"],
      installsAllTime: 88,
      installsCurrent: 12,
      stars: 21,
      versions: 3,
      installed: true,
      workspacePath: workspaceSkillPath,
      manifestPath: join(
        dataDir,
        "skill-manifests",
        "planning-coordination.json",
      ),
      source: "catalog",
    };
    const remoteCatalogEntry: SkillHubCatalogRecord = {
      slug: "distribution/catalog-skill",
      displayName: "Distribution Catalog",
      summary: "Catalog skill used to exercise installs.",
      tags: { domain: "distribution" },
      tagList: ["domain", "distribution", "domain:distribution"],
      installsAllTime: 15,
      installsCurrent: 5,
      stars: 4,
      versions: 2,
      installed: false,
      manifestPath: join(
        dataDir,
        "skill-manifests",
        "distribution-catalog-skill.json",
      ),
      source: "catalog",
    };

    const skills = new SkillsService(skillsDir);
    const synthesis = new SkillSynthesisService(skillsDir);
    const task: DelegationTaskRecord = {
      id: "task-1",
      title: "Generated Workflow",
      objective: "Build a reusable generated skill.",
      status: "completed",
      executionMode: "local",
      notes: ["Reuse the same workflow", "important: keep it repeatable"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    synthesis.synthesizeFromTask(task);

    const hub = new SkillsHubService(skills, synthesis, dataDir);

    try {
      hub.project({
        catalog: [workspaceCatalogEntry, remoteCatalogEntry],
      });

      const summary = hub.summary();
      expect(summary.workspaceTotal).toBe(2);
      expect(summary.generatedTotal).toBe(1);
      expect(summary.catalogTotal).toBe(2);
      expect(summary.familyTotal).toBeGreaterThan(0);
      expect(
        summary.distribution.sources.some((entry) => entry.count > 0),
      ).toBe(true);
      expect(
        summary.distribution.roots.some((entry) => entry.name === "planning"),
      ).toBe(true);
      expect(summary.families.length).toBeGreaterThan(0);
      expect(summary.recentWorkspace.length).toBeGreaterThan(0);

      const families = hub.families(true, 20);
      expect(
        families.some((entry) => entry.slug === "planning/coordination"),
      ).toBe(true);
      expect(
        hub.family("planning/coordination")?.workspaceTotal,
      ).toBeGreaterThan(0);

      const workspaceManifest = hub.manifest("planning/coordination");
      expect(workspaceManifest?.kind).toBe("skill-manifest");
      expect(workspaceManifest?.source).toBe("workspace");

      const exportPath = join(dataDir, "exports", "planning.json");
      const exported = hub.exportManifest("planning/coordination", exportPath);
      expect(exported.path).toBe(exportPath);
      expect(readFileSync(exportPath, "utf8")).toContain(
        "Planning Coordination",
      );

      const importedSourcePath = join(root, "imported-manifest.json");
      writeFileSync(
        importedSourcePath,
        JSON.stringify(
          {
            slug: "imports/new-skill",
            title: "Imported Skill",
            description: "Imported manifest for hub tests.",
            content: "# Imported Skill\n\nImported manifest for hub tests.",
          },
          null,
          2,
        ),
        "utf8",
      );
      const imported = await Promise.resolve(
        hub.importManifest(importedSourcePath),
      );
      expect(imported.source).toBe("installed");
      expect(hub.installedManifest(imported.slug)?.source).toBe("installed");
      expect(
        hub.installedManifests().some((entry) => entry.slug === imported.slug),
      ).toBe(true);

      const managedRecord: SkillHubInstalledRecord = {
        slug: "managed/release-checklist",
        title: "Release Checklist",
        path: join(root, "managed", "release-checklist", "SKILL.md"),
        installedAt: new Date().toISOString(),
        source: "managed",
        root: "managed",
        category: "release-checklist",
      };
      expect(() => hub.exportManifest(remoteCatalogEntry.slug)).toThrow(
        "Catalog skills must be installed through the official Agent Skills service",
      );

      const bundle = await hub.exportBundle("skills-hub", {
        catalog: [workspaceCatalogEntry, remoteCatalogEntry],
        installed: [managedRecord],
      });
      expect(bundle.manifestCount).toBeGreaterThan(0);
      expect(bundle.installedCount).toBe(2);
      expect(bundle.sync.workspaceTotal).toBe(2);
      expect(bundle.sync.generatedTotal).toBe(1);
      expect(bundle.sync.catalogTotal).toBe(2);
      expect(bundle.sync.installedTotal).toBe(2);
      expect(readFileSync(bundle.bundlePath, "utf8")).toContain(imported.slug);
      expect(readFileSync(bundle.bundlePath, "utf8")).toContain(
        managedRecord.slug,
      );
      expect(readFileSync(bundle.bundlePath, "utf8")).toContain("skills-hub");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
