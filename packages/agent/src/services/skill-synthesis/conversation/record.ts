import type {
  ConversationGeneratedSkillRecord,
  ConversationRecordInput,
} from "./types";

export function buildConversationGeneratedSkillRecord(
  input: ConversationRecordInput,
): ConversationGeneratedSkillRecord {
  return {
    slug: input.candidate.slug,
    title: input.candidate.title,
    taskId: `conversation:${input.sessionId}`,
    path: input.path,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    noteCount: input.candidate.steps.length,
    signalCount: input.candidate.signals.length,
    objective: input.candidate.rationale,
  };
}
