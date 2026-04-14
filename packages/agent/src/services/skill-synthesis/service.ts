import { existsSync, readFileSync } from "node:fs";
import type { DelegationTaskRecord, StoredMessage } from "@/types";
import {
  analyzeConversationForSkill,
  buildConversationGeneratedSkillRecord,
  type ConversationAnalysisResult,
  type ConversationSkillCandidate,
  writeConversationSkillDocument,
} from "./conversation";
import {
  createGeneratedSkillStorage,
  type GeneratedSkillRecord,
} from "./storage";
import {
  buildGeneratedSkillSlug,
  hasGeneratedSkillForTask,
  synthesizeGeneratedSkillFromTask,
} from "./task";

export type {
  ConversationAnalysisResult,
  ConversationSkillCandidate,
} from "./conversation";

export class SkillSynthesisService {
  private readonly generatedDir: string;
  private readonly storage: ReturnType<typeof createGeneratedSkillStorage>;

  constructor(private readonly skillsDir: string) {
    this.storage = createGeneratedSkillStorage(this.skillsDir);
    this.generatedDir = this.storage.generatedDir;
  }

  synthesizeFromTask(task: DelegationTaskRecord): string {
    const index = this.storage.readIndex();
    const record = synthesizeGeneratedSkillFromTask(
      this.generatedDir,
      task,
      index.skills.find(
        (existing) =>
          existing.slug ===
          (buildGeneratedSkillSlug(task.title) || "generated-skill"),
      ),
    );
    this.storage.writeIndex({
      skills: [
        ...index.skills.filter((existing) => existing.slug !== record.slug),
        record,
      ],
    });
    return record.path;
  }

  synthesize(task: DelegationTaskRecord): string {
    return this.synthesizeFromTask(task);
  }

  // -------------------------------------------------------------------------
  // Post-session conversation-based skill synthesis
  // -------------------------------------------------------------------------

  /**
   * Analyses a list of stored messages from a completed session and decides
   * whether the conversation warrants creating a new reusable skill document.
   *
   * Returns a `ConversationAnalysisResult` that callers can use to:
   *   1. Decide whether to prompt the user ("Would you like to save this as a skill?")
   *   2. Immediately synthesize without confirmation (autonomous mode)
   */
  analyzeConversation(messages: StoredMessage[]): ConversationAnalysisResult {
    return analyzeConversationForSkill(messages);
  }

  /**
   * Synthesizes a skill document from a conversation analysis candidate and
   * writes it to disk. Returns the path of the created file.
   */
  synthesizeFromConversation(
    candidate: ConversationSkillCandidate,
    messages: StoredMessage[],
    sessionId: string,
  ): string {
    const index = this.storage.readIndex();
    const existing = index.skills.find((r) => r.slug === candidate.slug);
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const path = writeConversationSkillDocument({
      generatedDir: this.generatedDir,
      candidate,
      messages,
      sessionId,
      createdAt,
      updatedAt,
    });

    this.storage.writeIndex({
      skills: [
        ...index.skills.filter((r) => r.slug !== candidate.slug),
        buildConversationGeneratedSkillRecord({
          candidate,
          sessionId,
          path,
          createdAt,
          updatedAt,
        }),
      ],
    });

    return path;
  }

  /**
   * Combined helper: analyses the conversation and, if warranted, synthesizes
   * a skill document immediately. Returns the skill path or undefined.
   */
  maybeAutoSynthesize(
    messages: StoredMessage[],
    sessionId: string,
  ): { path: string; candidate: ConversationSkillCandidate } | undefined {
    const analysis = this.analyzeConversation(messages);
    if (!analysis.shouldSynthesize || !analysis.candidate) {
      return undefined;
    }
    const path = this.synthesizeFromConversation(
      analysis.candidate,
      messages,
      sessionId,
    );
    return { path, candidate: analysis.candidate };
  }

  hasGeneratedSkill(task: DelegationTaskRecord): boolean {
    return hasGeneratedSkillForTask(this.generatedDir, task);
  }

  listGeneratedSkills(limit = 20): GeneratedSkillRecord[] {
    return this.storage
      .readIndex()
      .skills.slice()
      .sort((a, b) =>
        (b.updatedAt ?? b.createdAt ?? "").localeCompare(
          a.updatedAt ?? a.createdAt ?? "",
        ),
      )
      .slice(0, limit);
  }

  getGeneratedSkill(slug: string): GeneratedSkillRecord | undefined {
    return this.storage
      .readIndex()
      .skills.find((record) => record.slug === slug);
  }

  describeGeneratedSkill(slug: string): string {
    const record = this.getGeneratedSkill(slug);
    if (!record) {
      return `Generated skill not found: ${slug}`;
    }
    const content = existsSync(record.path)
      ? readFileSync(record.path, "utf8")
      : "";
    return [
      `GENERATED SKILL: ${record.title}`,
      `Slug: ${record.slug}`,
      `Task ID: ${record.taskId}`,
      `Objective: ${record.objective}`,
      `Notes: ${record.noteCount}`,
      `Signals: ${record.signalCount}`,
      `Updated: ${record.updatedAt}`,
      `Path: ${record.path}`,
      "",
      content.slice(0, 4000),
    ].join("\n");
  }
}
