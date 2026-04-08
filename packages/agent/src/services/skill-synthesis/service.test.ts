import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillSynthesisService } from "./service";

describe("SkillSynthesisService", () => {
  it("writes generated skill manifests and indexes them", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-skill-synthesis-"));
    const service = new SkillSynthesisService(root);
    const task = {
      id: "task-1",
      title: "Browser Capture Workflow",
      objective: "Capture browser snapshots and screenshots for a URL.",
      notes: [
        "Keep screenshots lightweight.",
        "Important: record the canonical URL.",
      ],
      status: "completed" as const,
      executionMode: "delegated" as const,
      workerMode: "process" as const,
      workerPid: 3210,
      attempts: 1,
      maxAttempts: 3,
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T00:00:01.000Z",
      completedAt: "2026-03-20T00:00:02.000Z",
    };

    try {
      const path = service.synthesizeFromTask(task);
      const skill = readFileSync(path, "utf8");
      const generated = service.listGeneratedSkills();

      expect(skill).toContain("## When to Use");
      expect(skill).toContain("## Procedure");
      expect(skill).toContain("## Signals");
      expect(skill).toContain("Signal Count");
      expect(generated).toHaveLength(1);
      expect(generated[0]?.slug).toBe("browser-capture-workflow");
      expect(generated[0]?.signalCount).toBeGreaterThan(0);
      expect(service.hasGeneratedSkill(task)).toBe(true);
      expect(
        service.describeGeneratedSkill("browser-capture-workflow"),
      ).toContain("GENERATED SKILL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tolerates legacy generated skill index entries without updatedAt", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-skill-synthesis-"));
    const service = new SkillSynthesisService(root);

    try {
      writeFileSync(
        join(root, "generated", "index.json"),
        JSON.stringify({
          skills: [
            {
              slug: "legacy-skill",
              title: "Legacy Skill",
              taskId: "task-legacy",
              path: join(root, "generated", "legacy-skill", "SKILL.md"),
              createdAt: "2026-03-21T00:00:00.000Z",
            },
          ],
        }),
        "utf8",
      );

      const generated = service.listGeneratedSkills();
      expect(generated).toHaveLength(1);
      expect(generated[0]?.slug).toBe("legacy-skill");
      expect(generated[0]?.updatedAt).toBe("2026-03-21T00:00:00.000Z");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
