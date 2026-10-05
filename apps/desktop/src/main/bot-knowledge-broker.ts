import { randomUUID } from "node:crypto";
import type { SharedKnowledgeRecord } from "@doolittle/contracts/bots";
import type { BackendLaunchTarget } from "./backend";
import { BotKnowledgeLedger } from "./bot-knowledge-ledger";
import type { BotProcessRegistry } from "./bot-process-registry";
import { KnowledgeDocumentWorker } from "./knowledge-document-worker";

const ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const MAX_TRANSCRIPT_BYTES = 2_000_000;

interface ConsultationKnowledgeSelection {
  originBotId: string;
  originProjectId?: string;
  targetBotId: string;
  knowledgeIds: string[];
}

export interface PromoteKnowledgeInput {
  sourceBotId: string;
  sessionId: string;
  runId: string;
  messageId: string;
  projectId?: string;
  teamId?: string;
  title: string;
  consent: true;
}

interface DocumentStore {
  add(input: {
    clientDocumentId: string;
    content: string;
    title: string;
    scope: SharedKnowledgeRecord["scope"];
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
      (input.projectId === undefined) === (input.teamId === undefined) ||
      (input.projectId !== undefined && !ID.test(input.projectId)) ||
      (input.teamId !== undefined && !/^[0-9a-f-]{36}$/iu.test(input.teamId)) ||
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 300
    ) {
      throw new Error("Explicit, scoped knowledge promotion is required.");
    }
    const sourceBot = this.bots.get(input.sourceBotId);
    const scope: SharedKnowledgeRecord["scope"] = input.teamId
      ? { kind: "team", id: input.teamId }
      : { kind: "project", id: input.projectId as string };
    const assertSourceMembership = () => {
      const current = this.bots.get(sourceBot.id);
      if (scope.kind === "team")
        this.bots.teams.assertMember(scope.id, current.id);
      else if (!current.isDefault && current.projectId !== scope.id)
        throw new Error("Source bot is no longer a member of this project.");
    };
    assertSourceMembership();
    const owner = await this.bots.ensureConversationOwner(
      sourceBot.id,
      input.sessionId,
    );
    await this.bots.assertRunOwner(sourceBot.id, input.runId);
    const run = this.bots.conversations.getRun(input.runId);
    if (
      !run ||
      run.sessionId !== owner.sessionId ||
      (scope.kind === "project" && owner.projectId !== scope.id)
    ) {
      throw new Error("Selected source does not belong to this project run.");
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
    assertSourceMembership();
    const documentId = await this.documents.add({
      clientDocumentId: knowledgeId,
      content: selected.text,
      title: input.title.trim(),
      scope,
    });
    // An in-flight SDK write cannot authorize a promotion after membership changed.
    assertSourceMembership();
    const storedContent = await this.documents.read(documentId);
    assertSourceMembership();
    if (storedContent !== selected.text)
      throw new Error(
        "SDK document did not preserve the exact selected message.",
      );
    const now = new Date().toISOString();
    const record: SharedKnowledgeRecord = {
      id: knowledgeId,
      version: 1,
      documentId,
      scope,
      source: {
        botId: sourceBot.id,
        agentId: sourceBot.agentId,
        sessionId: input.sessionId,
        runId: input.runId,
        ...(owner.projectId ? { projectId: owner.projectId } : {}),
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
    if (record.integrity) throw new Error(record.integrity.message);
    const target = this.bots.get(targetBotId);
    if (record.scope.kind === "team") {
      this.bots.teams.assertMember(record.scope.id, target.id);
    } else if (target.projectId !== record.scope.id) {
      throw new Error("Target bot is not a current project member.");
    }
    this.ledger.grant(knowledgeId, target.id);
  }

  revoke(knowledgeId: string, targetBotId?: string): void {
    this.ledger.revoke(knowledgeId, targetBotId);
  }

  /** Synchronous authorization seam, also checked immediately before child submission. */
  assertConsultationAccess(input: ConsultationKnowledgeSelection): void {
    if (
      input.knowledgeIds.length > 8 ||
      new Set(input.knowledgeIds).size !== input.knowledgeIds.length
    ) {
      throw new Error("Knowledge selection is invalid.");
    }
    for (const id of input.knowledgeIds) this.authorizedRecord(input, id);
  }

  private authorizedRecord(
    input: ConsultationKnowledgeSelection,
    id: string,
  ): SharedKnowledgeRecord {
    const origin = this.bots.get(input.originBotId);
    const target = this.bots.get(input.targetBotId);
    const record = this.ledger.get(id);
    if (record?.integrity) throw new Error(record.integrity.message);
    if (!record || record.revokedAt || !this.ledger.granted(id, target.id))
      throw new Error(
        "Knowledge grant is unavailable for the current project or team members.",
      );
    if (record.scope.kind === "team") {
      this.bots.teams.assertMember(record.scope.id, origin.id);
      this.bots.teams.assertMember(record.scope.id, target.id);
    } else if (
      record.scope.id !== input.originProjectId ||
      target.projectId !== record.scope.id ||
      (!origin.isDefault && origin.projectId !== record.scope.id)
    )
      throw new Error(
        "Knowledge grant is unavailable for the current project members.",
      );
    return record;
  }

  /** Only consultation dispatch may call this; workers receive selected text, never broker DB access. */
  async retrieveForConsultation(
    input: ConsultationKnowledgeSelection,
  ): Promise<Array<{ id: string; title: string; text: string }>> {
    this.assertConsultationAccess(input);
    const selected: Array<{ id: string; title: string; text: string }> = [];
    for (const id of input.knowledgeIds) {
      const record = this.authorizedRecord(input, id);
      const text = await this.documents.read(record.documentId);
      this.assertConsultationAccess(input);
      if (!text || text.length > 100_000)
        throw new Error("Promoted document content is invalid.");
      selected.push({ id, title: record.title, text });
    }
    // A later document read may race revocation of an earlier selected record.
    this.assertConsultationAccess(input);
    return selected;
  }

  async stop(): Promise<void> {
    await this.documents.stop();
  }
}
