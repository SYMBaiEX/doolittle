import { randomUUID } from "node:crypto";
import type { SessionDatabase } from "@/services/session/database";
import type { SessionMessageStore } from "@/services/session/messages";
import type { SessionMetadataStore } from "@/services/session/metadata";
import type { ProjectStore } from "@/services/session/projects/store";
import type { SessionSummaryOperations } from "@/services/session/service/summary";
import type { StoredMessage } from "@/types";
import {
  DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
  DOOLITTLE_SESSION_ARCHIVE_VERSION,
  type DoolittleSessionArchiveV1,
  type ImportSessionArchiveInput,
  type ImportSessionArchiveResult,
  MAX_SESSION_ARCHIVE_BYTES,
  MAX_SESSION_ARCHIVE_MESSAGES,
  type SessionArchivePreview,
  SessionTransferError,
} from "./types";
import { validateSessionArchive } from "./validation";

const ARCHIVE_OMISSIONS = [
  "Attachment binaries are omitted; descriptors only.",
  "Secrets, provider credentials, settings, memories, workspace contents, structured tool outputs, and binaries are omitted.",
];
const MAX_ID_ATTEMPTS = 8;

export class SessionTransferService {
  constructor(
    private readonly db: SessionDatabase,
    private readonly messages: SessionMessageStore,
    private readonly metadata: SessionMetadataStore,
    private readonly projects: ProjectStore,
    private readonly summaries: SessionSummaryOperations,
    private readonly createId: () => string = randomUUID,
  ) {}

  exportSessionArchive(sessionId: string): DoolittleSessionArchiveV1 {
    const count = this.messages.countBySessionRole(sessionId);
    if (count === 0) {
      throw new SessionTransferError(
        "source_not_found",
        `Session "${sessionId}" was not found.`,
      );
    }
    if (count > MAX_SESSION_ARCHIVE_MESSAGES) {
      throw new SessionTransferError(
        "session_too_large",
        `Session exceeds the ${MAX_SESSION_ARCHIVE_MESSAGES}-message archive limit.`,
      );
    }
    const messages = this.messages.messagesBySession(
      sessionId,
      MAX_SESSION_ARCHIVE_MESSAGES,
    );
    const metadata = this.metadata.metadata(sessionId);
    const projectId = this.projects.projectIdForSession(sessionId);
    const projectLabel = projectId
      ? this.projects.get(projectId)?.name
      : undefined;
    const attachmentCount = messages.reduce(
      (total, message) => total + (message.attachments?.length ?? 0),
      0,
    );
    const archive: DoolittleSessionArchiveV1 = {
      schema: DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
      version: DOOLITTLE_SESSION_ARCHIVE_VERSION,
      manifest: {
        exportedAt: new Date().toISOString(),
        messageCount: messages.length,
        attachmentCount,
        omissions: [...ARCHIVE_OMISSIONS],
      },
      source: {
        application: "Doolittle",
        sessionId,
        rootSessionId: metadata?.rootSessionId ?? sessionId,
      },
      session: {
        title: metadata?.title,
        continuityKey: metadata?.continuityKey,
        parentSessionId: metadata?.parentSessionId,
        forkedFromMessageId: metadata?.forkedFromMessageId,
        projectLabel,
      },
      messages: messages.map((message) => ({
        id: message.id,
        originMessageId: message.originMessageId,
        role: message.role,
        text: message.text,
        attachments: message.attachments,
        createdAt: message.createdAt,
      })),
    };
    if (serializedBytes(archive) > MAX_SESSION_ARCHIVE_BYTES) {
      throw new SessionTransferError(
        "archive_too_large",
        `Session archive exceeds the ${MAX_SESSION_ARCHIVE_BYTES}-byte limit.`,
      );
    }
    return archive;
  }

  previewSessionArchive(input: unknown): SessionArchivePreview {
    return validateSessionArchive(input).preview;
  }

  importSessionArchive(
    input: ImportSessionArchiveInput,
  ): ImportSessionArchiveResult {
    const { archive, preview } = validateSessionArchive(input.archive);
    const project = input.projectId
      ? this.projects.get(input.projectId)
      : undefined;
    if (input.projectId && (!project || project.archivedAt)) {
      throw new SessionTransferError(
        "project_not_found",
        `Project "${input.projectId}" was not found or is archived.`,
      );
    }

    const sessionId = this.createSessionId();
    const storedMessages: StoredMessage[] = archive.messages.map((message) => ({
      id: message.id,
      originMessageId: message.originMessageId,
      sessionId: archive.source.sessionId,
      roomId: archive.source.sessionId,
      entityId: message.role === "user" ? "archive:user" : "archive:assistant",
      role: message.role,
      text: message.text,
      attachments: message.attachments,
      createdAt: message.createdAt,
    }));
    const importedAt = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.messages.copyMessagesToSession(
        archive.source.sessionId,
        sessionId,
        storedMessages,
        this.createId,
      );
      if (archive.session.title) {
        this.metadata.rename(sessionId, archive.session.title);
      }
      this.db
        .query(
          `
            INSERT INTO session_imports (
              session_id, archive_version, source_application,
              source_session_id, source_root_session_id, imported_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
          `,
        )
        .run(
          sessionId,
          archive.version,
          archive.source.application,
          archive.source.sessionId,
          archive.source.rootSessionId ?? null,
          importedAt,
        );
      if (project && !this.projects.assignSession(sessionId, project.id)) {
        throw new SessionTransferError(
          "project_not_found",
          `Project "${project.id}" could not be assigned.`,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return {
      sessionId,
      projectId: project?.id,
      importedMessageCount: storedMessages.length,
      provenance: {
        archiveVersion: archive.version,
        sourceApplication: archive.source.application,
        sourceSessionId: archive.source.sessionId,
        sourceRootSessionId: archive.source.rootSessionId,
      },
      summary: this.summaries.summarize(sessionId),
      omissionNotices: preview.omissionNotices,
    };
  }

  private createSessionId(): string {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const sessionId = `import:${this.createId()}`;
      if (
        !this.messages.hasSession(sessionId) &&
        !this.metadata.metadata(sessionId)
      ) {
        return sessionId;
      }
    }
    throw new SessionTransferError(
      "invalid_archive",
      "A unique imported session id could not be created.",
    );
  }
}

function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
