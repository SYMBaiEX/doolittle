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
import { runWithConversationWorkspace } from "@/runtime/workspace-scope";
import { SkillsService } from "./skills/service";

describe("SkillsService", () => {
  test("does not reuse workspace skill instructions across roots within the cache TTL", async () => {
    const first = mkdtempSync(join(tmpdir(), "doolittle-skills-first-"));
    const second = mkdtempSync(join(tmpdir(), "doolittle-skills-second-"));
    const skillsDir = mkdtempSync(join(tmpdir(), "doolittle-skills-shared-"));
    const skillDir = join(first, ".elizaos", "skills", "first-only");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: first-only\ndescription: first root secret instructions\n---\n# First only\n",
      "utf8",
    );
    const service = new SkillsService(skillsDir, first);
    const scope = (sessionId: string, workspacePath: string) => ({
      sessionId,
      botId: "bot",
      workspacePath,
    });
    try {
      const firstSkills = await runWithConversationWorkspace(
        scope("first", first),
        async () => service.list(),
      );
      const secondSkills = await runWithConversationWorkspace(
        scope("second", second),
        async () => service.list(),
      );
      expect(
        firstSkills.some((skill) =>
          skill.content.includes("first root secret instructions"),
        ),
      ).toBe(true);
      expect(
        secondSkills.some((skill) =>
          skill.content.includes("first root secret instructions"),
        ),
      ).toBe(false);
    } finally {
      rmSync(first, { recursive: true, force: true });
      rmSync(second, { recursive: true, force: true });
      rmSync(skillsDir, { recursive: true, force: true });
    }
  });
  test("summarizes workspace breadth by root family", async () => {
    const workspaceDir = fileURLToPath(
      new URL("../../../../", import.meta.url),
    );
    const skillsDir = resolve(workspaceDir, "packages/skills");
    const service = new SkillsService(skillsDir, workspaceDir);

    const summary = service.summary();

    expect(summary.total).toBeGreaterThan(50);
    expect(summary.curated).toBeGreaterThan(50);
    expect(summary.bundled).toBeGreaterThan(0);
    expect(summary.workspace).toBeGreaterThan(10);
    expect(summary.invocable).toBeGreaterThan(0);
    expect(summary.roots.map((entry) => entry.name)).toContain("execution");
    expect(summary.roots.map((entry) => entry.name)).toContain("research");
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
