import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AutocoderPipelineRunKind =
  | "research"
  | "prd"
  | "generate"
  | "qa"
  | "github.create"
  | "github.delete"
  | "secret.set";

export interface AutocoderPipelineRunRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  status: "completed" | "failed";
  input: Record<string, unknown>;
  outputPreview: string;
  artifactPaths: string[];
  linkedRunIds?: string[];
}

interface AutocoderPipelineStore {
  runs: AutocoderPipelineRunRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

function summarize(value: unknown): string {
  const raw =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  const compact = raw.replace(/\s+/gu, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

export class AutocoderPipelineService {
  private readonly storePath: string;
  private readonly artifactDir: string;

  constructor(rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.artifactDir = join(rootDir, "artifacts");
    mkdirSync(this.artifactDir, { recursive: true });
    this.storePath = join(rootDir, "pipeline-runs.json");
  }

  record(input: {
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    status?: "completed" | "failed";
    request: Record<string, unknown>;
    result: unknown;
    linkedRunIds?: string[];
  }): AutocoderPipelineRunRecord {
    const store = this.load();
    const id = this.nextId(
      input.kind,
      input.projectName ?? input.repositoryName,
    );
    const createdAt = nowIso();
    const artifactBase = `${id}-${safeSlug(input.projectName ?? input.repositoryName ?? input.kind)}`;
    const resultPath = join(this.artifactDir, `${artifactBase}.json`);
    writeFileSync(resultPath, JSON.stringify(input.result, null, 2), "utf8");
    const requestPath = join(this.artifactDir, `${artifactBase}.request.json`);
    writeFileSync(requestPath, JSON.stringify(input.request, null, 2), "utf8");

    const record: AutocoderPipelineRunRecord = {
      id,
      createdAt,
      updatedAt: createdAt,
      kind: input.kind,
      projectName: input.projectName,
      repositoryName: input.repositoryName,
      sessionId: input.sessionId,
      status: input.status ?? "completed",
      input: input.request,
      outputPreview: summarize(input.result),
      artifactPaths: [requestPath, resultPath],
      linkedRunIds: input.linkedRunIds?.length ? input.linkedRunIds : undefined,
    };
    store.runs.unshift(record);
    this.save(store);
    return record;
  }

  list(limit = 20): AutocoderPipelineRunRecord[] {
    return this.load().runs.slice(0, limit);
  }

  latest(
    kind?: AutocoderPipelineRunKind,
  ): AutocoderPipelineRunRecord | undefined {
    return this.load().runs.find((entry) =>
      kind ? entry.kind === kind : true,
    );
  }

  get(id: string): AutocoderPipelineRunRecord | undefined {
    return this.load().runs.find((entry) => entry.id === id);
  }

  summary() {
    const runs = this.load().runs;
    const counts = runs.reduce<Record<string, number>>((acc, run) => {
      acc[run.kind] = (acc[run.kind] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: runs.length,
      latest: runs[0],
      counts,
      failed: runs.filter((run) => run.status === "failed").length,
    };
  }

  private nextId(kind: string, name?: string): string {
    const slug = safeSlug(name ?? kind) || "run";
    return `${kind}-${slug}-${Date.now()}`;
  }

  private load(): AutocoderPipelineStore {
    if (!existsSync(this.storePath)) {
      return { runs: [] };
    }
    try {
      return JSON.parse(
        readFileSync(this.storePath, "utf8"),
      ) as AutocoderPipelineStore;
    } catch {
      return { runs: [] };
    }
  }

  private save(store: AutocoderPipelineStore): void {
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
  }
}
