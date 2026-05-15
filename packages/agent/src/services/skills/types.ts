import type { SkillCommandSpec } from "@elizaos/skills";
import type { SkillDocument } from "@/types";

export type SkillSource = NonNullable<SkillDocument["source"]>;

export interface SkillsSnapshot {
  capturedAt: number;
  workspace: SkillDocument[];
  native: SkillDocument[];
  all: SkillDocument[];
  summary: SkillsWorkspaceSummary;
  commandSpecs: SkillCommandSpec[];
}

export interface SkillsWorkspaceSummary {
  total: number;
  curated: number;
  generated: number;
  workspace: number;
  bundled: number;
  managed: number;
  project: number;
  invocable: number;
  categories: Array<{
    name: string;
    count: number;
  }>;
  roots: Array<{
    name: string;
    count: number;
  }>;
  sources: Array<{
    name: SkillSource;
    count: number;
  }>;
}

export interface NativeSkillRoots {
  bundledSkillsDir: string;
  managedSkillsDir: string;
  curatedSkillsDir: string;
  projectSkillsDir: string;
  workspaceSkillsDir: string;
}
