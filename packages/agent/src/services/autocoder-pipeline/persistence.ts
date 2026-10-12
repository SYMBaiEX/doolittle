import { lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { ensurePrivateDirectorySync } from "@/utils/private-directory";
import { readRegularFileSync } from "@/utils/read-regular-file";
import type {
  AutocoderPipelineRunRecord,
  AutocoderPipelineWorkflowRecord,
} from "./service";

export interface AutocoderPipelineStore {
  runs: AutocoderPipelineRunRecord[];
  workflows: AutocoderPipelineWorkflowRecord[];
}
const MAX_PIPELINE_STORE_BYTES = 4 * 1024 * 1024;

export interface AutocoderPipelinePersistence {
  readonly artifactRoot: string;
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

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function createAutocoderPipelinePersistence(
  rootDir: string,
): AutocoderPipelinePersistence {
  mkdirSync(rootDir, { recursive: true, mode: 0o700 });
  if (!lstatSync(rootDir).isDirectory())
    throw new Error("Pipeline root must be a directory.");
  const artifactDir = join(rootDir, "artifacts");
  ensurePrivateDirectorySync(artifactDir);
  const assertArtifactDirectory = () => {
    const artifactInfo = lstatSync(artifactDir);
    if (!artifactInfo.isDirectory() || artifactInfo.isSymbolicLink())
      throw new Error("Artifact directory must be a real directory.");
  };
  assertArtifactDirectory();
  const storePath = join(rootDir, "pipeline-runs.json");

  return {
    artifactRoot: artifactDir,
    loadStore(): AutocoderPipelineStore {
      if (!exists(storePath)) return { runs: [], workflows: [] };
      const parsed = JSON.parse(
        readRegularFileSync(storePath, MAX_PIPELINE_STORE_BYTES, {
          singleLink: true,
        }).toString("utf8"),
      ) as Partial<AutocoderPipelineStore>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(parsed.runs) ||
        !Array.isArray(parsed.workflows)
      ) {
        throw new Error("Pipeline store has invalid structure.");
      }
      const validRecord = (record: unknown): boolean =>
        !!record &&
        typeof record === "object" &&
        !Array.isArray(record) &&
        typeof (record as Record<string, unknown>).id === "string" &&
        Array.isArray((record as Record<string, unknown>).artifactPaths);
      if (
        !parsed.runs.every(validRecord) ||
        !parsed.workflows.every(validRecord)
      ) {
        throw new Error("Pipeline store has invalid records.");
      }
      return { runs: parsed.runs, workflows: parsed.workflows };
    },
    saveStore(store: AutocoderPipelineStore): void {
      if (
        Buffer.byteLength(JSON.stringify(store, null, 2), "utf8") >
        MAX_PIPELINE_STORE_BYTES
      ) {
        throw new Error("Pipeline store exceeds its byte limit.");
      }
      if (exists(storePath)) this.loadStore();
      writeJsonAtomicSync(storePath, store);
    },
    writeArtifact(
      id: string,
      name: string,
      suffix: string,
      value: unknown,
    ): string {
      if (
        !/^[a-z0-9][a-z0-9.-]{0,127}$/iu.test(id) ||
        !/^[a-z0-9][a-z0-9-]{0,47}$/iu.test(suffix)
      ) {
        throw new Error("Artifact identifier or suffix is invalid.");
      }
      assertArtifactDirectory();
      const artifactBase = `${id}-${safeSlug(name || suffix || "artifact")}`;
      const path = join(artifactDir, `${artifactBase}.${suffix}.json`);
      if (exists(path))
        readRegularFileSync(path, 4 * 1024 * 1024, { singleLink: true });
      writeJsonAtomicSync(path, value);
      return path;
    },
    nextId(kind: string, name?: string): string {
      const slug = safeSlug(name ?? kind) || "run";
      return `${kind}-${slug}-${Date.now()}`;
    },
  };
}
