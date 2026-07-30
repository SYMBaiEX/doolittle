import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, test } from "vitest";
import { SkillsService } from "./skills/service";

describe("SkillsService", () => {
  test("summarizes workspace breadth by root family", async () => {
    const workspaceDir = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const skillsDir = resolve(workspaceDir, "packages/skills");
    const service = new SkillsService(skillsDir, workspaceDir);

    const summary = service.summary();

    expect(summary.total).toBeGreaterThan(50);
    expect(summary.curated).toBeGreaterThan(50);
    expect(summary.generated).toBeGreaterThan(0);
    expect(summary.bundled).toBeGreaterThan(0);
    expect(summary.workspace).toBeGreaterThan(10);
    expect(summary.invocable).toBeGreaterThan(0);
    expect(summary.roots.map((entry) => entry.name)).toContain("execution");
    expect(summary.roots.map((entry) => entry.name)).toContain("research");
    expect(summary.categories.map((entry) => entry.name)).toContain(
      "generated",
    );
    expect(
      service
        .workspace()
        .filter((skill) => skill.source === "workspace")
        .every((skill) => !skill.slug.includes("/")),
    ).toBe(true);
    expect(
      service.workspace().every((skill) => skill.source !== "bundled"),
    ).toBe(true);
    expect(service.list().some((skill) => skill.source === "bundled")).toBe(
      true,
    );
  });

  test("uses the bound Agent Skills service as the catalog authority", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-official-skills-"));
    const skillDir = join(root, "generated-checklist");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: generated-checklist",
        "description: Verify a generated release checklist.",
        "provenance:",
        "  source: agent-generated",
        "  createdAt: 2026-07-29T00:00:00.000Z",
        "  refinedCount: 0",
        "---",
        "",
        "# Generated Checklist",
      ].join("\n"),
      "utf8",
    );
    const service = new SkillsService(root, process.cwd());
    const runtime = {
      getService(name: string) {
        if (name !== "AGENT_SKILLS_SERVICE") return null;
        return {
          getLoadedSkills: () => [
            {
              slug: "generated-checklist",
              name: "generated-checklist",
              description: "Verify a generated release checklist.",
              version: "0.0.0",
              content: readFileSync(join(skillDir, "SKILL.md"), "utf8"),
              frontmatter: {
                name: "generated-checklist",
                description: "Verify a generated release checklist.",
              },
              path: skillDir,
              scripts: [],
              references: [],
              assets: [],
              loadedAt: Date.now(),
              source: "workspace",
              sourceDir: root,
              precedence: 100,
            },
          ],
        };
      },
    } as unknown as IAgentRuntime;

    try {
      service.bindRuntime(runtime);

      expect(service.list()).toHaveLength(1);
      expect(service.list()[0]).toMatchObject({
        slug: "generated-checklist",
        title: "Generated Checklist",
        source: "generated",
      });
      expect(service.summary()).toMatchObject({
        total: 1,
        generated: 1,
        workspace: 1,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
