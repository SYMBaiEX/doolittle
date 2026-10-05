import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import type {
  BotConsultationResult,
  BotDefinition,
  BotPermissions,
  BotRunOwner,
} from "@doolittle/contracts/bots";
import {
  BotConsultationLedger,
  type BotConsultationRecord,
} from "./bot-consultation-ledger";
import type { BotProcessRegistry } from "./bot-process-registry";

const MAX_BODY = 2_000_000;
const MAX_OBJECTIVE = 32_000;
const MAX_CONTEXT = 8;
const MAX_DEADLINE_MS = 10 * 60_000;
const TERMINAL = new Set(["complete", "cancelled", "error"]);

export interface BotConsultationDispatchInput {
  origin: BotRunOwner;
  targetBotId: string;
  objective: string;
  context: Array<{ text: string; source: string }>;
  knowledgeIds?: string[];
  deadline: string;
}

function assertSubset(
  required: string[],
  available: string[],
  label: string,
): void {
  if (required.some((value) => !available.includes(value))) {
    throw new Error(
      `The target bot has ${label} outside the originating bot's grant.`,
    );
  }
}

function canonicalPaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => realpathSync(path)))];
}

function within(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}

function effectivePermissions(
  origin: BotDefinition,
  target: BotDefinition,
): BotPermissions {
  // The lead's connection/tool capability is unrestricted only in those two
  // dimensions. Filesystem and mutation permission are always explicit.
  const origins = canonicalPaths(origin.permissions.workspacePaths);
  const targets = canonicalPaths(target.permissions.workspacePaths);
  if (
    targets.some(
      (targetPath) =>
        !origins.some((originPath) => within(originPath, targetPath)),
    )
  ) {
    throw new Error(
      "The target bot has workspace paths outside the originating bot's grant.",
    );
  }
  if (!origin.isDefault) {
    assertSubset(
      target.permissions.connectionIds,
      origin.permissions.connectionIds,
      "connections",
    );
    assertSubset(
      target.permissions.toolIds,
      origin.permissions.toolIds,
      "tools",
    );
  }
  if (target.permissions.allowMutation && !origin.permissions.allowMutation) {
    throw new Error("The originating bot cannot grant mutation permission.");
  }
  if (
    target.permissions.allowDelegation &&
    !origin.permissions.allowDelegation
  ) {
    throw new Error("The originating bot cannot grant delegation permission.");
  }
  return {
    connectionIds: [...target.permissions.connectionIds],
    workspacePaths: targets,
    toolIds: [...target.permissions.toolIds],
    allowMutation: target.permissions.allowMutation,
    allowDelegation: target.permissions.allowDelegation,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > MAX_BODY)
    throw new Error("Consultation runtime receipt is too large.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Consultation runtime receipt is invalid.");
  }
  return value as Record<string, unknown>;
}

/** Host-only broker: durable one-shot dispatch into an independently owned run. */
export class BotConsultationBroker {
  readonly ledger: BotConsultationLedger;

  constructor(
    private readonly bots: BotProcessRegistry,
    dataDir: string,
    private readonly runtimeFetch: typeof fetch = fetch,
  ) {
    this.ledger = new BotConsultationLedger(dataDir);
  }

  private async endpoint(botId: string): Promise<string> {
    const backend = await this.bots.backendFor(botId);
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error("The selected bot is stopped.");
    return state.url;
  }

  async dispatch(
    callerBotId: string,
    input: BotConsultationDispatchInput,
    signal?: AbortSignal,
  ): Promise<BotConsultationRecord> {
    const origin = this.bots.get(callerBotId);
    if (
      !input ||
      typeof input !== "object" ||
      input.origin?.botId !== origin.id
    ) {
      throw new Error("Consultation origin is invalid.");
    }
    const target = this.bots.get(input.targetBotId);
    const originBotId = origin.id;
    if (originBotId === target.id)
      throw new Error("A bot cannot consult itself.");
    if (!origin.permissions.allowDelegation)
      throw new Error("This bot cannot consult another bot.");
    if (
      !origin.isDefault &&
      !origin.permissions.toolIds.includes("DOOLITTLE_CONSULT_BOT")
    ) {
      throw new Error("This bot was not granted the consultation tool.");
    }
    if (
      input.origin.agentId !== origin.agentId ||
      !input.origin.sessionId ||
      !input.origin.runId
    ) {
      throw new Error("Consultation origin is invalid.");
    }
    this.bots.assertConversationOwner(
      callerBotId,
      input.origin.sessionId,
      input.origin.projectId,
    );
    await this.bots.assertRunOwner(callerBotId, input.origin.runId);
    const owner = this.bots.conversations.getRun(input.origin.runId);
    if (
      owner?.sessionId !== input.origin.sessionId ||
      owner.projectId !== input.origin.projectId
    ) {
      throw new Error("Consultation origin does not match its run.");
    }
    const originUrl = await this.endpoint(callerBotId);
    const originResponse = await this.runtimeFetch(
      `${originUrl}/chat/runs/${encodeURIComponent(input.origin.runId)}`,
      {
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(5_000),
        ]),
      },
    );
    if (!originResponse.ok) throw new Error("Origin run is unavailable.");
    const receipt = (await readJson(originResponse)).run as
      | Record<string, unknown>
      | undefined;
    if (
      receipt?.runId !== input.origin.runId ||
      receipt.sessionId !== input.origin.sessionId ||
      !["thinking", "acting", "waiting"].includes(String(receipt.status))
    ) {
      throw new Error("The originating run is no longer active.");
    }

    const parent = this.ledger.byTargetRun(input.origin.runId);
    const rootRunId = parent?.rootRunId ?? input.origin.runId;
    const depth = parent ? parent.depth + 1 : 1;
    const ancestry = parent
      ? [...parent.ancestry, parent.targetBotId]
      : [originBotId];
    if (depth > 2 || ancestry.includes(target.id))
      throw new Error("Consultation depth or ancestry limit reached.");
    if (this.ledger.countRoot(rootRunId) >= 3)
      throw new Error("This run has reached its consultation limit.");
    if (
      typeof input.objective !== "string" ||
      !input.objective.trim() ||
      input.objective.length > MAX_OBJECTIVE ||
      !Array.isArray(input.context) ||
      input.context.length > MAX_CONTEXT ||
      input.context.some(
        (entry) =>
          !entry ||
          typeof entry.text !== "string" ||
          entry.text.length > 12_000 ||
          typeof entry.source !== "string" ||
          entry.source.length > 512,
      )
    ) {
      throw new Error("Consultation objective or context is invalid.");
    }
    const deadline = Date.parse(input.deadline);
    if (
      !Number.isFinite(deadline) ||
      deadline <= Date.now() ||
      deadline - Date.now() > MAX_DEADLINE_MS
    ) {
      throw new Error("Consultation deadline is invalid.");
    }
    const permissions = effectivePermissions(origin, target);
    if (
      input.knowledgeIds !== undefined &&
      (!Array.isArray(input.knowledgeIds) ||
        input.knowledgeIds.some((id) => typeof id !== "string"))
    ) {
      throw new Error("Knowledge selection is invalid.");
    }
    const knowledgeIds = input.knowledgeIds ?? [];
    const selectedKnowledge =
      knowledgeIds.length === 0
        ? []
        : await this.bots.knowledge.retrieveForConsultation({
            originBotId,
            originProjectId: input.origin.projectId,
            targetBotId: target.id,
            knowledgeIds,
          });
    const dispatchId = randomUUID();
    const targetSessionId = `consult:${dispatchId}`;
    const targetRunId = `consult:${dispatchId}`;
    const now = new Date().toISOString();
    const record: BotConsultationRecord = {
      dispatchId,
      rootRunId,
      ...(parent ? { parentDispatchId: parent.dispatchId } : {}),
      ancestry,
      depth,
      origin: input.origin,
      targetBotId: target.id,
      targetSessionId,
      targetRunId,
      permissions,
      deadline: input.deadline,
      knowledgeIds,
      status: "prepared",
      createdAt: now,
      updatedAt: now,
    };
    const targetUrl = await this.endpoint(target.id);
    if (knowledgeIds.length > 0) {
      this.bots.knowledge.assertConsultationAccess({
        originBotId,
        originProjectId: input.origin.projectId,
        targetBotId: target.id,
        knowledgeIds,
      });
    }
    this.ledger.prepare(record);
    // From this point onward the dispatch is uncertain and never replayed.
    this.bots.bindConversation(target.id, targetSessionId, target.projectId);
    this.bots.bindRun(target.id, targetSessionId, targetRunId);
    let response: Response;
    try {
      response = await this.runtimeFetch(`${targetUrl}/chat/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: targetRunId,
          roomId: targetSessionId,
          message: [
            input.objective.trim(),
            ...input.context.map(
              (entry) => `Context from ${entry.source}:\n${entry.text}`,
            ),
            ...selectedKnowledge.map(
              (entry) =>
                `Explicitly promoted shared knowledge ${entry.id} (${entry.title}):\n${entry.text}`,
            ),
          ].join("\n\n"),
          source: "desktop-consultation",
          workspaceDir: target.workspacePath,
          ...(target.projectId ? { projectId: target.projectId } : {}),
        }),
        signal: AbortSignal.any([
          signal ?? new AbortController().signal,
          AbortSignal.timeout(10_000),
        ]),
      });
    } catch {
      // The child may have accepted the run before the transport failed.
      return record;
    }
    if (response.status !== 202) {
      this.ledger.update(dispatchId, "error");
      throw new Error("The target bot rejected the consultation.");
    }
    const submitted = await readJson(response);
    if (
      submitted.run_id !== targetRunId ||
      submitted.room_id !== targetSessionId
    ) {
      throw new Error(
        "The target bot returned a mismatched consultation receipt.",
      );
    }
    return this.ledger.update(dispatchId, "accepted");
  }

  async wait(
    callerBotId: string,
    dispatchId: string,
    signal?: AbortSignal,
  ): Promise<BotConsultationResult> {
    const record = this.ledger.get(dispatchId);
    if (!record || record.origin.botId !== this.bots.get(callerBotId).id)
      throw new Error("Consultation not found for this bot.");
    if (record.result) return record.result;
    if (["complete", "cancelled", "error", "timeout"].includes(record.status)) {
      throw new Error("Consultation ended without an exact result.");
    }
    const url = await this.endpoint(record.targetBotId);
    const deadline = Date.parse(record.deadline);
    while (Date.now() < deadline && !signal?.aborted) {
      const response = await this.runtimeFetch(
        `${url}/chat/runs/${encodeURIComponent(record.targetRunId)}`,
        {
          signal: AbortSignal.any([
            signal ?? new AbortController().signal,
            AbortSignal.timeout(5_000),
          ]),
        },
      );
      if (response.ok) {
        const run = (await readJson(response)).run as
          | Record<string, unknown>
          | undefined;
        if (
          run?.runId !== record.targetRunId ||
          run.sessionId !== record.targetSessionId
        ) {
          throw new Error("Consultation run ownership changed.");
        }
        if (TERMINAL.has(String(run.status))) {
          const outcome = run.status as BotConsultationResult["outcome"];
          let text = "";
          if (outcome === "complete") {
            const transcript = await this.runtimeFetch(
              `${url}/sessions/messages?sessionId=${encodeURIComponent(record.targetSessionId)}&throughRunId=${encodeURIComponent(record.targetRunId)}&limit=500`,
              { signal: AbortSignal.timeout(5_000) },
            );
            if (!transcript.ok)
              throw new Error("Exact consultation transcript is unavailable.");
            const page = await readJson(transcript);
            if (
              !Array.isArray(page.messages) ||
              page.throughRunId !== record.targetRunId
            ) {
              throw new Error("Exact consultation transcript is invalid.");
            }
            const assistant = [...page.messages]
              .reverse()
              .find(
                (message) =>
                  message &&
                  typeof message === "object" &&
                  (message as Record<string, unknown>).role === "assistant",
              ) as Record<string, unknown> | undefined;
            if (typeof assistant?.text !== "string")
              throw new Error("Consultation has no assistant result.");
            text = assistant.text;
          }
          const result: BotConsultationResult = {
            dispatchId,
            owner: {
              botId: record.targetBotId,
              agentId: this.bots.get(record.targetBotId).agentId,
              sessionId: record.targetSessionId,
              runId: record.targetRunId,
              ...(this.bots.get(record.targetBotId).projectId
                ? { projectId: this.bots.get(record.targetBotId).projectId }
                : {}),
            },
            outcome,
            text,
            evidence: [],
          };
          this.ledger.update(dispatchId, outcome, result);
          return result;
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
    await this.cancel(
      callerBotId,
      dispatchId,
      signal?.aborted ? "cancelled" : "timeout",
    );
    throw new Error(
      signal?.aborted
        ? "Consultation cancelled."
        : "Consultation deadline reached.",
    );
  }

  async cancel(
    callerBotId: string,
    dispatchId: string,
    status: "cancelled" | "timeout" = "cancelled",
  ): Promise<void> {
    const record = this.ledger.get(dispatchId);
    if (!record || record.origin.botId !== this.bots.get(callerBotId).id)
      throw new Error("Consultation not found for this bot.");
    if (["complete", "cancelled", "error", "timeout"].includes(record.status))
      return;
    try {
      const url = await this.endpoint(record.targetBotId);
      await this.runtimeFetch(
        `${url}/chat/runs/${encodeURIComponent(record.targetRunId)}/cancel`,
        {
          method: "POST",
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      // A stopped child may already have cancelled its run. The host still
      // records the requested terminal intent and never replays dispatch.
    } finally {
      this.ledger.update(dispatchId, status);
    }
  }

  /** Stop owned child work before a bot process disappears; never replay dispatch. */
  async cancelForBot(botId: string): Promise<void> {
    const canonicalId = this.bots.get(botId).id;
    await Promise.all(
      this.ledger.activeForBot(canonicalId).map(async (record) => {
        await this.cancel(record.origin.botId, record.dispatchId);
      }),
    );
  }

  async cancelAll(): Promise<void> {
    const active = new Map<string, BotConsultationRecord>();
    for (const bot of this.bots.list().bots) {
      for (const record of this.ledger.activeForBot(bot.id))
        active.set(record.dispatchId, record);
    }
    await Promise.all(
      [...active.values()].map(async (record) => {
        await this.cancel(record.origin.botId, record.dispatchId);
      }),
    );
  }
}
