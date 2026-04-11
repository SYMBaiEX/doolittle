import { describe, expect, it } from "bun:test";
import type { SkillHubCatalogRecord, SkillHubWorkspaceRecord } from "../types";
import {
  buildCuratedFamilyRecord,
  buildGeneratedFamilyRecord,
} from "./builders";

describe("skill hub family builders", () => {
  const workspace: SkillHubWorkspaceRecord[] = [
    {
      slug: "planning/coordination",
      title: "Planning Coordination",
      description: "Plan tasks.",
      path: "/tmp/planning/coordination",
      root: "planning",
      category: "planning/coordination",
      tags: ["planning"],
      source: "workspace",
      installable: true,
      contentLength: 1,
      lineCount: 1,
      hash: "a1",
      manifestPath: "/tmp/planning/coordination.json",
      updatedAt: "2026-03-30T10:00:00.000Z",
    },
    {
      slug: "generated/task",
      title: "Generated Task",
      description: "Generated task.",
      path: "/tmp/generated/task",
      root: "generated",
      category: "generated/task",
      tags: ["generated"],
      source: "generated",
      installable: false,
      contentLength: 1,
      lineCount: 1,
      hash: "g1",
      manifestPath: "/tmp/generated/task.json",
      updatedAt: "2026-03-30T11:00:00.000Z",
    },
  ];
  const catalog: SkillHubCatalogRecord[] = [
    {
      slug: "planning/coordination",
      displayName: "Planning Coordination",
      summary: "Plan tasks.",
      tags: { domain: "planning" },
      tagList: ["domain:planning"],
      installsCurrent: 1,
      installsAllTime: 1,
      stars: 1,
      versions: 1,
      installed: true,
      manifestPath: "/tmp/planning/coordination.json",
      source: "catalog",
      workspacePath: workspace[0]?.path,
    },
    {
      slug: "generated/task",
      displayName: "Generated Task",
      summary: "Generated task.",
      tags: { domain: "generated" },
      tagList: ["domain:generated"],
      installsCurrent: 0,
      installsAllTime: 0,
      stars: 0,
      versions: 1,
      installed: false,
      manifestPath: "/tmp/generated/task.json",
      source: "workspace",
      workspacePath: "/tmp/generated/task.json",
    },
  ];
  const installed = [
    {
      slug: "planning/coordination",
      title: "Planning Coordination",
      source: "installed",
      root: "planning",
      category: "planning/coordination",
    },
  ];

  it("builds curated family totals and recent ordering", () => {
    const family = buildCuratedFamilyRecord(
      {
        slug: "planning/coordination",
        path: "./planning/coordination/README.md",
        title: "Planning Coordination",
        description: "Plan tasks together.",
      },
      workspace,
      catalog,
      installed,
      "/tmp/skills",
    );

    expect(family.workspaceTotal).toBe(1);
    expect(family.catalogTotal).toBe(1);
    expect(family.installedTotal).toBe(1);
    expect(family.path).toBe("/tmp/skills/planning/coordination/README.md");
    expect(family.recent[0]?.slug).toBe("planning/coordination");
  });

  it("builds generated family with generated totals", () => {
    const family = buildGeneratedFamilyRecord(
      workspace.filter((entry) => entry.source === "generated"),
      catalog,
      installed,
      "/tmp/skills",
    );

    expect(family.slug).toBe("generated");
    expect(family.generatedTotal).toBe(1);
    expect(family.catalogTotal).toBe(1);
    expect(family.installedTotal).toBe(0);
    expect(family.recent[0]?.slug).toBe("generated/task");
  });
});
