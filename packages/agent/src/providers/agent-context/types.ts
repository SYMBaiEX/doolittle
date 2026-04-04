export type AgentContextScope = "minimal" | "local" | "full";

export interface AgentContextData extends Record<string, string | number> {
  scope: AgentContextScope;
  skillsCount: number;
  cronJobs: number;
  personality: string;
  terminalCommands: number;
}

export interface AgentContextCacheEntry {
  capturedAt: number;
  text: string;
  data: AgentContextData;
}

export interface AgentContextTurnCacheEntry {
  capturedAt: number;
  scopes: Map<AgentContextScope, AgentContextCacheEntry>;
}

export interface AgentContextRepoCacheEntry {
  capturedAt: number;
  summary: string;
}
