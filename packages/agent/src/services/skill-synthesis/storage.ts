import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import type { SkillProposalRecord } from "./proposal";

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

export interface SkillProposalIndex {
  proposals: SkillProposalRecord[];
}

export function createGeneratedSkillStorage(skillsDir: string) {
  const metadataDir = join(skillsDir, ".generated");
  const indexPath = join(metadataDir, "index.json");
  const proposalsPath = join(metadataDir, "proposals.json");

  mkdirSync(metadataDir, { recursive: true });
  if (!existsSync(indexPath)) {
    writeJsonAtomicSync(indexPath, { skills: [] });
  }

  return {
    generatedDir: skillsDir,
    metadataDir,
    indexPath,
    proposalsPath,
    readIndex(): GeneratedSkillIndex {
      if (!existsSync(indexPath)) {
        return { skills: [] };
      }
      const parsed = readJsonFileSync<{
        skills?: Array<Partial<GeneratedSkillRecord>>;
      }>(indexPath);
      return {
        skills: Array.isArray(parsed?.skills)
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
                    record.slug && record.title && record.taskId && record.path,
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
    },
    writeIndex(index: GeneratedSkillIndex): void {
      writeJsonAtomicSync(indexPath, index);
    },
    readProposals(): SkillProposalIndex {
      if (!existsSync(proposalsPath)) return { proposals: [] };
      const parsed = readJsonFileSync<{
        proposals?: SkillProposalRecord[];
      }>(proposalsPath);
      return {
        proposals: Array.isArray(parsed?.proposals)
          ? parsed.proposals.filter(
              (proposal): proposal is SkillProposalRecord =>
                Boolean(
                  proposal &&
                    typeof proposal.id === "string" &&
                    typeof proposal.slug === "string" &&
                    typeof proposal.content === "string" &&
                    typeof proposal.disposition === "string",
                ),
            )
          : [],
      };
    },
    writeProposals(index: SkillProposalIndex): void {
      writeJsonAtomicSync(proposalsPath, index);
    },
  };
}
