import type {
  AdvancedLongTermMemoryCategory,
  AdvancedMemoryJsonValue,
} from "../service";

export interface LongTermMemoryRow {
  id: string;
  agent_id: string;
  entity_id: string;
  category: AdvancedLongTermMemoryCategory;
  content: string;
  metadata: string | null;
  embedding: string | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number | null;
}

export interface SessionSummaryRow {
  id: string;
  agent_id: string;
  room_id: string;
  entity_id: string | null;
  summary: string;
  message_count: number;
  last_message_offset: number;
  start_time: string;
  end_time: string;
  topics: string | null;
  metadata: string | null;
  embedding: string | null;
  created_at: string;
  updated_at: string;
}

export type AdvancedMemoryMetadata = Record<string, AdvancedMemoryJsonValue>;
