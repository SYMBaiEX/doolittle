export interface NativeKnowledgeService {
  ingestPdf(path: string): Promise<unknown>;
  extractPdf?(path: string): Promise<string>;
  remember(text: string, source?: string): unknown;
  recall(query: string, limit?: number): unknown;
  search?(query: string, limit?: number): unknown;
  read?(target?: "memory" | "user"): string;
  list?(target?: "memory" | "user"): string[];
  summary?(target?: "memory" | "user"): unknown;
}

export interface NativePersonalityService {
  list(): unknown[];
  get(id: string): unknown;
  activate(id: string): unknown;
  activeId(): string | undefined;
  summary?(): unknown;
}

export interface NativeRolodexService {
  card(userId: string): unknown;
  remember(
    userId: string,
    kind: string,
    text: string,
    source?: string,
  ): unknown;
  recall(userId: string, query: string): unknown;
  observeAgent(text: string, source?: string): unknown;
  agentProfile(): unknown;
  summary?(): unknown;
  search?(query: string, limit?: number): unknown;
  beliefs?(userId: string): unknown;
  relationship?(userId: string): unknown;
  engagement?(userId: string): unknown;
}

export interface NativeExperienceService {
  usage(sessionId: string): unknown;
  recent?(limit?: number): unknown;
  memorySnapshot?(): unknown;
  summary?(): unknown;
}
