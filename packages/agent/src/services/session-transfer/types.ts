import type { SessionSummary, StoredMessageAttachment } from "@/types";

export const DOOLITTLE_SESSION_ARCHIVE_SCHEMA = "doolittle.session.archive";
export const DOOLITTLE_SESSION_ARCHIVE_VERSION = 1;
export const MAX_SESSION_ARCHIVE_BYTES = 2_000_000;
export const MAX_SESSION_ARCHIVE_MESSAGES = 500;

export interface DoolittleSessionArchiveMessageV1 {
  id: string;
  originMessageId?: string;
  role: "assistant" | "system" | "user";
  text: string;
  attachments?: StoredMessageAttachment[];
  createdAt: string;
}

export interface DoolittleSessionArchiveV1 {
  schema: typeof DOOLITTLE_SESSION_ARCHIVE_SCHEMA;
  version: typeof DOOLITTLE_SESSION_ARCHIVE_VERSION;
  manifest: {
    exportedAt: string;
    messageCount: number;
    attachmentCount: number;
    omissions: string[];
  };
  source: {
    application: string;
    sessionId: string;
    rootSessionId?: string;
  };
  session: {
    title?: string;
    continuityKey?: string;
    parentSessionId?: string;
    forkedFromMessageId?: string;
    projectLabel?: string;
  };
  messages: DoolittleSessionArchiveMessageV1[];
}

export interface SessionArchivePreview {
  schema: typeof DOOLITTLE_SESSION_ARCHIVE_SCHEMA;
  version: typeof DOOLITTLE_SESSION_ARCHIVE_VERSION;
  serializedBytes: number;
  sourceApplication: string;
  sourceSessionId: string;
  title?: string;
  projectLabel?: string;
  messageCount: number;
  attachmentCount: number;
  startedAt: string;
  endedAt: string;
  omissionNotices: string[];
}

export interface ImportSessionArchiveInput {
  archive: unknown;
  projectId?: string;
}

export interface ImportSessionArchiveResult {
  sessionId: string;
  projectId?: string;
  importedMessageCount: number;
  provenance: {
    archiveVersion: 1;
    sourceApplication: string;
    sourceSessionId: string;
    sourceRootSessionId?: string;
  };
  summary: SessionSummary;
  omissionNotices: string[];
}

export type SessionTransferErrorCode =
  | "archive_too_large"
  | "invalid_archive"
  | "project_not_found"
  | "session_too_large"
  | "source_not_found"
  | "unsupported_version";

export class SessionTransferError extends Error {
  constructor(
    readonly code: SessionTransferErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SessionTransferError";
  }
}
