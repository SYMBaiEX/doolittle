import type {
  DesktopRunUpdate,
  ManagedAttachmentDescriptor,
} from "../../shared/contracts";
import type { MemoryMatchSnapshot, SavedProfileMatch } from "../memory-matches";

export type Role = "user" | "assistant";
export type CopyState = "copied" | "failed";
export type BranchMode = "edit" | "fork" | "retry";

export interface ChatContextMessageCapsule {
  kind: "file" | "diff" | "review" | "brief" | "terminal" | "plan";
  path: string;
  source?: string;
}

export const MAX_MESSAGE_ATTACHMENTS = 8;
export const MAX_MESSAGE_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export interface ChatMemoryMatchState {
  query: string;
  matches: SavedProfileMatch[];
  status: "idle" | "loading" | "ready" | "error";
}

export interface DisplayMessage {
  id: string;
  role: Role;
  content: string;
  attachments?: ManagedAttachmentDescriptor[];
  createdAt: string;
  pending?: boolean;
  error?: boolean;
  memoryMatch?: MemoryMatchSnapshot;
  contextCapsule?: ChatContextMessageCapsule;
}

export type ConversationStore = Record<string, DisplayMessage[]>;

export interface RunReceipt {
  latest: DesktopRunUpdate;
  events: DesktopRunUpdate[];
}

export type RunReceiptStore = Record<string, RunReceipt>;

export function fileName(value: string): string {
  return value.split(/[/\\]+/u).pop() || "local workspace";
}

export function attachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.ceil(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export function isDesktopRunUpdate(value: unknown): value is DesktopRunUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const update = value as Partial<DesktopRunUpdate>;
  return (
    typeof update.type === "string" &&
    typeof update.sessionId === "string" &&
    Boolean(
      update.run &&
        typeof update.run === "object" &&
        typeof update.run.runId === "string" &&
        typeof update.run.status === "string",
    )
  );
}

export function runEventKey(update: DesktopRunUpdate): string {
  const mutation = update.run.localMutations.at(-1);
  return [
    update.type,
    update.run.observedActionCount,
    update.run.activeAction,
    update.run.lastAction,
    update.run.statusDetail,
    update.run.pendingApprovals,
    mutation?.recordedAt,
  ].join(":");
}

export interface RunEventCopy {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

export function runEventCopy(update: DesktopRunUpdate): RunEventCopy {
  const { run, type } = update;
  const mutation = run.localMutations.at(-1);
  switch (type) {
    case "started":
      return {
        label: "Run started",
        detail: `${run.runDepth} depth · ${run.configuredMaxIterations} iteration cap`,
        tone: "neutral",
      };
    case "thinking":
      return {
        label: "Thinking",
        detail: run.statusDetail || "Planning the next step",
        tone: "neutral",
      };
    case "acting":
    case "action-started":
      return {
        label: run.activeAction || "Tool started",
        detail: `Action ${Math.max(1, run.observedActionCount)} in progress`,
        tone: "warn",
      };
    case "action-completed":
      return {
        label: run.lastAction || "Tool completed",
        detail: `${run.observedActionCount} ${
          run.observedActionCount === 1 ? "action" : "actions"
        } observed`,
        tone: "good",
      };
    case "local-mutation":
      return {
        label: mutation?.success ? "Workspace changed" : "Change failed",
        detail: mutation
          ? `${mutation.action} · ${fileName(
              mutation.resolvedPath || mutation.requestedPath || "workspace",
            )}${
              mutation.bytes === undefined ? "" : ` · ${mutation.bytes} bytes`
            }`
          : "A local mutation was recorded",
        tone: mutation?.success ? "good" : "bad",
      };
    case "approvals":
      return {
        label: "Approval required",
        detail: `${run.pendingApprovals} pending ${
          run.pendingApprovals === 1 ? "decision" : "decisions"
        }`,
        tone: "warn",
      };
    case "waiting":
      return {
        label: "Waiting",
        detail: run.statusDetail || "Waiting for the next runtime signal",
        tone: run.pendingApprovals > 0 ? "warn" : "neutral",
      };
    case "completed":
      return {
        label: "Run completed",
        detail: `${run.observedActionCount} ${
          run.observedActionCount === 1 ? "action" : "actions"
        } · ${run.localMutations.length} ${
          run.localMutations.length === 1 ? "change" : "changes"
        }`,
        tone: "good",
      };
    case "error":
      return {
        label: "Run failed",
        detail: run.errorMessage || run.statusDetail || "Unknown runtime error",
        tone: "bad",
      };
    default:
      return {
        label: "Run update",
        detail: run.statusDetail || run.status,
        tone: "neutral",
      };
  }
}
