import type { SessionSummary, StoredMessage } from "@/types";
import type {
  SessionMessageActivityEvent,
  SessionMessageStore,
} from "../messages";
import type { SessionMetadataStore } from "../metadata";

export class SessionWriteOperations {
  constructor(
    private readonly messageStore: SessionMessageStore,
    private readonly metadataStore: SessionMetadataStore,
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

  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
  ): () => void {
    return this.messageStore.onActivity(listener);
  }

  rename(sessionId: string, title: string): SessionSummary {
    return this.metadataStore.rename(sessionId, title);
  }
}
