import type {
  AutocoderPipelineLifecycleStatus,
  AutocoderPipelineRunKind,
} from "./service";

interface RecordInput {
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  taskId?: string;
  title?: string;
  objective?: string;
  request: Record<string, unknown>;
}

interface RecordOutcomeInput extends RecordInput {
  status?: Exclude<AutocoderPipelineLifecycleStatus, "pending" | "running">;
  result: unknown;
  linkedRunIds?: string[];
}

export type AutocoderPipelineRecordOutcome =
  | {
      status: "failed";
      result: string;
      linkedRunIds?: string[];
    }
  | {
      status: "cancelled";
      result: string;
    }
  | {
      status: "completed";
      result: unknown;
      linkedRunIds?: string[];
    };

export function summarizeAutocoderPipelineValue(value: unknown): string {
  const raw =
    typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  const compact = raw.replace(/\s+/gu, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

export function createAutocoderPipelineErrorResult(error: string): {
  error: string;
} {
  return { error };
}

export function buildAutocoderPipelineWorkflowDraft(input: RecordInput): {
  title: string;
  objective: string;
  kind: AutocoderPipelineRunKind;
  projectName?: string;
  repositoryName?: string;
  sessionId?: string;
  taskId?: string;
} {
  return {
    title:
      input.title ??
      `${input.kind} ${input.projectName ?? input.repositoryName ?? "workflow"}`,
    objective:
      input.objective ??
      summarizeAutocoderPipelineValue(
        input.request.description ?? input.request.prompt ?? input.request,
      ),
    kind: input.kind,
    projectName: input.projectName,
    repositoryName: input.repositoryName,
    sessionId: input.sessionId,
    taskId: input.taskId,
  };
}

export function buildAutocoderPipelineRecordOutcome(
  input: RecordOutcomeInput,
): AutocoderPipelineRecordOutcome {
  if (input.status === "failed") {
    return {
      status: "failed",
      result:
        typeof input.result === "string"
          ? input.result
          : summarizeAutocoderPipelineValue(input.result),
      linkedRunIds: input.linkedRunIds,
    };
  }
  if (input.status === "cancelled") {
    return {
      status: "cancelled",
      result: summarizeAutocoderPipelineValue(input.result),
    };
  }
  return {
    status: "completed",
    result: input.result,
    linkedRunIds: input.linkedRunIds,
  };
}
