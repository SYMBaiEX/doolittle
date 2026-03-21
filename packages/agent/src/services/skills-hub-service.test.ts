import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DelegationTaskRecord } from "@/types";
import { AgentSdkService } from "./agent-sdk-service";
import { SkillSynthesisService } from "./skill-synthesis-service";
import { SkillsHubService } from "./skills-hub-service";
import { SkillsService } from "./skills-service";

type AgentCatalogSkill = Awaited<ReturnType<AgentSdkService["catalogSkill"]>>;

describe("SkillsHubService", () => {
  it("syncs, exports, imports, and installs skill manifests", async () => {
    const root = join(tmpdir(), `eliza-agent-skills-hub-${Date.now()}`);
    const skillsDir = join(root, "skills");
    const dataDir = join(root, "data");
    mkdirSync(join(dataDir, "exports"), { recursive: true });
    mkdirSync(join(skillsDir, "planning", "coordination"), {
      recursive: true,
    });
    mkdirSync(dataDir, { recursive: true });

    const workspaceSkillPath = join(
      skillsDir,
      "planning",
      "coordination",
      "SKILL.md",
    );
    writeFileSync(
      workspaceSkillPath,
      [
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

    const agentSdk = new AgentSdkService();
    const workspaceCatalogEntry = {
      slug: "planning/coordination",
      displayName: "Planning Coordination",
      summary: "Coordinate planning work across multiple projects.",
      tags: { domain: "planning" },
      stats: {
        installsCurrent: 12,
        installsAllTime: 88,
        stars: 21,
        versions: 3,
      },
    };
    const remoteCatalogEntry = {
      slug: "distribution/catalog-skill",
      displayName: "Distribution Catalog",
      summary: "Catalog skill used to exercise installs.",
      tags: { domain: "distribution" },
      stats: {
        installsCurrent: 5,
        installsAllTime: 15,
        stars: 4,
        versions: 2,
      },
    };
    agentSdk.catalog = async () =>
      [workspaceCatalogEntry, remoteCatalogEntry] as never;
    agentSdk.catalogSkill = async (
      slug: string,
    ): Promise<AgentCatalogSkill> =>
      slug === remoteCatalogEntry.slug ? remoteCatalogEntry : null;
    agentSdk.searchSkillCatalog = async () =>
      ({
        available: true,
        query: "planning",
        results: [workspaceCatalogEntry],
      }) as never;

    const skills = new SkillsService(skillsDir, agentSdk);
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

    const hub = new SkillsHubService(skills, synthesis, agentSdk, dataDir);

    try {
      const sync = await hub.syncCatalog(true);
      expect(sync.workspaceTotal).toBe(2);
      expect(sync.generatedTotal).toBe(1);
      expect(sync.catalogTotal).toBe(2);

      const summary = hub.summary();
      expect(summary.workspaceTotal).toBe(2);
      expect(summary.generatedTotal).toBe(1);
      expect(summary.catalogTotal).toBe(2);

      const catalog = await hub.catalog(true, 10);
      expect(
        catalog.some((entry) => entry.slug === workspaceCatalogEntry.slug),
      ).toBe(true);
      expect(
        catalog.some((entry) => entry.slug === remoteCatalogEntry.slug),
      ).toBe(true);

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

      const installedFromCatalog = await hub.installFromCatalog(
        remoteCatalogEntry.slug,
      );
      expect(installedFromCatalog.source).toBe("installed");
      expect(hub.installedManifest(remoteCatalogEntry.slug)?.source).toBe(
        "installed",
      );
      expect(
        hub
          .installedManifests()
          .some((entry) => entry.slug === remoteCatalogEntry.slug),
      ).toBe(true);

      const bundle = await hub.exportBundle("skills-hub");
      expect(bundle.manifestCount).toBeGreaterThan(0);
      expect(bundle.installedCount).toBeGreaterThan(0);
      expect(readFileSync(bundle.bundlePath, "utf8")).toContain("skills-hub");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
