import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { DelegationTaskRecord } from "@/types";

import type { GeneratedSkillRecord } from "./storage";

export function buildGeneratedSkillSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function extractGeneratedSkillSignals(notes: string[]): string[] {
  return notes
    .flatMap((note) => note.split(/\n+/u))
    .map((line) => line.replace(/^(?:-|\*|\d+\.)\s*/u, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) =>
      /must|should|requires?|important|warning|step|workflow|pattern|repeat|reuse/iu.test(
        line,
      ),
    )
    .slice(0, 8);
}

export function synthesizeGeneratedSkillFromTask(
  generatedDir: string,
  task: DelegationTaskRecord,
  existing: GeneratedSkillRecord | undefined,
): GeneratedSkillRecord {
  const slug = buildGeneratedSkillSlug(task.title) || "generated-skill";
  const dir = join(generatedDir, slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const signals = extractGeneratedSkillSignals(task.notes);

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
    ...(signals.length
      ? signals.map((note) => `- ${note}`)
      : ["- No strong signals recorded yet."]),
    "",
    "## Metadata",
    `- Task ID: ${task.id}`,
    `- Task Status: ${task.status}`,
    `- Attempts: ${task.attempts}`,
    `- Signal Count: ${signals.length}`,
    `- Last Updated: ${updatedAt}`,
    `- Created: ${createdAt}`,
    "",
    "## Usage",
    "Apply this skill when a similar delegated workflow needs to be repeated.",
  ].join("\n");
  writeFileSync(path, content, "utf8");

  return {
    slug,
    title: task.title,
    taskId: task.id,
    path,
    createdAt,
    updatedAt,
    noteCount: task.notes.length,
    signalCount: signals.length,
    objective: task.objective,
  };
}

export function hasGeneratedSkillForTask(
  generatedDir: string,
  task: DelegationTaskRecord,
): boolean {
  return existsSync(
    join(
      generatedDir,
      buildGeneratedSkillSlug(task.title) || "generated-skill",
      "SKILL.md",
    ),
  );
}
