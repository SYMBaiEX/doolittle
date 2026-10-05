import { randomUUID } from "node:crypto";
import type { SharedKnowledgeRecord } from "@doolittle/contracts/bots";
import type { BackendLaunchTarget } from "./backend";
import { BotKnowledgeLedger } from "./bot-knowledge-ledger";
import type { BotProcessRegistry } from "./bot-process-registry";
import { KnowledgeDocumentWorker } from "./knowledge-document-worker";

const ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const MAX_TRANSCRIPT_BYTES = 2_000_000;

export interface PromoteKnowledgeInput {
  sourceBotId: string;
  sessionId: string;
  runId: string;
  messageId: string;
  projectId: string;
  title: string;
  consent: true;
}

interface DocumentStore {
  add(input: {
    clientDocumentId: string;
    content: string;
    title: string;
    projectId: string;
  }): Promise<string>;
  read(documentId: string): Promise<string>;
  stop(): Promise<void>;
}

/** Explicit promotion and current-membership grants; no private-memory reads. */
export class BotKnowledgeBroker {
  readonly ledger: BotKnowledgeLedger;
  private readonly documents: DocumentStore;

  constructor(
    private readonly bots: BotProcessRegistry,
    target: BackendLaunchTarget,
    dataDir: string,
    private readonly runtimeFetch: typeof fetch = fetch,
    documents?: DocumentStore,
  ) {
    this.ledger = new BotKnowledgeLedger(dataDir);
    this.documents =
      documents ?? new KnowledgeDocumentWorker(target, dataDir, runtimeFetch);
  }

  async promote(input: PromoteKnowledgeInput): Promise<SharedKnowledgeRecord> {
    if (
      input.consent !== true ||
      !ID.test(input.sourceBotId) ||
      !ID.test(input.sessionId) ||
      !ID.test(input.runId) ||
      !ID.test(input.messageId) ||
      !ID.test(input.projectId) ||
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 300
    ) {
      throw new Error("Explicit, scoped knowledge promotion is required.");
    }
    const sourceBot = this.bots.get(input.sourceBotId);
    const owner = await this.bots.ensureConversationOwner(
      sourceBot.id,
      input.sessionId,
    );
    await this.bots.assertRunOwner(sourceBot.id, input.runId);
    const run = this.bots.conversations.getRun(input.runId);
    if (
      !run ||
      run.sessionId !== owner.sessionId ||
      owner.projectId !== input.projectId
    ) {
      throw new Error("Selected source does not belong to this project run.");
    }
    if (!sourceBot.isDefault && sourceBot.projectId !== input.projectId) {
      throw new Error("Source bot is no longer a member of this project.");
    }
    const backend = await this.bots.backendFor(sourceBot.id);
    const url = backend.getState().url;
    if (!url) throw new Error("Source runtime is unavailable.");
    const response = await this.runtimeFetch(
      `${url}/sessions/messages?sessionId=${encodeURIComponent(input.sessionId)}&throughRunId=${encodeURIComponent(input.runId)}&limit=500`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok)
      throw new Error("Exact source transcript is unavailable.");
    const raw = await response.text();
    if (raw.length > MAX_TRANSCRIPT_BYTES)
      throw new Error("Source transcript is too large.");
    const payload = JSON.parse(raw) as {
      throughRunId?: unknown;
      messages?: unknown;
    };
    if (
      payload.throughRunId !== input.runId ||
      !Array.isArray(payload.messages)
    ) {
      throw new Error("Exact source transcript is invalid.");
    }
    const selected = payload.messages.find(
      (row: unknown) =>
        row &&
        typeof row === "object" &&
        (row as Record<string, unknown>).id === input.messageId,
    ) as Record<string, unknown> | undefined;
    if (
      !selected ||
      !["user", "assistant"].includes(String(selected.role)) ||
      typeof selected.text !== "string" ||
      !selected.text.trim() ||
      selected.text.length > 12_000
    ) {
      throw new Error("Selected source message is unavailable.");
    }
    const knowledgeId = randomUUID();
    const documentId = await this.documents.add({
      clientDocumentId: knowledgeId,
      content: selected.text,
      title: input.title.trim(),
      projectId: input.projectId,
    });
    const now = new Date().toISOString();
    const record: SharedKnowledgeRecord = {
      id: knowledgeId,
      version: 1,
      documentId,
      scope: { kind: "project", id: input.projectId },
      source: {
        botId: sourceBot.id,
        agentId: sourceBot.agentId,
        sessionId: input.sessionId,
        runId: input.runId,
        projectId: input.projectId,
        messageId: input.messageId,
        links: [],
      },
      title: input.title.trim(),
      promotedBy: "desktop-owner-consent",
      createdAt: now,
      updatedAt: now,
    };
    this.ledger.promote(record);
    return record;
  }

  grant(knowledgeId: string, targetBotId: string, consent: boolean): void {
    if (!consent)
      throw new Error("Explicit knowledge sharing consent is required.");
    const record = this.ledger.get(knowledgeId);
    if (!record || record.revokedAt)
      throw new Error("Knowledge is unavailable.");
    const target = this.bots.get(targetBotId);
    if (target.projectId !== record.scope.id) {
      throw new Error("Target bot is not a current project member.");
    }
    this.ledger.grant(knowledgeId, target.id);
  }

  revoke(knowledgeId: string, targetBotId?: string): void {
    this.ledger.revoke(knowledgeId, targetBotId);
  }

  /** Only consultation dispatch may call this; workers receive selected text, never broker DB access. */
  async retrieveForConsultation(input: {
    originBotId: string;
    originProjectId?: string;
    targetBotId: string;
    knowledgeIds: string[];
  }): Promise<Array<{ id: string; title: string; text: string }>> {
    if (
      input.knowledgeIds.length > 8 ||
      new Set(input.knowledgeIds).size !== input.knowledgeIds.length
    ) {
      throw new Error("Knowledge selection is invalid.");
    }
    const origin = this.bots.get(input.originBotId);
    const target = this.bots.get(input.targetBotId);
    const selected: Array<{ id: string; title: string; text: string }> = [];
    for (const id of input.knowledgeIds) {
      const record = this.ledger.get(id);
      if (
        !record ||
        record.revokedAt ||
        !this.ledger.granted(id, target.id) ||
        record.scope.kind !== "project" ||
        record.scope.id !== input.originProjectId ||
        target.projectId !== record.scope.id ||
        (!origin.isDefault && origin.projectId !== record.scope.id)
      ) {
        throw new Error(
          "Knowledge grant is unavailable for the current project members.",
        );
      }
      const text = await this.documents.read(record.documentId);
      if (!text || text.length > 100_000)
        throw new Error("Promoted document content is invalid.");
      selected.push({ id, title: record.title, text });
    }
    return selected;
  }

  async stop(): Promise<void> {
    await this.documents.stop();
  }
}
