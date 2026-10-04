import { createHash, randomUUID } from "node:crypto";
import type {
  BotCatalogResponse,
  BotDefinition,
} from "@doolittle/contracts/bots";
import type {
  UiConversation,
  UiMessage,
  UiRunReceipt,
  UiRunState,
  UiSnapshot,
  UiTarget,
} from "@doolittle/contracts/ui-host";
import type { BackendState, RunSnapshot } from "../shared/contracts";
import { SseParser } from "../shared/sse";
import { readBoundedResponseText } from "./ipc/runtime-http";
import {
  type PickedUiAttachment,
  type UiExtensionHost,
  type UiHostBackend,
  type UiHostEventInput,
  UiSubmissionRejectedError,
} from "./ui-extensions/host";

interface SavedConversation extends UiTarget {
  createdAt: string;
  updatedAt: string;
}
interface SavedRun extends UiTarget {
  runId: string;
}
interface RuntimeBackend {
  getState(): BackendState;
  getWorkspaceDirectory(): string;
}

/** Structural seam: the desktop's authoritative bot registry implements this. */
export interface UiRuntimeRegistry {
  get(botId: string): BotDefinition;
  list(): BotCatalogResponse;
  listConversations(botId: string): SavedConversation[];
  bindConversation(
    botId: string,
    sessionId: string,
    projectId?: string,
  ): SavedConversation;
  assertConversationOwner(
    botId: string,
    sessionId: string,
    projectId?: string,
  ): SavedConversation;
  resolveSavedConversationOwner(sessionId: string): SavedConversation | null;
  bindRun(botId: string, sessionId: string, runId: string): void;
  assertRunOwner(botId: string, runId: string): Promise<void>;
  conversations: { getRun(runId: string): SavedRun | null };
  backendFor(botId: string): Promise<RuntimeBackend>;
}

export interface NativeUiBackendOptions {
  registry: UiRuntimeRegistry;
  currentWorkspace: () => string;
  fetch?: typeof fetch;
  pickAttachments: (
    target: UiTarget,
    assertAuthorizedAtCommit: () => Promise<void>,
  ) => Promise<PickedUiAttachment[]>;
  commitAttachments: (
    target: UiTarget,
    attachments: PickedUiAttachment[],
  ) => void;
  openSurface: (
    target: UiTarget,
    surface: "details" | "library" | "computer",
  ) => void;
  presentApproval: (
    target: UiTarget,
    runId: string,
    approvalId: string,
    assertAuthorizedAtCommit: () => Promise<void>,
  ) => Promise<void>;
}

const ID = /^[a-zA-Z0-9:_-]{1,128}$/u;
const TERMINAL = new Set<UiRunState>(["complete", "stopped", "error"]);
const MAX_JSON_BYTES = 4 * 1024 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function nativeUiRunState(
  run: Pick<RunSnapshot, "status" | "pendingApprovals">,
): UiRunState {
  if (run.status === "complete") return "complete";
  if (run.status === "cancelled") return "stopped";
  if (run.status === "error") return "error";
  if (run.pendingApprovals > 0) return "attention";
  return run.status === "waiting" ? "waiting" : "running";
}

function sourceKey(target: UiTarget, runId: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        target.botId,
        target.sessionId,
        target.projectId ?? null,
        runId,
      ]),
    )
    .digest("hex");
}

function targetOf(owner: UiTarget): UiTarget {
  return {
    botId: owner.botId,
    sessionId: owner.sessionId,
    ...(owner.projectId ? { projectId: owner.projectId } : {}),
  };
}

function checkRun(
  value: unknown,
  target: UiTarget,
  runId: string,
): RunSnapshot {
  if (
    !object(value) ||
    value.runId !== runId ||
    value.sessionId !== target.sessionId ||
    (value.botId !== undefined && value.botId !== target.botId) ||
    ![
      "thinking",
      "acting",
      "waiting",
      "complete",
      "cancelled",
      "error",
    ].includes(String(value.status))
  )
    throw new Error(
      "Canonical run receipt has a conflicting owner or identity.",
    );
  return value as unknown as RunSnapshot;
}

/** Projection only. Execution, approval policy and cancellation remain in the durable runtime. */
export class NativeUiBackend implements UiHostBackend {
  private readonly fetch: typeof fetch;
  private host?: UiExtensionHost;
  private readonly observers = new Map<string, AbortController>();
  private readonly observerPromises = new Map<string, Promise<void>>();
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(private readonly options: NativeUiBackendOptions) {
    this.fetch = options.fetch ?? fetch;
  }

  attachHost(host: UiExtensionHost): void {
    if (this.host) throw new Error("UI host is already attached.");
    this.host = host;
  }

  start(): void {
    if (!this.host) throw new Error("Attach the UI host before observing.");
    const refresh = async () => {
      try {
        await this.getSnapshot();
      } catch {
        /* A booting/offline runtime has no invented state. */
      }
      if (!this.disposed) {
        this.timer = setTimeout(() => {
          void refresh();
        }, 2_000);
        this.timer.unref?.();
      }
    };
    void refresh();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const observer of this.observers.values()) observer.abort();
    this.observers.clear(); // Detach only. No cancel endpoint is invoked.
    this.observerPromises.clear();
  }

  currentWorkspace(): string {
    return this.options.currentWorkspace();
  }

  async ownsTarget(target: UiTarget): Promise<boolean> {
    try {
      if (
        !ID.test(target.botId) ||
        !ID.test(target.sessionId) ||
        (target.projectId !== undefined && !ID.test(target.projectId))
      )
        return false;
      const bot = this.options.registry.get(target.botId);
      if (
        bot.archivedAt ||
        (bot.projectId && bot.projectId !== target.projectId)
      )
        return false;
      const owner = this.options.registry.assertConversationOwner(
        target.botId,
        target.sessionId,
        target.projectId,
      );
      return (
        owner.botId === target.botId && owner.projectId === target.projectId
      );
    } catch {
      return false;
    }
  }

  async createConversation(botId: string): Promise<UiTarget> {
    const bot = this.options.registry.get(botId);
    const owner = this.options.registry.bindConversation(
      bot.id,
      randomUUID(),
      bot.projectId,
    );
    return targetOf(owner);
  }

  /** Host-owned emergency action. Detaching a view never calls this method. */
  async stopAllOwnedConversations(): Promise<void> {
    const failures: string[] = [];
    for (const bot of this.options.registry.list().bots) {
      if (!["ready", "busy", "waiting"].includes(bot.state)) continue;
      try {
        const backend = await this.options.registry.backendFor(bot.id);
        const state = backend.getState();
        if (state.phase !== "ready" || !state.url) continue;
        const response = await this.json(`${state.url}/chat/runs?limit=100`);
        if (
          response.status !== 200 ||
          !object(response.value) ||
          !Array.isArray(response.value.runs)
        )
          throw new Error("Canonical run inventory is unavailable.");
        for (const candidate of response.value.runs) {
          if (
            !object(candidate) ||
            typeof candidate.runId !== "string" ||
            typeof candidate.sessionId !== "string" ||
            ["complete", "cancelled", "error"].includes(
              String(candidate.status),
            )
          )
            continue;
          await this.options.registry.assertRunOwner(bot.id, candidate.runId);
          const owner = this.options.registry.conversations.getRun(
            candidate.runId,
          );
          if (
            !owner ||
            owner.botId !== bot.id ||
            owner.sessionId !== candidate.sessionId
          )
            throw new Error("Canonical run owner is unavailable.");
          await this.stopRun(targetOf(owner), candidate.runId, async () => {
            await this.options.registry.assertRunOwner(
              bot.id,
              candidate.runId as string,
            );
          });
        }
      } catch {
        failures.push(bot.name);
      }
    }
    if (failures.length)
      throw new Error(
        `Some conversations could not be stopped: ${failures.join(", ")}.`,
      );
  }

  private async ready(
    target: UiTarget,
  ): Promise<{ backend: RuntimeBackend; url: string; workspace: string }> {
    if (!(await this.ownsTarget(target)))
      throw new Error(
        "Conversation owner is unavailable or conflicts with the saved ledger.",
      );
    const backend = await this.options.registry.backendFor(target.botId);
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url)
      throw new Error(
        "This bot is offline. Activate it explicitly before using its runtime.",
      );
    return {
      backend,
      url: state.url,
      workspace: backend.getWorkspaceDirectory(),
    };
  }

  private async json(
    url: string,
    init?: RequestInit,
  ): Promise<{ status: number; value: unknown }> {
    const response = await this.fetch(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
    const body = await readBoundedResponseText(
      response,
      MAX_JSON_BYTES,
      init?.signal ?? undefined,
    );
    return {
      status: response.status,
      value: body ? (JSON.parse(body) as unknown) : null,
    };
  }

  async getSnapshot(): Promise<UiSnapshot> {
    const catalog = this.options.registry.list();
    const conversations: UiConversation[] = [];
    const botStates = new Map<string, UiSnapshot["bots"][number]["state"]>();
    for (const bot of catalog.bots.filter((item) => !item.archivedAt)) {
      let live = false;
      const titles = new Map<string, string>();
      const states = new Map<string, UiRunState>();
      if (["ready", "busy", "waiting"].includes(bot.state)) {
        try {
          const backend = await this.options.registry.backendFor(bot.id);
          const state = backend.getState();
          if (state.phase === "ready" && state.url) {
            const sessions = await this.json(`${state.url}/sessions?limit=200`);
            if (
              sessions.status >= 200 &&
              sessions.status < 300 &&
              object(sessions.value) &&
              Array.isArray(sessions.value.sessions)
            ) {
              for (const session of sessions.value.sessions) {
                if (
                  !object(session) ||
                  typeof session.sessionId !== "string" ||
                  !ID.test(session.sessionId)
                )
                  continue;
                const saved =
                  this.options.registry.resolveSavedConversationOwner(
                    session.sessionId,
                  );
                // Only a successful canonical lead history response may adopt old lead sessions.
                if (!saved && bot.isDefault)
                  this.options.registry.bindConversation(
                    bot.id,
                    session.sessionId,
                    typeof session.projectId === "string"
                      ? session.projectId
                      : undefined,
                  );
                if (
                  this.options.registry.resolveSavedConversationOwner(
                    session.sessionId,
                  )?.botId === bot.id
                )
                  titles.set(
                    session.sessionId,
                    typeof session.title === "string"
                      ? session.title
                      : "Conversation",
                  );
              }
            }
            const runs = await this.json(`${state.url}/chat/runs?limit=100`);
            if (
              runs.status >= 200 &&
              runs.status < 300 &&
              object(runs.value) &&
              Array.isArray(runs.value.runs)
            ) {
              live = true;
              for (const candidate of runs.value.runs) {
                if (
                  !object(candidate) ||
                  typeof candidate.sessionId !== "string" ||
                  typeof candidate.runId !== "string"
                )
                  continue;
                const owner =
                  this.options.registry.resolveSavedConversationOwner(
                    candidate.sessionId,
                  );
                if (!owner || owner.botId !== bot.id) continue;
                await this.options.registry.assertRunOwner(
                  bot.id,
                  candidate.runId,
                );
                const target = targetOf(owner);
                const run = checkRun(candidate, target, candidate.runId);
                if (!states.has(owner.sessionId))
                  states.set(owner.sessionId, nativeUiRunState(run));
                if (!TERMINAL.has(nativeUiRunState(run)))
                  this.observe(target, run.runId);
              }
            }
          }
        } catch {
          /* Keep saved metadata and report offline; never redirect to another bot. */
        }
      }
      const active = [...states.values()].filter(
        (state) => !TERMINAL.has(state),
      );
      botStates.set(
        bot.id,
        !live
          ? bot.state === "error"
            ? "error"
            : "offline"
          : active.includes("attention")
            ? "attention"
            : active.includes("running")
              ? "running"
              : active.includes("waiting")
                ? "waiting"
                : "ready",
      );
      for (const owner of this.options.registry.listConversations(bot.id)) {
        conversations.push({
          ...targetOf(owner),
          title: titles.get(owner.sessionId) ?? "Conversation",
          state:
            states.get(owner.sessionId) ??
            (live ? "ready" : bot.state === "error" ? "error" : "offline"),
        });
      }
    }
    return {
      version: 1,
      revision: 0,
      sequence: 0,
      bots: catalog.bots
        .filter((bot) => !bot.archivedAt)
        .map((bot) => ({
          id: bot.id,
          name: bot.name,
          isDefault: bot.isDefault,
          ...(bot.avatar ? { avatar: bot.avatar } : {}),
          state: botStates.get(bot.id) ?? "offline",
        })),
      conversations,
    };
  }

  async readTranscript(
    target: UiTarget,
    throughRunId?: string,
  ): Promise<{ messages: UiMessage[]; transcriptThroughRunId?: string }> {
    const ready = await this.ready(target);
    if (throughRunId)
      await this.options.registry.assertRunOwner(target.botId, throughRunId);
    const response = await this.json(
      `${ready.url}/sessions/messages?sessionId=${encodeURIComponent(target.sessionId)}&limit=500${throughRunId ? `&throughRunId=${encodeURIComponent(throughRunId)}` : ""}`,
    );
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !object(response.value) ||
      !Array.isArray(response.value.messages)
    )
      throw new Error("Canonical transcript is unavailable.");
    if (throughRunId && response.value.transcriptThroughRunId !== throughRunId)
      throw new Error(
        "Canonical as-of run transcript is not supported by this runtime.",
      );
    if (response.value.hasEarlier)
      throw new Error(
        "Transcript exceeds the bounded UI snapshot. Open the native history view instead.",
      );
    const messages = response.value.messages.map((message): UiMessage => {
      if (
        !object(message) ||
        typeof message.id !== "string" ||
        !["user", "assistant", "system"].includes(String(message.role)) ||
        typeof message.content !== "string" ||
        typeof message.createdAt !== "string"
      )
        throw new Error("Canonical transcript contains an invalid message.");
      return {
        id: message.id,
        role: message.role as UiMessage["role"],
        text: message.content,
        createdAt: message.createdAt,
        sourceBotId: target.botId,
      };
    });
    return {
      messages,
      ...(throughRunId ? { transcriptThroughRunId: throughRunId } : {}),
    };
  }

  async readRun(
    target: UiTarget,
    runId: string,
  ): Promise<UiRunReceipt | undefined> {
    if (!(await this.ownsTarget(target)))
      throw new Error("Conversation owner is unavailable.");
    let owner = this.options.registry.conversations.getRun(runId);
    if (!owner) {
      // Legacy lead runs predate the desktop ownership ledger. Resolve the
      // canonical receipt before treating an ID as unused; never bind it to the
      // caller's requested session merely because that caller supplied the ID.
      const ready = await this.ready(target);
      const canonical = await this.json(
        `${ready.url}/chat/runs/${encodeURIComponent(runId)}`,
      );
      if (canonical.status === 404) return undefined;
      if (
        canonical.status < 200 ||
        canonical.status >= 300 ||
        !object(canonical.value) ||
        !object(canonical.value.run) ||
        canonical.value.run.runId !== runId ||
        typeof canonical.value.run.sessionId !== "string"
      )
        throw new Error("Canonical run identity is unavailable.");
      const actualSession = canonical.value.run.sessionId;
      if (this.options.registry.get(target.botId).isDefault) {
        await this.options.registry.assertRunOwner(target.botId, runId);
      } else {
        const actual = this.options.registry.assertConversationOwner(
          target.botId,
          actualSession,
        );
        checkRun(canonical.value.run, actual, runId);
        this.options.registry.bindRun(target.botId, actualSession, runId);
      }
      owner = this.options.registry.conversations.getRun(runId);
      if (!owner) throw new Error("Canonical run owner could not be resolved.");
    }
    if (
      owner.botId !== target.botId ||
      owner.sessionId !== target.sessionId ||
      owner.projectId !== target.projectId
    )
      throw new Error("Run belongs to a different conversation.");
    await this.options.registry.assertRunOwner(target.botId, runId);
    const ready = await this.ready(target);
    const response = await this.json(
      `${ready.url}/chat/runs/${encodeURIComponent(runId)}`,
    );
    if (response.status === 404) return undefined;
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !object(response.value)
    )
      throw new Error("Canonical run receipt is unavailable.");
    const run = checkRun(response.value.run, target, runId);
    const replay = this.observe(target, runId);
    if (
      TERMINAL.has(nativeUiRunState(run)) &&
      this.host &&
      this.host.canonicalCursor(sourceKey(target, runId)).sequence === 0
    ) {
      await replay;
      if (this.host.canonicalCursor(sourceKey(target, runId)).sequence === 0)
        throw new Error(
          "Canonical run replay is unavailable. A historical transcript boundary is required.",
        );
    }
    return {
      target: targetOf(target),
      runId,
      state: nativeUiRunState(run),
      sequence:
        this.host?.canonicalCursor(sourceKey(target, runId)).sequence ?? 0,
    };
  }

  async sendChat(
    input: Parameters<UiHostBackend["sendChat"]>[0],
  ): Promise<UiRunReceipt> {
    let postStarted = false;
    try {
      const prepared = await this.ready(input.target);
      if (input.workspace !== this.currentWorkspace())
        throw new Error("UI workspace changed before submission.");
      if (await this.readRun(input.target, input.runId))
        throw new Error("Canonical run identity already exists.");
      const body = JSON.stringify({
        message: input.message.trim(),
        roomId: input.target.sessionId,
        runId: input.runId,
        botId: input.target.botId,
        userId: "desktop-user",
        source: "desktop-ui",
        workspaceDir: prepared.workspace,
        ...(input.target.projectId
          ? { projectId: input.target.projectId }
          : {}),
        attachmentIds: input.attachments.map((attachment) => attachment.id),
      });
      await input.assertAuthorizedAtCommit();
      this.options.registry.bindRun(
        input.target.botId,
        input.target.sessionId,
        input.runId,
      );
      // No preparation awaits after the grant/owner recheck and before POST.
      postStarted = true;
      const response = await this.fetch(`${prepared.url}/chat/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await readBoundedResponseText(response, MAX_JSON_BYTES);
        throw new UiSubmissionRejectedError(
          `Runtime rejected the submission (${response.status}).`,
        );
      }
      const receipt = JSON.parse(
        await readBoundedResponseText(response, MAX_JSON_BYTES),
      ) as unknown;
      if (
        !object(receipt) ||
        receipt.run_id !== input.runId ||
        receipt.room_id !== input.target.sessionId
      )
        throw new Error("Invalid canonical submission receipt.");
      try {
        this.options.commitAttachments(input.target, input.attachments);
      } catch {
        /* Accepted turn stays accepted; lease remains recoverable. */
      }
      this.observe(input.target, input.runId);
      return {
        target: targetOf(input.target),
        runId: input.runId,
        state: "running",
        sequence:
          this.host?.canonicalCursor(sourceKey(input.target, input.runId))
            .sequence ?? 0,
      };
    } catch (error) {
      if (!postStarted)
        throw new UiSubmissionRejectedError(
          error instanceof Error
            ? error.message
            : "Submission preparation failed.",
        );
      throw error;
    }
  }

  async stopRun(
    target: UiTarget,
    runId: string,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<UiRunReceipt> {
    await this.options.registry.assertRunOwner(target.botId, runId);
    const ready = await this.ready(target);
    const owner = this.options.registry.conversations.getRun(runId);
    if (
      !owner ||
      owner.sessionId !== target.sessionId ||
      owner.projectId !== target.projectId
    )
      throw new Error("Run belongs to another conversation.");
    await assertAuthorizedAtCommit();
    const response = await this.fetch(
      `${ready.url}/chat/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST", signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok)
      throw new Error("Runtime did not acknowledge cancellation.");
    const receipt = await this.readRun(target, runId);
    if (!receipt) throw new Error("Cancelled run receipt is unavailable.");
    return receipt; // The receipt, not the button or connection, determines state.
  }

  async pickAttachments(
    target: UiTarget,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<PickedUiAttachment[]> {
    await this.ready(target);
    await assertAuthorizedAtCommit();
    return this.options.pickAttachments(target, assertAuthorizedAtCommit);
  }

  async openSurface(
    target: UiTarget,
    surface: "details" | "library" | "computer",
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<void> {
    await assertAuthorizedAtCommit();
    this.options.openSurface(target, surface);
  }

  async presentApproval(
    target: UiTarget,
    runId: string,
    approvalId: string,
    assertAuthorizedAtCommit: () => Promise<void>,
  ): Promise<void> {
    await this.options.registry.assertRunOwner(target.botId, runId);
    await assertAuthorizedAtCommit();
    await this.options.presentApproval(
      target,
      runId,
      approvalId,
      assertAuthorizedAtCommit,
    );
  }

  private observe(target: UiTarget, runId: string): Promise<void> | undefined {
    if (!this.host || this.disposed) return;
    const key = sourceKey(target, runId);
    if (this.observers.has(key)) return this.observerPromises.get(key);
    const controller = new AbortController();
    this.observers.set(key, controller);
    const replay = this.readEvents(
      targetOf(target),
      runId,
      controller.signal,
    ).finally(() => {
      if (this.observers.get(key) === controller) this.observers.delete(key);
      this.observerPromises.delete(key);
    });
    this.observerPromises.set(key, replay);
    // Background failure never changes execution. Awaiting terminal replay sees it.
    void replay.catch(() => undefined);
    return replay;
  }

  private async readEvents(
    target: UiTarget,
    runId: string,
    signal: AbortSignal,
  ): Promise<void> {
    const host = this.host;
    if (!host) return;
    await this.options.registry.assertRunOwner(target.botId, runId);
    const ready = await this.ready(target);
    const key = sourceKey(target, runId);
    const response = await this.fetch(
      `${ready.url}/chat/runs/${encodeURIComponent(runId)}/events?after=${host.canonicalCursor(key).cursor}`,
      { signal },
    );
    if (!response.ok || !response.body)
      throw new Error("Run event feed is unavailable.");
    const reader = response.body.getReader();
    const parser = new SseParser();
    const decoder = new TextDecoder();
    const consume = async (frame: { event: string; data: unknown }) => {
      if (!object(frame.data) || !Number.isSafeInteger(frame.data.event_id))
        throw new Error("Native event lacks its durable cursor.");
      if (!(await this.ownsTarget(target)))
        throw new Error("Run observer lost target access.");
      signal.throwIfAborted();
      const eventId = Number(frame.data.event_id);
      const projected = projectNativeUiEvent(
        target,
        runId,
        frame.event,
        frame.data,
        host.canonicalCursor(key).textStarted ?? false,
      );
      host.publishCanonical(key, eventId, projected);
    };
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        for (const frame of parser.push(
          decoder.decode(chunk.value, { stream: true }),
        ))
          await consume(frame);
      }
      for (const frame of parser.push(decoder.decode())) await consume(frame);
      for (const frame of parser.finish()) await consume(frame);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
}

/** Exact protocol projection. Unknown runtime events remain explicit custom data. */
export function projectNativeUiEvent(
  target: UiTarget,
  runId: string,
  event: string,
  data: Record<string, unknown>,
  textStarted = false,
): UiHostEventInput[] {
  const base = { target, runId };
  const messageId =
    typeof data.id === "string" ? data.id : `${runId}:assistant`;
  if (event === "response.output_text.delta") {
    if (typeof data.delta !== "string")
      throw new Error("Invalid native text delta.");
    const deltas: UiHostEventInput[] = [];
    for (let index = 0; index < data.delta.length; index += 2_048)
      deltas.push({
        type: "message.delta",
        ...base,
        messageId,
        text: data.delta.slice(index, index + 2_048),
        sourceBotId: target.botId,
      });
    return deltas;
  }
  if (event === "response.created")
    return [{ type: "run.state", ...base, state: "running" }];
  if (event === "response.completed") {
    const final: UiHostEventInput[] = [];
    if (!textStarted && typeof data.response === "string") {
      if (data.response.length > 120_000)
        throw new Error("Canonical text requires the native transcript view.");
      for (let index = 0; index < data.response.length; index += 2_048)
        final.push({
          type: "message.delta",
          ...base,
          messageId,
          text: data.response.slice(index, index + 2_048),
          sourceBotId: target.botId,
        });
    } else if (typeof data.response === "string") {
      final.push({
        type: "custom",
        ...base,
        name: "doolittle.message.final",
        value: {
          messageId,
          ...(data.response.length <= 2_048
            ? { text: data.response }
            : { transcriptRequired: true }),
        },
      });
    }
    return [
      ...final,
      { type: "message.completed", ...base, messageId },
      { type: "run.state", ...base, state: "complete" },
    ];
  }
  if (event === "response.cancelled" || event === "cancelled")
    return [{ type: "run.state", ...base, state: "stopped" }];
  if (event === "response.failed")
    return [{ type: "run.state", ...base, state: "error" }];
  if (event === "agent.run" && object(data.run)) {
    const run = checkRun(data.run, target, runId);
    if (TERMINAL.has(nativeUiRunState(run)))
      return [
        { type: "custom", ...base, name: "doolittle.run.receipt", value: data },
      ];
    return [{ type: "run.state", ...base, state: nativeUiRunState(run) }];
  }
  return [{ type: "custom", ...base, name: event, value: data }];
}
