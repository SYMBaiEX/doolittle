export type AdvancedMemoryJsonPrimitive = string | number | boolean | null;
export type AdvancedMemoryJsonValue =
  | AdvancedMemoryJsonPrimitive
  | AdvancedMemoryJsonValue[]
  | {
      [key: string]: AdvancedMemoryJsonValue;
    };

export type AdvancedLongTermMemoryCategory =
  | "episodic"
  | "semantic"
  | "procedural";

export interface AdvancedLongTermMemory {
  id: string;
  agentId: string;
  entityId: string;
  category: AdvancedLongTermMemoryCategory;
  content: string;
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  confidence?: number;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount?: number;
  similarity?: number;
}

export interface AdvancedSessionSummary {
  id: string;
  agentId: string;
  roomId: string;
  entityId?: string;
  summary: string;
  messageCount: number;
  lastMessageOffset: number;
  startTime: Date;
  endTime: Date;
  topics?: string[];
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}
