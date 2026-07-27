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
  type CreateSkillProposalInput,
  proposalDescriptionFromContent,
  proposalTitleFromContent,
  type SkillProposalRecord,
  validateSkillProposal,
} from "./proposal";
import {
  createGeneratedSkillStorage,
  type GeneratedSkillRecord,
} from "./storage";
import {
  buildGeneratedSkillSlug,
  hasGeneratedSkillForTask,
  synthesizeGeneratedSkillFromTask,
  writeGeneratedSkillContent,
} from "./task";

export type {
  ConversationAnalysisResult,
  ConversationSkillCandidate,
} from "./conversation";
export type {
  CreateSkillProposalInput,
  SkillProposalDisposition,
  SkillProposalRecord,
  SkillProposalSafetyFinding,
  SkillProposalSafetyOutcome,
} from "./proposal";

export type SkillProposalTransition =
  | { kind: "approved"; proposal: SkillProposalRecord; idempotent: boolean }
  | { kind: "rejected"; proposal: SkillProposalRecord; idempotent: boolean }
  | { kind: "not_found" }
  | { kind: "invalid"; errors: string[]; proposal: SkillProposalRecord }
  | { kind: "blocked"; proposal: SkillProposalRecord }
  | { kind: "already_decided"; proposal: SkillProposalRecord };

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

  /**
   * Records a reviewable proposal only. This deliberately does not create a
   * SKILL.md, so generated instructions cannot enter the active catalog until
   * an operator makes an explicit approval decision.
   */
  createProposal(input: CreateSkillProposalInput): SkillProposalRecord {
    const normalized: CreateSkillProposalInput = {
      ...input,
      slug: input.slug.trim(),
      title: input.title?.trim(),
      description: input.description?.trim(),
      content: input.content.trim(),
      taskId: input.taskId?.trim(),
      objective: input.objective?.trim(),
    };
    const validation = validateSkillProposal(normalized);
    if (!validation.valid) {
      throw new SkillProposalValidationError(validation.errors);
    }

    const now = new Date().toISOString();
    const proposals = this.storage.readProposals();
    const existing = proposals.proposals.find(
      (proposal) =>
        proposal.disposition === "pending" && proposal.slug === normalized.slug,
    );
    if (existing) {
      return existing;
    }
    const record: SkillProposalRecord = {
      id: `skill-proposal-${crypto.randomUUID()}`,
      slug: normalized.slug,
      title:
        normalized.title ||
        proposalTitleFromContent(normalized.content, normalized.slug),
      description:
        normalized.description ||
        proposalDescriptionFromContent(normalized.content),
      content: normalized.content,
      taskId: normalized.taskId || "proposal",
      objective: normalized.objective || "",
      noteCount: normalized.noteCount ?? 0,
      signalCount: normalized.signalCount ?? 0,
      createdAt: now,
      updatedAt: now,
      disposition: "pending",
      safety: validation.safety,
      findings: validation.findings,
    };
    this.storage.writeProposals({
      proposals: [...proposals.proposals, record],
    });
    return record;
  }

  listProposals(limit = 100): SkillProposalRecord[] {
    return this.storage
      .readProposals()
      .proposals.slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(0, Math.min(limit, 100)));
  }

  getProposal(id: string): SkillProposalRecord | undefined {
    return this.storage
      .readProposals()
      .proposals.find((proposal) => proposal.id === id);
  }

  approveProposal(id: string): SkillProposalTransition {
    const proposals = this.storage.readProposals();
    const current = proposals.proposals.find((proposal) => proposal.id === id);
    if (!current) return { kind: "not_found" };
    if (current.disposition === "approved") {
      return { kind: "approved", proposal: current, idempotent: true };
    }
    if (current.disposition === "rejected") {
      return { kind: "already_decided", proposal: current };
    }
    const validation = validateSkillProposal(current);
    if (!validation.valid) {
      return { kind: "invalid", errors: validation.errors, proposal: current };
    }
    if (validation.safety === "blocked") {
      return { kind: "blocked", proposal: current };
    }

    const path = writeGeneratedSkillContent(
      this.generatedDir,
      current.slug,
      current.content,
    );
    const now = new Date().toISOString();
    const approved: SkillProposalRecord = {
      ...current,
      updatedAt: now,
      decidedAt: now,
      disposition: "approved",
      safety: validation.safety,
      findings: validation.findings,
      activatedPath: path,
    };
    this.storage.writeProposals({
      proposals: proposals.proposals.map((proposal) =>
        proposal.id === id ? approved : proposal,
      ),
    });
    this.upsertGeneratedRecord(approved, path);
    return { kind: "approved", proposal: approved, idempotent: false };
  }

  rejectProposal(id: string, reason?: string): SkillProposalTransition {
    const proposals = this.storage.readProposals();
    const current = proposals.proposals.find((proposal) => proposal.id === id);
    if (!current) return { kind: "not_found" };
    if (current.disposition === "rejected") {
      return { kind: "rejected", proposal: current, idempotent: true };
    }
    if (current.disposition === "approved") {
      return { kind: "already_decided", proposal: current };
    }
    const now = new Date().toISOString();
    const rejected: SkillProposalRecord = {
      ...current,
      updatedAt: now,
      decidedAt: now,
      disposition: "rejected",
      rejectionReason: reason?.trim().slice(0, 500) || undefined,
    };
    this.storage.writeProposals({
      proposals: proposals.proposals.map((proposal) =>
        proposal.id === id ? rejected : proposal,
      ),
    });
    return { kind: "rejected", proposal: rejected, idempotent: false };
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

  private upsertGeneratedRecord(
    proposal: SkillProposalRecord,
    path: string,
  ): void {
    const index = this.storage.readIndex();
    const existing = index.skills.find(
      (record) => record.slug === proposal.slug,
    );
    const record: GeneratedSkillRecord = {
      slug: proposal.slug,
      title: proposal.title,
      taskId: proposal.taskId,
      path,
      createdAt: existing?.createdAt ?? proposal.createdAt,
      updatedAt: proposal.updatedAt,
      noteCount: proposal.noteCount,
      signalCount: proposal.signalCount,
      objective: proposal.objective,
    };
    this.storage.writeIndex({
      skills: [
        ...index.skills.filter(
          (existingRecord) => existingRecord.slug !== record.slug,
        ),
        record,
      ],
    });
  }
}

export class SkillProposalValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("; "));
    this.name = "SkillProposalValidationError";
  }
}
