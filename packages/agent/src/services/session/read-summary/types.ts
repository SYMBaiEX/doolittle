export interface SessionMetadataResolver {
  metadata(sessionId: string):
    | {
        title?: string;
        continuityKey?: string;
        parentSessionId?: string;
        forkedFromMessageId?: string;
        rootSessionId?: string;
      }
    | undefined;
  continuityKeyFor(sessionId: string): string;
  projectIdForSession?(sessionId: string): string | undefined;
}

export interface SessionMessageRow {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}
