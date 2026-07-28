import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NodeSessionDatabase,
  type SessionDatabase,
} from "@/services/session/database";
import { SessionMessageStore } from "@/services/session/messages";
import { SessionMetadataStore } from "@/services/session/metadata";
import { ProjectStore } from "@/services/session/projects/store";
import { SessionService } from "@/services/session/service";
import { SessionSummaryOperations } from "@/services/session/service/summary";
import {
  continuityKeyFor,
  createSessionDatabase,
} from "@/services/session/service/support";
import {
  DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
  type DoolittleSessionArchiveV1,
  MAX_SESSION_ARCHIVE_BYTES,
  type SessionTransferError,
} from ".";
import { SessionTransferService } from "./service";
import { validateSessionArchive } from "./validation";

describe("session transfer", () => {
  it("round-trips an inspectable archive with fresh ids and no implicit project activation", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-transfer-"));
    const service = new SessionService(root);
    try {
      const project = service.createProject({
        id: "project-1",
        name: "Safe project label",
        primaryPath: "/private/workspace/never-export",
      });
      service.storeMessage({
        id: "source-user",
        sessionId: "source",
        roomId: "source",
        entityId: "user:1",
        role: "user",
        text: "Review the release.",
        attachments: [
          {
            id: "attachment-1",
            name: "release.md",
            kind: "document",
            mimeType: "text/markdown",
            sizeBytes: 42,
            sha256: "a".repeat(64),
          },
        ],
        createdAt: "2026-07-28T00:00:00.000Z",
      });
      service.storeMessage({
        id: "source-assistant",
        sessionId: "source",
        roomId: "source",
        entityId: "assistant:1",
        role: "assistant",
        text: "The release is ready.",
        createdAt: "2026-07-28T00:00:01.000Z",
      });
      service.rename("source", "Release review");
      expect(service.assignSessionProject("source", project.id)).toBe(true);

      const archive = service.exportSessionArchive("source");
      expect(archive).toMatchObject({
        schema: DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
        version: 1,
        manifest: {
          messageCount: 2,
          attachmentCount: 1,
        },
        source: { sessionId: "source" },
        session: {
          title: "Release review",
          projectLabel: "Safe project label",
        },
      });
      expect(JSON.stringify(archive)).not.toContain(
        "/private/workspace/never-export",
      );
      expect(archive.manifest.omissions.join(" ")).toContain(
        "Attachment binaries",
      );
      expect(service.previewSessionArchive(archive)).toMatchObject({
        messageCount: 2,
        attachmentCount: 1,
        title: "Release review",
      });

      const imported = service.importSessionArchive({ archive });
      expect(imported.sessionId).toMatch(/^import:/);
      expect(imported.sessionId).not.toBe("source");
      expect(imported.projectId).toBeUndefined();
      expect(service.projectIdForSession(imported.sessionId)).toBeUndefined();
      expect(imported.summary.title).toBe("Release review");
      const importedMessages = service.messagesBySession(
        imported.sessionId,
        10,
      );
      expect(importedMessages.map((message) => message.id)).not.toEqual([
        "source-user",
        "source-assistant",
      ]);
      expect(
        importedMessages.map((message) => message.originMessageId),
      ).toEqual(["source-user", "source-assistant"]);
      expect(importedMessages.map((message) => message.text)).toEqual([
        "Review the release.",
        "The release is ready.",
      ]);
      expect(service.messagesBySession("source", 10)).toHaveLength(2);

      const scoped = service.importSessionArchive({
        archive,
        projectId: project.id,
      });
      expect(scoped.projectId).toBe(project.id);
      expect(service.projectIdForSession(scoped.sessionId)).toBe(project.id);

      const db = new NodeSessionDatabase(join(root, "state.db"));
      expect(
        db
          .query(
            `SELECT source_application as sourceApplication, source_session_id as sourceSessionId
             FROM session_imports WHERE session_id = ?1`,
          )
          .get(imported.sessionId),
      ).toEqual({
        sourceApplication: "Doolittle",
        sourceSessionId: "source",
      });
      db.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects missing exports and unsafe archive structures before writing", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-transfer-errors-"));
    const service = new SessionService(root);
    try {
      expect(() => service.exportSessionArchive("missing")).toThrowError(
        expect.objectContaining<Partial<SessionTransferError>>({
          code: "source_not_found",
        }),
      );
      const archive = archiveFixture();
      expect(() =>
        validateSessionArchive({ ...archive, version: 2 }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionTransferError>>({
          code: "unsupported_version",
        }),
      );
      expect(() =>
        validateSessionArchive({
          ...archive,
          messages: [archive.messages[0], archive.messages[0]],
          manifest: { ...archive.manifest, messageCount: 2 },
        }),
      ).toThrow("duplicated");
      expect(() =>
        validateSessionArchive({
          ...archive,
          messages: [{ ...archive.messages[0], role: "system" }],
        }),
      ).toThrow("cannot be system");
      expect(() =>
        validateSessionArchive({
          ...archive,
          messages: [
            {
              ...archive.messages[0],
              attachments: [
                {
                  id: "attachment",
                  name: nestedValue(14),
                },
              ],
            },
          ],
        }),
      ).toThrow("nesting");
      expect(() =>
        validateSessionArchive({
          ...archive,
          settings: { apiKey: "must-not-hitchhike" },
        }),
      ).toThrow("settings is not allowed");
      expect(() =>
        validateSessionArchive({
          ...archive,
          messages: [
            {
              ...archive.messages[0],
              text: "x".repeat(MAX_SESSION_ARCHIVE_BYTES),
            },
          ],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<SessionTransferError>>({
          code: "archive_too_large",
        }),
      );
      expect(service.listSessions(20)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rolls back messages, origins, and provenance when an import write fails", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-transfer-atomic-"));
    const db = createSessionDatabase(root);
    try {
      const ids = ["session-id", "duplicate-message", "duplicate-message"];
      const transfer = createTransferService(db, () => ids.shift() ?? "same");
      expect(() =>
        transfer.importSessionArchive({ archive: archiveFixture(2) }),
      ).toThrow();
      expect(db.query("SELECT COUNT(*) as count FROM messages").get()).toEqual({
        count: 0,
      });
      expect(
        db.query("SELECT COUNT(*) as count FROM message_origins").get(),
      ).toEqual({ count: 0 });
      expect(
        db.query("SELECT COUNT(*) as count FROM session_imports").get(),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function archiveFixture(messageCount = 1): DoolittleSessionArchiveV1 {
  return {
    schema: DOOLITTLE_SESSION_ARCHIVE_SCHEMA,
    version: 1,
    manifest: {
      exportedAt: "2026-07-28T00:00:02.000Z",
      messageCount,
      attachmentCount: 0,
      omissions: ["Attachment binaries are omitted; descriptors only."],
    },
    source: {
      application: "Doolittle",
      sessionId: "source-session",
      rootSessionId: "source-session",
    },
    session: { title: "Imported session" },
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `source-${index}`,
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${index}`,
      createdAt: `2026-07-28T00:00:0${index}.000Z`,
    })),
  };
}

function nestedValue(depth: number): unknown {
  let value: unknown = "leaf";
  for (let index = 0; index < depth; index += 1) {
    value = { child: value };
  }
  return value;
}

function createTransferService(
  db: SessionDatabase,
  createId: () => string,
): SessionTransferService {
  const messages = new SessionMessageStore(db, new EventEmitter());
  const projects = new ProjectStore(db);
  let metadata!: SessionMetadataStore;
  const summaries = new SessionSummaryOperations(db, {
    metadata: (sessionId) => metadata.metadata(sessionId),
    continuityKeyFor,
    projectIdForSession: projects.projectIdForSession.bind(projects),
  });
  metadata = new SessionMetadataStore(db, {
    summarize: summaries.summarize.bind(summaries),
    continuityKeyFor,
  });
  return new SessionTransferService(
    db,
    messages,
    metadata,
    projects,
    summaries,
    createId,
  );
}
