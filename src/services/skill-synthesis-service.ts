import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationTaskRecord } from "@/types";

interface GeneratedSkillRecord {
  slug: string;
  title: string;
  taskId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  objective: string;
}

interface GeneratedSkillIndex {
  skills: GeneratedSkillRecord[];
}

export class SkillSynthesisService {
  private readonly generatedDir: string;
  private readonly indexPath: string;

  constructor(private readonly skillsDir: string) {
    this.generatedDir = join(this.skillsDir, "generated");
    this.indexPath = join(this.generatedDir, "index.json");
    mkdirSync(this.generatedDir, { recursive: true });
    if (!existsSync(this.indexPath)) {
      this.writeIndex({ skills: [] });
    }
  }

  synthesizeFromTask(task: DelegationTaskRecord): string {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    const dir = join(this.generatedDir, slug || "generated-skill");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "SKILL.md");
    const index = this.readIndex();
    const existing = index.skills.find((record) => record.slug === (slug || "generated-skill"));
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const content = [
      `# ${task.title}`,
      "",
      `Generated from delegated task ${task.id}.`,
      "",
      "## Objective",
      task.objective,
      "",
      "## When to Use",
      `Use this skill when a task resembles ${task.title.toLowerCase()} or when the same workflow appears again.`,
      "",
      "## Procedure",
      "1. Review the objective and notes.",
      "2. Identify the smallest reusable workflow.",
      "3. Execute the workflow and capture the result.",
      "4. Fold the stable steps back into the skill.",
      "",
      "## Notes",
      ...(task.notes.length ? task.notes : ["No notes recorded."]),
      "",
      "## Signals",
      ...(this.extractSignals(task.notes).length
        ? this.extractSignals(task.notes).map((note) => `- ${note}`)
        : ["- No strong signals recorded yet."]),
      "",
      "## Metadata",
      `- Task ID: ${task.id}`,
      `- Task Status: ${task.status}`,
      `- Attempts: ${task.attempts}`,
      `- Last Updated: ${updatedAt}`,
      `- Created: ${createdAt}`,
      "",
      "## Usage",
      "Apply this skill when a similar delegated workflow needs to be repeated.",
    ].join("\n");
    writeFileSync(path, content, "utf8");
    this.writeIndex({
      skills: [
        ...index.skills.filter((record) => record.slug !== (slug || "generated-skill")),
        {
          slug: slug || "generated-skill",
          title: task.title,
          taskId: task.id,
          path,
          createdAt,
          updatedAt,
          noteCount: task.notes.length,
          objective: task.objective,
        },
      ],
    });
    return path;
  }

  hasGeneratedSkill(task: DelegationTaskRecord): boolean {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return existsSync(join(this.generatedDir, slug || "generated-skill", "SKILL.md"));
  }

  listGeneratedSkills(limit = 20): GeneratedSkillRecord[] {
    return this.readIndex().skills
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  getGeneratedSkill(slug: string): GeneratedSkillRecord | undefined {
    return this.readIndex().skills.find((record) => record.slug === slug);
  }

  private extractSignals(notes: string[]): string[] {
    return notes
      .flatMap((note) => note.split(/\n+/u))
      .map((line) => line.replace(/^(?:-|\*|\d+\.)\s*/u, "").trim())
      .filter((line) => line.length > 0)
      .filter((line) => /must|should|requires?|important|warning|step|workflow|pattern|repeat|reuse/iu.test(line))
      .slice(0, 8);
  }

  private readIndex(): GeneratedSkillIndex {
    if (!existsSync(this.indexPath)) {
      return { skills: [] };
    }
    try {
      return JSON.parse(readFileSync(this.indexPath, "utf8")) as GeneratedSkillIndex;
    } catch {
      return { skills: [] };
    }
  }

  private writeIndex(index: GeneratedSkillIndex): void {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2), "utf8");
  }
}
