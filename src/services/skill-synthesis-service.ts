import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationTaskRecord } from "@/types";

export class SkillSynthesisService {
  constructor(private readonly skillsDir: string) {}

  synthesizeFromTask(task: DelegationTaskRecord): string {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    const dir = join(this.skillsDir, "generated", slug || "generated-skill");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "SKILL.md");
    const content = [
      `# ${task.title}`,
      "",
      `Generated from delegated task ${task.id}.`,
      "",
      "## Objective",
      task.objective,
      "",
      "## Notes",
      ...(task.notes.length ? task.notes : ["No notes recorded."]),
      "",
      "## Usage",
      "Apply this skill when a similar delegated workflow needs to be repeated.",
    ].join("\n");
    writeFileSync(path, content, "utf8");
    return path;
  }

  hasGeneratedSkill(task: DelegationTaskRecord): boolean {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return existsSync(join(this.skillsDir, "generated", slug || "generated-skill", "SKILL.md"));
  }
}
