import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "./service";

export interface AutocoderPipelineStore {
  runs: AutocoderPipelineRunRecord[];
  workflows: AutocoderPipelineWorkflowRecord[];
}

export interface AutocoderPipelinePersistence {
  loadStore(): AutocoderPipelineStore;
  saveStore(store: AutocoderPipelineStore): void;
  writeArtifact(
    id: string,
    name: string,
    suffix: string,
    value: unknown,
  ): string;
  nextId(kind: string, name?: string): string;
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

export function createAutocoderPipelinePersistence(
  rootDir: string,
): AutocoderPipelinePersistence {
  mkdirSync(rootDir, { recursive: true });
  const artifactDir = join(rootDir, "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const storePath = join(rootDir, "pipeline-runs.json");

  return {
    loadStore(): AutocoderPipelineStore {
      if (!existsSync(storePath)) {
        return { runs: [], workflows: [] };
      }
      try {
        const parsed = JSON.parse(
          readFileSync(storePath, "utf8"),
        ) as Partial<AutocoderPipelineStore>;
        return {
          runs: parsed.runs ?? [],
          workflows: parsed.workflows ?? [],
        };
      } catch {
        return { runs: [], workflows: [] };
      }
    },
    saveStore(store: AutocoderPipelineStore): void {
      writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
    },
    writeArtifact(
      id: string,
      name: string,
      suffix: string,
      value: unknown,
    ): string {
      const artifactBase = `${id}-${safeSlug(name || suffix || "artifact")}`;
      const path = join(artifactDir, `${artifactBase}.${suffix}.json`);
      writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
      return path;
    },
    nextId(kind: string, name?: string): string {
      const slug = safeSlug(name ?? kind) || "run";
      return `${kind}-${slug}-${Date.now()}`;
    },
  };
}
