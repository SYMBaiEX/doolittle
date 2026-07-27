import {
  type AutocoderArtifactPayload,
  readAutocoderArtifact,
} from "./artifacts";
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

export interface AutocoderPipelineCancellationResult {
  run: AutocoderPipelineRunRecord;
  applied: boolean;
  alreadyCancelled: boolean;
  locallyActive: boolean;
  executionTerminationSupported: boolean;
  executionTerminated: boolean;
}

export class AutocoderRunCancelledError extends Error {
  readonly runId: string;

  constructor(runId: string, reason = "cancelled") {
    super(reason);
    this.name = "AutocoderRunCancelledError";
    this.runId = runId;
  }
}

export class AutocoderPipelineService {
  private readonly persistence;
  private readonly workflows;
  private readonly activeExecutions = new Map<string, AbortController>();

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
    return this.cancelRunExecution(id, reason).run;
  }

  cancelRunExecution(
    id: string,
    reason = "cancelled",
  ): AutocoderPipelineCancellationResult {
    const current = this.get(id);
    if (!current) {
      throw new Error(`Autocoder pipeline run not found: ${id}`);
    }
    if (current.status === "cancelled") {
      return {
        run: current,
        applied: false,
        alreadyCancelled: true,
        locallyActive: false,
        executionTerminationSupported: true,
        executionTerminated: false,
      };
    }
    if (current.status !== "pending" && current.status !== "running") {
      throw new Error(
        `Autocoder pipeline run ${id} is already ${current.status}.`,
      );
    }

    const controller = this.activeExecutions.get(id);
    const locallyActive = Boolean(controller);
    controller?.abort(new AutocoderRunCancelledError(id, reason));
    const run = this.workflows.cancelRun(id, reason);
    return {
      run,
      applied: true,
      alreadyCancelled: false,
      locallyActive,
      executionTerminationSupported: true,
      executionTerminated: locallyActive,
    };
  }

  isRunLocallyActive(id: string): boolean {
    return this.activeExecutions.has(id);
  }

  async executeRun<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T> | T,
  ): Promise<T> {
    const run = this.get(id);
    if (!run) {
      throw new Error(`Autocoder pipeline run not found: ${id}`);
    }
    if (run.status === "cancelled") {
      throw new AutocoderRunCancelledError(
        id,
        run.outputPreview || "cancelled",
      );
    }
    if (run.status !== "pending" && run.status !== "running") {
      throw new Error(`Autocoder pipeline run ${id} is already ${run.status}.`);
    }
    if (this.activeExecutions.has(id)) {
      throw new Error(`Autocoder pipeline run ${id} is already executing.`);
    }

    const controller = new AbortController();
    this.activeExecutions.set(id, controller);
    let rejectOnAbort: ((reason: unknown) => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = reject;
    });
    const onAbort = () => {
      rejectOnAbort?.(
        controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new AutocoderRunCancelledError(id),
      );
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });

    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) {
            throw controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new AutocoderRunCancelledError(id);
          }
          return operation(controller.signal);
        }),
        aborted,
      ]);
    } finally {
      controller.signal.removeEventListener("abort", onAbort);
      if (this.activeExecutions.get(id) === controller) {
        this.activeExecutions.delete(id);
      }
    }
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

  readArtifact(runId: string, index: number): AutocoderArtifactPayload {
    return readAutocoderArtifact({
      artifactRoot: this.persistence.artifactRoot,
      run: this.get(runId),
      runId,
      index,
    });
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
