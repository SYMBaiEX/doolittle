import { createAutocoderPipelinePersistence } from "./persistence";
import {
  buildAutocoderPipelineSummary,
  buildAutocoderWorkflowView,
  findAutocoderLatestRun,
  findAutocoderLatestWorkflow,
} from "./read-model";
import { createAutocoderPipelineWorkflowActions } from "./workflow-actions";

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

export class AutocoderPipelineService {
  private readonly persistence;
  private readonly workflows;

  constructor(rootDir: string) {
    this.persistence = createAutocoderPipelinePersistence(rootDir);
    this.workflows = createAutocoderPipelineWorkflowActions(this.persistence);
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
    return this.workflows.startWorkflow(input);
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
    return this.workflows.startRun(input);
  }

  completeRun(
    id: string,
    result: unknown,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord {
    return this.workflows.completeRun(id, result, options);
  }

  failRun(
    id: string,
    error: string,
    options?: {
      linkedRunIds?: string[];
    },
  ): AutocoderPipelineRunRecord {
    return this.workflows.failRun(id, error, options);
  }

  cancelRun(id: string, reason = "cancelled"): AutocoderPipelineRunRecord {
    return this.workflows.cancelRun(id, reason);
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
    return this.workflows.record(input);
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
    return findAutocoderLatestRun(this.load(), kind);
  }

  latestWorkflow(
    kind?: AutocoderPipelineRunKind,
  ): AutocoderPipelineWorkflowRecord | undefined {
    return findAutocoderLatestWorkflow(this.load(), kind);
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
    return buildAutocoderWorkflowView(this.load(), id);
  }

  bundleWorkflow(id: string): {
    workflow?: AutocoderPipelineWorkflowRecord;
    runs: AutocoderPipelineRunRecord[];
    manifestPath?: string;
  } {
    return this.workflows.bundleWorkflow(id);
  }

  summary() {
    return buildAutocoderPipelineSummary(this.load());
  }

  private load() {
    return this.persistence.loadStore();
  }
}
