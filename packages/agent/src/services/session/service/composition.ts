import { EventEmitter } from "node:events";
import { SessionAdvancedMemoryStore } from "../advanced-memory";
import { SessionMessageStore } from "../messages";
import { SessionMetadataStore } from "../metadata";
import { SessionAdvancedMemoryOperations } from "./advanced-memory";
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
  let metadataStore!: SessionMetadataStore;

  const summaries = new SessionSummaryOperations(db, {
    metadata: (sessionId) => metadataStore.metadata(sessionId),
    continuityKeyFor,
  });
  metadataStore = new SessionMetadataStore(db, {
    summarize: summaries.summarize.bind(summaries),
    continuityKeyFor,
  });

  return {
    writes: new SessionWriteOperations(messageStore, metadataStore),
    reads: new SessionReadOperations(messageStore, metadataStore),
    summaries,
    advancedMemory: new SessionAdvancedMemoryOperations(
      new SessionAdvancedMemoryStore(db),
    ),
  };
}
