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

export type AutocoderPipelineLifecycleStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AutocoderPipelineRunRecord {
  id: string;
  workflowId: string;
  parentRunId?: string;
  taskId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string;
  phase: AutocoderPipelineRunKind;
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  status: AutocoderPipelineLifecycleStatus;
  input: Record<string, unknown>;
  outputPreview: string;
  artifactPaths: string[];
  linkedRunIds?: string[];
  error?: string;
}

export interface AutocoderPipelineWorkflowRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string;
  title: string;
  objective: string;
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  taskId?: string;
  status: AutocoderPipelineLifecycleStatus;
  runIds: string[];
  artifactPaths: string[];
  latestRunId?: string;
}

interface AutocoderPipelineStore {
  runs: AutocoderPipelineRunRecord[];
  workflows: AutocoderPipelineWorkflowRecord[];
}

interface UpdateRunInput {
  status: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
  result: unknown;
  linkedRunIds?: string[];
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

function createErrorResult(error: string): { error: string } {
  return { error };
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

  startWorkflow(input: {
    title: string;
    objective: string;
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
  }): AutocoderPipelineWorkflowRecord {
    const store = this.load();
    const createdAt = nowIso();
    const workflow: AutocoderPipelineWorkflowRecord = {
      id: this.nextId(
        "workflow",
        input.projectName ?? input.repositoryName ?? input.kind,
      ),
      createdAt,
      updatedAt: createdAt,
      startedAt: createdAt,
      title: input.title,
      objective: input.objective,
      kind: input.kind,
      projectName: input.projectName,
      repositoryName: input.repositoryName,
      sessionId: input.sessionId,
      taskId: input.taskId,
      status: "running",
      runIds: [],
      artifactPaths: [],
    };
    store.workflows.unshift(workflow);
    this.save(store);
    return workflow;
  }

  startRun(input: {
    workflowId: string;
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
    request: Record<string, unknown>;
    parentRunId?: string;
  }): AutocoderPipelineRunRecord {
    const store = this.load();
    const workflow = this.requireWorkflow(store, input.workflowId);
    const startedAt = nowIso();
    const run: AutocoderPipelineRunRecord = {
      id: this.nextId(input.kind, input.projectName ?? input.repositoryName),
      workflowId: workflow.id,
      parentRunId: input.parentRunId,
      taskId: input.taskId ?? workflow.taskId,
      createdAt: startedAt,
      updatedAt: startedAt,
      startedAt,
      phase: input.kind,
      kind: input.kind,
      projectName: input.projectName ?? workflow.projectName,
      repositoryName: input.repositoryName ?? workflow.repositoryName,
      sessionId: input.sessionId ?? workflow.sessionId,
      status: "running",
      input: input.request,
      outputPreview: "running",
      artifactPaths: [],
    };
    const requestPath = this.writeArtifact(
      run.id,
      input.projectName ?? input.repositoryName ?? input.kind,
      "request",
      input.request,
    );
    run.artifactPaths.push(requestPath);
    store.runs.unshift(run);
    workflow.runIds.push(run.id);
    workflow.latestRunId = run.id;
    workflow.updatedAt = startedAt;
    workflow.status = "running";
    this.save(store);
    return run;
  }

  completeRun(
    id: string,
    result: unknown,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord {
    return this.finishRun(id, {
      status: "completed",
      result,
      linkedRunIds: options?.linkedRunIds,
    });
  }

  failRun(
    id: string,
    error: string,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord {
    const record = this.finishRun(id, {
      status: "failed",
      result: createErrorResult(error),
      linkedRunIds: options?.linkedRunIds,
    });
    record.error = error;
    const store = this.load();
    const persisted = store.runs.find((entry) => entry.id === id);
    if (persisted) {
      persisted.error = error;
      this.refreshWorkflowState(store, persisted.workflowId);
      this.save(store);
      return persisted;
    }
    return record;
  }

  cancelRun(id: string, reason = "cancelled"): AutocoderPipelineRunRecord {
    return this.finishRun(id, {
      status: "cancelled",
      result: { cancelled: true, reason },
    });
  }

  record(input: {
    workflowId?: string;
    title?: string;
    objective?: string;
    kind: AutocoderPipelineRunKind;
    projectName?: string;
    repositoryName?: string;
    sessionId?: string;
    taskId?: string;
    status?: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
    request: Record<string, unknown>;
    result: unknown;
    linkedRunIds?: string[];
    parentRunId?: string;
  }): AutocoderPipelineRunRecord {
    const workflow = input.workflowId
      ? this.getWorkflow(input.workflowId)
      : this.startWorkflow({
          title:
            input.title ??
            `${input.kind} ${input.projectName ?? input.repositoryName ?? "workflow"}`,
          objective:
            input.objective ??
            summarize(
              input.request.description ??
                input.request.prompt ??
                input.request,
            ),
          kind: input.kind,
          projectName: input.projectName,
          repositoryName: input.repositoryName,
          sessionId: input.sessionId,
          taskId: input.taskId,
        });
    if (!workflow) {
      throw new Error(`Autocoder workflow not found: ${input.workflowId}`);
    }
    const run = this.startRun({
      workflowId: workflow.id,
      kind: input.kind,
      projectName: input.projectName,
      repositoryName: input.repositoryName,
      sessionId: input.sessionId,
      taskId: input.taskId,
      request: input.request,
      parentRunId: input.parentRunId,
    });
    if (input.status === "failed") {
      return this.failRun(
        run.id,
        typeof input.result === "string"
          ? input.result
          : summarize(input.result),
        {
          linkedRunIds: input.linkedRunIds,
        },
      );
    }
    if (input.status === "cancelled") {
      return this.cancelRun(run.id, summarize(input.result));
    }
    return this.completeRun(run.id, input.result, {
      linkedRunIds: input.linkedRunIds,
    });
  }

  list(limit = 20): AutocoderPipelineRunRecord[] {
    return this.load().runs.slice(0, limit);
  }

  listWorkflows(limit = 20): AutocoderPipelineWorkflowRecord[] {
    return this.load().workflows.slice(0, limit);
  }

  latest(
    kind?: AutocoderPipelineRunKind,
  ): AutocoderPipelineRunRecord | undefined {
    return this.load().runs.find((entry) =>
      kind ? entry.kind === kind : true,
    );
  }

  latestWorkflow(
    kind?: AutocoderPipelineRunKind,
  ): AutocoderPipelineWorkflowRecord | undefined {
    return this.load().workflows.find((entry) =>
      kind ? entry.kind === kind : true,
    );
  }

  get(id: string): AutocoderPipelineRunRecord | undefined {
    return this.load().runs.find((entry) => entry.id === id);
  }

  getWorkflow(id: string): AutocoderPipelineWorkflowRecord | undefined {
    return this.load().workflows.find((entry) => entry.id === id);
  }

  workflow(id: string): {
    workflow?: AutocoderPipelineWorkflowRecord;
    runs: AutocoderPipelineRunRecord[];
    tree: Array<
      AutocoderPipelineRunRecord & { children: AutocoderPipelineRunRecord[] }
    >;
  } {
    const store = this.load();
    const workflow = store.workflows.find((entry) => entry.id === id);
    const runs = store.runs
      .filter((entry) => entry.workflowId === id)
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const children = new Map<string, AutocoderPipelineRunRecord[]>();
    for (const run of runs) {
      if (!run.parentRunId) {
        continue;
      }
      const bucket = children.get(run.parentRunId) ?? [];
      bucket.push(run);
      children.set(run.parentRunId, bucket);
    }
    const tree = runs
      .filter((run) => !run.parentRunId)
      .map((run) => ({
        ...run,
        children: children.get(run.id) ?? [],
      }));
    return {
      workflow,
      runs,
      tree,
    };
  }

  bundleWorkflow(id: string): {
    workflow?: AutocoderPipelineWorkflowRecord;
    runs: AutocoderPipelineRunRecord[];
    manifestPath?: string;
  } {
    const view = this.workflow(id);
    if (!view.workflow) {
      return view;
    }
    const manifest = {
      workflow: view.workflow,
      runs: view.runs,
      generatedAt: nowIso(),
    };
    const manifestPath = this.writeArtifact(
      view.workflow.id,
      view.workflow.projectName ??
        view.workflow.repositoryName ??
        view.workflow.title,
      "workflow",
      manifest,
    );
    const store = this.load();
    const workflow = store.workflows.find((entry) => entry.id === id);
    if (workflow && !workflow.artifactPaths.includes(manifestPath)) {
      workflow.artifactPaths.push(manifestPath);
      workflow.updatedAt = nowIso();
      this.save(store);
      view.workflow = workflow;
    }
    return {
      workflow: view.workflow,
      runs: view.runs,
      manifestPath,
    };
  }

  summary() {
    const store = this.load();
    const runs = store.runs;
    const workflows = store.workflows;
    const counts = runs.reduce<Record<string, number>>((acc, run) => {
      acc[run.kind] = (acc[run.kind] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: runs.length,
      workflows: workflows.length,
      latest: runs[0],
      latestWorkflow: workflows[0],
      counts,
      failed: runs.filter((run) => run.status === "failed").length,
      failedWorkflows: workflows.filter(
        (workflow) => workflow.status === "failed",
      ).length,
      running: runs.filter((run) => run.status === "running").length,
      runningWorkflows: workflows.filter(
        (workflow) => workflow.status === "running",
      ).length,
    };
  }

  private finishRun(
    id: string,
    input: UpdateRunInput,
  ): AutocoderPipelineRunRecord {
    const store = this.load();
    const run = store.runs.find((entry) => entry.id === id);
    if (!run) {
      throw new Error(`Autocoder pipeline run not found: ${id}`);
    }
    const completedAt = nowIso();
    const resultPath = this.writeArtifact(
      run.id,
      run.projectName ?? run.repositoryName ?? run.kind,
      input.status === "completed" ? "result" : input.status,
      input.result,
    );
    run.status = input.status;
    run.completedAt = completedAt;
    run.updatedAt = completedAt;
    run.outputPreview = summarize(input.result);
    run.linkedRunIds = input.linkedRunIds?.length
      ? input.linkedRunIds
      : run.linkedRunIds;
    run.artifactPaths = Array.from(new Set([...run.artifactPaths, resultPath]));
    if (input.status === "failed") {
      run.error =
        typeof input.result === "string"
          ? input.result
          : summarize(input.result);
    }
    this.refreshWorkflowState(store, run.workflowId);
    this.save(store);
    return run;
  }

  private refreshWorkflowState(
    store: AutocoderPipelineStore,
    workflowId: string,
  ): void {
    const workflow = store.workflows.find((entry) => entry.id === workflowId);
    if (!workflow) {
      return;
    }
    const runs = store.runs.filter((entry) => entry.workflowId === workflowId);
    workflow.runIds = runs
      .slice()
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((entry) => entry.id);
    workflow.latestRunId = runs[0]?.id;
    workflow.artifactPaths = Array.from(
      new Set(runs.flatMap((entry) => entry.artifactPaths)),
    );
    workflow.updatedAt = nowIso();
    const statuses = new Set(runs.map((entry) => entry.status));
    if (!runs.length) {
      workflow.status = "pending";
      workflow.completedAt = undefined;
      return;
    }
    if (statuses.has("running") || statuses.has("pending")) {
      workflow.status = "running";
      workflow.completedAt = undefined;
      return;
    }
    if (statuses.has("failed")) {
      workflow.status = "failed";
      workflow.completedAt = nowIso();
      return;
    }
    if (statuses.has("cancelled")) {
      workflow.status = "cancelled";
      workflow.completedAt = nowIso();
      return;
    }
    workflow.status = "completed";
    workflow.completedAt = nowIso();
  }

  private requireWorkflow(
    store: AutocoderPipelineStore,
    id: string,
  ): AutocoderPipelineWorkflowRecord {
    const workflow = store.workflows.find((entry) => entry.id === id);
    if (!workflow) {
      throw new Error(`Autocoder workflow not found: ${id}`);
    }
    return workflow;
  }

  private nextId(kind: string, name?: string): string {
    const slug = safeSlug(name ?? kind) || "run";
    return `${kind}-${slug}-${Date.now()}`;
  }

  private writeArtifact(
    id: string,
    name: string,
    suffix: string,
    value: unknown,
  ): string {
    const artifactBase = `${id}-${safeSlug(name || suffix || "artifact")}`;
    const path = join(this.artifactDir, `${artifactBase}.${suffix}.json`);
    writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
    return path;
  }

  private load(): AutocoderPipelineStore {
    if (!existsSync(this.storePath)) {
      return { runs: [], workflows: [] };
    }
    try {
      const parsed = JSON.parse(
        readFileSync(this.storePath, "utf8"),
      ) as Partial<AutocoderPipelineStore>;
      return {
        runs: parsed.runs ?? [],
        workflows: parsed.workflows ?? [],
      };
    } catch {
      return { runs: [], workflows: [] };
    }
  }

  private save(store: AutocoderPipelineStore): void {
    writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
  }
}
