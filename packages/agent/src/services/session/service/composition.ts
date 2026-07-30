import { EventEmitter } from "node:events";
import { SessionTransferService } from "../../session-transfer";
import { SessionMessageStore } from "../messages";
import { SessionMetadataStore } from "../metadata";
import { ProjectStore } from "../projects/store";
import { SessionReadOperations } from "./read";
import type { SessionServiceState } from "./state";
import { SessionSummaryOperations } from "./summary";
import { continuityKeyFor, createSessionDatabase } from "./support";
import { SessionWriteOperations } from "./write";

export function createSessionServiceState(
  baseDir: string,
): SessionServiceState {
  const db = createSessionDatabase(baseDir);
  const events = new EventEmitter();
  const messageStore = new SessionMessageStore(db, events);
  const projects = new ProjectStore(db);
  let metadataStore!: SessionMetadataStore;

  const summaries = new SessionSummaryOperations(db, {
    metadata: (sessionId) => metadataStore.metadata(sessionId),
    continuityKeyFor,
    projectIdForSession: projects.projectIdForSession.bind(projects),
  });
  metadataStore = new SessionMetadataStore(db, {
    summarize: summaries.summarize.bind(summaries),
    continuityKeyFor,
  });
  const transfers = new SessionTransferService(
    db,
    messageStore,
    metadataStore,
    projects,
    summaries,
  );

  return {
    writes: new SessionWriteOperations(
      db,
      messageStore,
      metadataStore,
      projects,
      summaries,
    ),
    reads: new SessionReadOperations(messageStore, metadataStore),
    summaries,
    projects,
    transfers,
  };
}
