import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface GeneratedSkillRecord {
  slug: string;
  title: string;
  taskId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  signalCount: number;
  objective: string;
}

export interface GeneratedSkillIndex {
  skills: GeneratedSkillRecord[];
}

export function createGeneratedSkillStorage(skillsDir: string) {
  const generatedDir = join(skillsDir, "generated");
  const indexPath = join(generatedDir, "index.json");

  mkdirSync(generatedDir, { recursive: true });
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, JSON.stringify({ skills: [] }, null, 2), "utf8");
  }

  return {
    generatedDir,
    indexPath,
    readIndex(): GeneratedSkillIndex {
      if (!existsSync(indexPath)) {
        return { skills: [] };
      }
      try {
        const parsed = JSON.parse(readFileSync(indexPath, "utf8")) as {
          skills?: Array<Partial<GeneratedSkillRecord>>;
        };
        return {
          skills: Array.isArray(parsed.skills)
            ? parsed.skills
                .filter(
                  (
                    record,
                  ): record is Partial<GeneratedSkillRecord> &
                    Pick<
                      GeneratedSkillRecord,
                      "slug" | "title" | "taskId" | "path"
                    > =>
                    Boolean(
                      record.slug &&
                        record.title &&
                        record.taskId &&
                        record.path,
                    ),
                )
                .map((record) => ({
                  slug: record.slug,
                  title: record.title,
                  taskId: record.taskId,
                  path: record.path,
                  createdAt: record.createdAt ?? new Date(0).toISOString(),
                  updatedAt:
                    record.updatedAt ??
                    record.createdAt ??
                    new Date(0).toISOString(),
                  noteCount: record.noteCount ?? 0,
                  signalCount: record.signalCount ?? 0,
                  objective: record.objective ?? "",
                }))
            : [],
        };
      } catch {
        return { skills: [] };
      }
    },
    writeIndex(index: GeneratedSkillIndex): void {
      writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
    },
  };
}
