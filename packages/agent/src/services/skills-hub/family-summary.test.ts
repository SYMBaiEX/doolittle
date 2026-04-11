import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSkillHubFamilies, buildSkillHubSummary } from "./family-summary";
import type { SkillHubCatalogRecord, SkillHubWorkspaceRecord } from "./types";

describe("skills hub family and summary helpers", () => {
  it("builds curated and generated family records from workspace and catalog data", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-skills-hub-family-"));
    const skillsRootDir = join(root, "skills");
    mkdirSync(join(skillsRootDir, "planning", "coordination"), {
      recursive: true,
    });
    writeFileSync(
      join(skillsRootDir, "index.md"),
      "- `planning/coordination` - [`coordination`](./planning/coordination/README.md)\n",
      "utf8",
    );
    writeFileSync(
      join(skillsRootDir, "README.md"),
      [
        "# Skills",
        "",
        "## Category map",
        "- `planning/coordination`",
        "  - Coordinate planning work across multiple projects.",
      ].join("\n"),
      "utf8",
    );

    const workspace: SkillHubWorkspaceRecord[] = [
      {
        slug: "planning/coordination",
        title: "Planning Coordination",
        description: "Coordinate planning work across multiple projects.",
        path: join(skillsRootDir, "planning", "coordination", "SKILL.md"),
        root: "planning",
        category: "planning/coordination",
        tags: ["planning", "coordination"],
        source: "workspace",
        installable: true,
        contentLength: 128,
        lineCount: 7,
        hash: "abc123",
        manifestPath: join(root, "manifests", "planning-coordination.json"),
        updatedAt: "2026-03-30T10:00:00.000Z",
      },
      {
        slug: "generated/task-skill",
        title: "Generated Task Skill",
        description: "Generated workflow.",
        path: join(skillsRootDir, "generated", "task-skill", "SKILL.md"),
        root: "generated",
        category: "generated/task-skill",
        tags: ["generated"],
        source: "generated",
        installable: true,
        contentLength: 64,
        lineCount: 4,
        hash: "def456",
        manifestPath: join(root, "manifests", "generated-task-skill.json"),
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
    ];
    const catalog: SkillHubCatalogRecord[] = [
      {
        slug: "planning/coordination",
        displayName: "Planning Coordination",
        summary: "Coordinate planning work across multiple projects.",
        tags: { domain: "planning" },
        tagList: ["domain", "planning", "domain:planning"],
        installsCurrent: 12,
        installsAllTime: 88,
        stars: 21,
        versions: 3,
        installed: true,
        workspacePath: workspace[0]?.path,
        manifestPath: join(root, "manifests", "planning-coordination.json"),
        source: "catalog",
      },
    ];
    const installed = [
      {
        slug: "planning/coordination",
        title: "Planning Coordination",
        path: join(
          root,
          "installs",
          "planning",
          "coordination",
          "manifest.json",
        ),
        installedAt: "2026-03-30T12:00:00.000Z",
        source: "installed",
        root: "planning",
        category: "planning/coordination",
      },
    ];

    try {
      const families = buildSkillHubFamilies({
        familyIndexPath: join(skillsRootDir, "index.md"),
        familyReadmePath: join(skillsRootDir, "README.md"),
        skillsRootDir,
        workspace,
        catalog,
        installed,
      });

      expect(
        families.some((entry) => entry.slug === "planning/coordination"),
      ).toBe(true);
      expect(families.some((entry) => entry.slug === "generated")).toBe(true);
      expect(
        families.find((entry) => entry.slug === "planning/coordination")
          ?.description,
      ).toContain("Coordinate planning work across multiple projects.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds grouped summary metrics and recent slices from the extracted seam", () => {
    const workspace: SkillHubWorkspaceRecord[] = [
      {
        slug: "planning/coordination",
        title: "Planning Coordination",
        description: "Coordinate planning work across multiple projects.",
        path: "/workspace/planning/coordination/SKILL.md",
        root: "planning",
        category: "planning/coordination",
        tags: ["planning", "coordination"],
        source: "workspace",
        installable: true,
        contentLength: 128,
        lineCount: 7,
        hash: "abc123",
        manifestPath: "/workspace/manifests/planning-coordination.json",
        updatedAt: "2026-03-30T10:00:00.000Z",
      },
      {
        slug: "generated/task-skill",
        title: "Generated Task Skill",
        description: "Generated workflow.",
        path: "/workspace/generated/task-skill/SKILL.md",
        root: "generated",
        category: "generated/task-skill",
        tags: ["generated"],
        source: "generated",
        installable: true,
        contentLength: 64,
        lineCount: 4,
        hash: "def456",
        manifestPath: "/workspace/manifests/generated-task-skill.json",
        updatedAt: "2026-03-30T11:00:00.000Z",
      },
    ];
    const catalog: SkillHubCatalogRecord[] = [
      {
        slug: "planning/coordination",
        displayName: "Planning Coordination",
        summary: "Coordinate planning work across multiple projects.",
        tags: { domain: "planning" },
        tagList: ["domain", "planning", "domain:planning"],
        installsCurrent: 12,
        installsAllTime: 88,
        stars: 21,
        versions: 3,
        installed: true,
        workspacePath: workspace[0]?.path,
        manifestPath: "/workspace/manifests/planning-coordination.json",
        source: "catalog",
      },
    ];
    const families = [
      {
        slug: "planning/coordination",
        title: "Planning Coordination",
        description: "Coordinate planning work across multiple projects.",
        path: "/workspace/skills/planning/coordination/README.md",
        kind: "curated" as const,
        workspaceTotal: 1,
        generatedTotal: 0,
        catalogTotal: 1,
        installedTotal: 1,
        recent: [
          {
            slug: "planning/coordination",
            title: "Planning Coordination",
            category: "planning/coordination",
            root: "planning",
            source: "workspace" as const,
          },
        ],
      },
    ];
    const installed = [
      {
        slug: "planning/coordination",
        title: "Planning Coordination",
        path: "/workspace/installs/planning/coordination/manifest.json",
        installedAt: "2026-03-30T12:00:00.000Z",
        source: "installed",
        root: "planning",
        category: "planning/coordination",
      },
    ];

    const summary = buildSkillHubSummary({
      workspace,
      catalog,
      installed,
      families,
      manifestsDir: "/workspace/manifests",
      lastSyncReport: {
        catalogTotal: 1,
        exportedManifests: 2,
      },
      installedTagsBySlug: (slug) =>
        slug === "planning/coordination" ? ["planning", "coordination"] : [],
    });

    expect(summary.workspaceTotal).toBe(2);
    expect(summary.generatedTotal).toBe(1);
    expect(summary.catalogTotal).toBe(1);
    expect(
      summary.distribution.sources.some(
        (entry) => entry.source === "installed",
      ),
    ).toBe(true);
    expect(
      summary.distribution.roots.some((entry) => entry.name === "planning"),
    ).toBe(true);
    expect(summary.recentWorkspace[0]?.slug).toBe("generated/task-skill");
    expect(summary.recentInstalled[0]?.tags).toEqual([
      "planning",
      "coordination",
    ]);
  });
});
