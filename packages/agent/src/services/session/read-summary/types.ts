export interface SessionMetadataResolver {
  metadata(sessionId: string):
    | {
        title?: string;
        continuityKey?: string;
      }
    | undefined;
  continuityKeyFor(sessionId: string): string;
}

export interface SessionMessageRow {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}
