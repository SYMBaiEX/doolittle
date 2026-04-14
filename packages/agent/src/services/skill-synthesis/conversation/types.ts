import type { StoredMessage } from "@/types";

export interface ConversationSkillCandidate {
  slug: string;
  title: string;
  rationale: string;
  category: string;
  steps: string[];
  signals: string[];
}

export interface ConversationAnalysisResult {
  shouldSynthesize: boolean;
  candidate?: ConversationSkillCandidate;
  reason?: string;
}

export interface ConversationGeneratedSkillRecord {
  slug: string;
  title: string;
  taskId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  signalCount: number;
  objective: string;
}

export interface ConversationAnalysisInput {
  generatedDir: string;
  candidate: ConversationSkillCandidate;
  messages: StoredMessage[];
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecordInput {
  candidate: ConversationSkillCandidate;
  sessionId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}
