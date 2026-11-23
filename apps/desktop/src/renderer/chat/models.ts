import {
  isTransientRunUpdate,
  RUN_ACTIVITY_REPLAY_LIMIT,
} from "@doolittle/contracts/run";
import type {
  DesktopRunUpdate,
  ManagedAttachmentDescriptor,
} from "../../shared/contracts";
import type { MemoryMatchSnapshot, SavedProfileMatch } from "../memory-matches";

/** Both slash and historical bang commands route through the runtime catalog. */
export function isCommandMessage(message: string): boolean {
  return message.startsWith("/") || message.startsWith("!");
}

export type Role = "user" | "assistant";
export type CopyState = "copied" | "failed";
export type BranchMode = "edit" | "fork" | "retry";

export interface ChatContextMessageCapsule {
  kind: "file" | "diff" | "review" | "brief" | "terminal" | "plan" | "browser";
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
  /** Durable turn identity retained when optimistic IDs become history IDs. */
  runId?: string;
  role: Role;
  content: string;
  attachments?: ManagedAttachmentDescriptor[];
  createdAt: string;
  pending?: boolean;
  error?: boolean;
  replayGap?: true;
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
        Array.isArray(update.run.localMutations) &&
        typeof update.run.status === "string",
    )
  );
}

export function runEventKey(update: DesktopRunUpdate): string {
  const mutation = update.run.localMutations.at(-1);
  return JSON.stringify([
    update.type,
    update.run.observedActionCount,
    update.run.activeAction,
    update.run.lastAction,
    update.run.statusDetail,
    update.run.pendingApprovals,
    mutation?.recordedAt,
    update.run.walletActivities?.at(-1)?.id,
    update.activity,
    update.type === "action-completed" && update.activity && !update.activity.id
      ? update.run.updatedAt
      : undefined,
  ]);
}

/** Preserve activity details while high-frequency stream and liveness updates pass. */
export function retainRunEvents(
  events: DesktopRunUpdate[],
): DesktopRunUpdate[] {
  return events
    .filter((update) => !isTransientRunUpdate(update.type))
    .slice(-RUN_ACTIVITY_REPLAY_LIMIT);
}

/** Rebuild the compact activity timeline retained for a completed desktop run. */
export function historicalRunReceipt(
  run: unknown,
  persistedUpdates: unknown,
): RunReceipt | null {
  if (!run || typeof run !== "object" || Array.isArray(run)) return null;
  const candidate = run as Partial<DesktopRunUpdate["run"]>;
  const status = candidate.status;
  const type: DesktopRunUpdate["type"] | null =
    status === "complete"
      ? "completed"
      : status === "cancelled"
        ? "cancelled"
        : status === "error"
          ? "error"
          : null;
  if (!type || typeof candidate.sessionId !== "string") return null;

  const terminal: DesktopRunUpdate = {
    type,
    sessionId: candidate.sessionId,
    run: candidate as DesktopRunUpdate["run"],
  };
  if (!isDesktopRunUpdate(terminal)) return null;

  const seen = new Set<string>();
  const events = (Array.isArray(persistedUpdates) ? persistedUpdates : [])
    .filter(isDesktopRunUpdate)
    .filter(
      (update) =>
        update.sessionId === terminal.sessionId &&
        update.run.runId === terminal.run.runId,
    )
    .filter((update) => {
      const key = runEventKey(update);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const terminalKey = runEventKey(terminal);
  if (!seen.has(terminalKey)) events.push(terminal);
  return { latest: terminal, events: retainRunEvents(events) };
}

export function runActionLabel(action: string | null | undefined): string {
  if (!action) return "";
  const known: Record<string, string> = {
    CREATE_DIRECTORY: "Creating folder",
    DOOLITTLE_CODING: "Working on code",
    DOOLITTLE_REPOSITORY: "Checking repository",
    DOOLITTLE_WORKSPACE: "Inspecting workspace",
    GENERATE_MEDIA: "Generating media",
    PATCH_FILE: "Editing file",
    READ_FILE: "Reading file",
    SEARCH_FILES: "Searching files",
    SHELL: "Running command",
    TASKS_SPAWN_AGENT: "Delegating work",
    TERMINAL_SHELL: "Running command",
    WRITE_FILE: "Writing file",
  };
  return (
    known[action] ||
    action
      .toLowerCase()
      .replace(/_/gu, " ")
      .replace(/^\p{L}/u, (value) => value.toUpperCase())
  );
}
