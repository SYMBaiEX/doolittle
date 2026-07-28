import { randomUUID } from "node:crypto";
import type { SessionDatabase } from "@/services/session/database";
import type {
  SessionForkInput,
  SessionForkResult,
  SessionSummary,
  StoredMessage,
} from "@/types";
import type {
  SessionMessageActivityEvent,
  SessionMessageStore,
} from "../messages";
import type { SessionMetadataStore } from "../metadata";
import type { ProjectStore } from "../projects/store";
import type { SessionSummaryOperations } from "./summary";

const MAX_FORK_MESSAGES = 500;
const MAX_SESSION_ID_ATTEMPTS = 8;

export type SessionForkErrorCode =
  | "boundary_not_found"
  | "invalid_boundary"
  | "source_not_found"
  | "target_collision"
  | "transcript_too_large";

export class SessionForkError extends Error {
  constructor(
    readonly code: SessionForkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionForkError";
  }
}

export class SessionWriteOperations {
  constructor(
    private readonly db: SessionDatabase,
    private readonly messageStore: SessionMessageStore,
    private readonly metadataStore: SessionMetadataStore,
    private readonly projects: ProjectStore,
    private readonly summaries: SessionSummaryOperations,
  ) {}

  storeMessage(message: StoredMessage): void {
    this.messageStore.storeMessage(message);
  }

  replaceSessionMessages(sessionId: string, messages: StoredMessage[]): void {
    this.messageStore.replaceSessionMessages(sessionId, messages);
  }

  deleteLatestExchange(
    sessionId: string,
    options?: { skipSlashCommands?: boolean },
  ) {
    return this.messageStore.deleteLatestExchange(sessionId, options);
  }

  forkSession(input: SessionForkInput): SessionForkResult {
    const sourceSessionId = input.sourceSessionId.trim();
    if (!sourceSessionId || !this.messageStore.hasSession(sourceSessionId)) {
      throw new SessionForkError(
        "source_not_found",
        `Source session "${sourceSessionId}" was not found.`,
      );
    }
    if (
      input.throughMessageId !== undefined &&
      input.beforeMessageId !== undefined
    ) {
      throw new SessionForkError(
        "invalid_boundary",
        "throughMessageId and beforeMessageId are mutually exclusive.",
      );
    }
    if (
      (input.throughMessageId !== undefined &&
        !input.throughMessageId.trim()) ||
      (input.beforeMessageId !== undefined && !input.beforeMessageId.trim())
    ) {
      throw new SessionForkError(
        "invalid_boundary",
        "Fork message ids cannot be empty.",
      );
    }

    const boundary =
      input.beforeMessageId !== undefined
        ? ({ mode: "before", messageId: input.beforeMessageId } as const)
        : input.throughMessageId !== undefined
          ? ({ mode: "through", messageId: input.throughMessageId } as const)
          : ({ mode: "full" } as const);
    const prefix = this.messageStore.transcriptPrefix(
      sourceSessionId,
      boundary,
      MAX_FORK_MESSAGES,
    );
    if (boundary.mode !== "full" && !prefix.boundaryMessageId) {
      throw new SessionForkError(
        "boundary_not_found",
        `Message "${boundary.messageId}" was not found in source session "${sourceSessionId}".`,
      );
    }
    if (prefix.truncated) {
      throw new SessionForkError(
        "transcript_too_large",
        `The selected transcript prefix exceeds the ${MAX_FORK_MESSAGES}-message fork limit.`,
      );
    }

    const sessionId = this.createSessionId();
    const forkedFromMessageId =
      prefix.boundaryMessageId ?? prefix.copiedThroughMessageId;
    if (!forkedFromMessageId) {
      throw new SessionForkError(
        "boundary_not_found",
        "A fork boundary could not be resolved.",
      );
    }

    let result:
      | {
          continuityKey: string;
          rootSessionId: string;
          projectId?: string;
        }
      | undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.messageStore.copyMessagesToSession(
        sourceSessionId,
        sessionId,
        prefix.messages,
        randomUUID,
      );
      const lineage = this.metadataStore.recordFork(
        sourceSessionId,
        sessionId,
        forkedFromMessageId,
      );
      const projectId = this.projects.projectIdForSession(sourceSessionId);
      const carriedProjectId =
        projectId && this.projects.assignSession(sessionId, projectId)
          ? projectId
          : undefined;
      result = { ...lineage, projectId: carriedProjectId };
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (!result) {
      throw new Error("Fork transaction completed without a result.");
    }

    return {
      sessionId,
      sourceSessionId,
      parentSessionId: sourceSessionId,
      forkedFromMessageId,
      rootSessionId: result.rootSessionId,
      boundaryMode: boundary.mode,
      copiedThroughMessageId: prefix.copiedThroughMessageId,
      continuityKey: result.continuityKey,
      copiedMessageCount: prefix.messages.length,
      projectId: result.projectId,
      summary: this.summaries.summarize(sessionId),
    };
  }

  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
  ): () => void {
    return this.messageStore.onActivity(listener);
  }

  rename(sessionId: string, title: string): SessionSummary {
    return this.metadataStore.rename(sessionId, title);
  }

  private createSessionId(): string {
    for (let attempt = 0; attempt < MAX_SESSION_ID_ATTEMPTS; attempt += 1) {
      const sessionId = `fork:${randomUUID()}`;
      if (
        !this.messageStore.hasSession(sessionId) &&
        !this.metadataStore.metadata(sessionId)
      ) {
        return sessionId;
      }
    }
    throw new SessionForkError(
      "target_collision",
      "A unique fork session id could not be created.",
    );
  }
}
