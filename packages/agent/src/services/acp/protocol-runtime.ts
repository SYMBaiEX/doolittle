import { randomUUID } from "node:crypto";
import { relative, resolve } from "node:path";
import {
  type AgentApp,
  type AgentContext,
  type ClientCapabilities,
  type ContentBlock,
  type CreateTerminalRequest,
  createDoolittleAcpAgent,
  guessAcpToolKind,
  type InitializeRequest,
  type InitializeResponse,
  type KillTerminalRequest,
  type LoadSessionRequest,
  methods,
  type NewSessionRequest,
  PROTOCOL_VERSION,
  type PromptRequest,
  type ReadTextFileRequest,
  type ReleaseTerminalRequest,
  type SessionUpdate,
  type TerminalOutputRequest,
  type ToolCallContent,
  type ToolCallLocation,
  type WaitForTerminalExitRequest,
  type WriteTextFileRequest,
} from "@doolittle/acp";
import type { StoredMessage } from "@/types";
import { DOOLITTLE_VERSION } from "@/version";
import type { RunUpdateEvent } from "../run-controller-service";
import { AcpHostProxy } from "./host-proxy";
import type {
  AcpEditorContext,
  AcpLatestEditorContext,
  AcpProtocolHost,
  AcpProtocolSession,
  AcpProtocolSnapshot,
  AcpSessionUpdateRecord,
} from "./types";

const MAX_CONTEXT_RESOURCE_CHARS = 32_000;
const MAX_UPDATE_HISTORY = 500;
const SESSION_HISTORY_PAGE_SIZE = 200;
const MAX_SESSION_HISTORY_REPLAY = 10_000;

export class AcpSessionNotFoundError extends Error {
  readonly code = "ACP_SESSION_NOT_FOUND";

  constructor(readonly sessionId: string) {
    super(`ACP session not found: ${sessionId}`);
    this.name = "AcpSessionNotFoundError";
  }
}

export function isAcpSessionNotFoundError(
  error: unknown,
): error is AcpSessionNotFoundError {
  return error instanceof AcpSessionNotFoundError;
}

export class AcpProtocolRuntime {
  private readonly sessions = new Map<string, AcpProtocolSession>();
  private readonly clientCapabilities = new WeakMap<
    object,
    ClientCapabilities
  >();
  private readonly updates = new Map<string, AcpSessionUpdateRecord[]>();
  private readonly loadResponses = new Map<
    string,
    { _meta: Record<string, unknown> }
  >();
  private readonly app: AgentApp;
  private readonly hostProxy: AcpHostProxy;
  private agentClient?: AgentContext;
  private host?: AcpProtocolHost;
  private initialized?: InitializeResponse;

  constructor(
    private readonly workspaceRoot: () => string,
    private readonly sessionExists: (sessionId: string) => boolean,
    private readonly getSessionMessages: (
      sessionId: string,
      limit: number,
      offset?: number,
    ) => StoredMessage[],
    private readonly recordTelemetry: (
      event: string,
      detail?: Record<string, unknown>,
    ) => void,
  ) {
    this.app = createDoolittleAcpAgent({
      initialize: (params, context) => this.handleInitialize(params, context),
      newSession: (params, context) => this.handleNewSession(params, context),
      loadSession: (params, context) => this.handleLoadSession(params, context),
      prompt: (params, context, signal) =>
        this.handlePrompt(params, context, signal),
      cancel: (params) => this.cancel(params.sessionId),
    });

    this.hostProxy = new AcpHostProxy({
      host: () => this.requireHost(),
      ensureInitialized: () => this.ensureInitialized(),
      agentClient: () => this.requireAgentClient(),
      clientCapabilities: (sessionId) =>
        this.requireSession(sessionId).clientCapabilities,
      recordTelemetry: (event, detail) => this.recordTelemetry(event, detail),
      onSessionUpdate: (sessionId, update) =>
        this.recordUpdate(sessionId, update),
    });
    const localAgentConnection = this.app.connect(this.hostProxy.clientApp());
    this.agentClient = localAgentConnection.client;
    this.hostProxy.connection();
  }

  bindHost(host: AcpProtocolHost): void {
    this.host = host;
  }

  agentApp(): AgentApp {
    return this.app;
  }

  async initialize(
    params: InitializeRequest = {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: localClientCapabilities(),
      clientInfo: { name: "Doolittle Desktop", version: DOOLITTLE_VERSION },
      _meta: {
        "doolittle/editor-context": true,
        "doolittle/resources": true,
      },
    },
  ): Promise<InitializeResponse> {
    const response = await this.hostProxy
      .connection()
      .agent.request(methods.agent.initialize, params);
    this.initialized = response;
    return response;
  }

  async newSession(
    params?: Partial<NewSessionRequest>,
  ): Promise<{ sessionId: string }> {
    await this.ensureInitialized();
    return this.hostProxy
      .connection()
      .agent.request(methods.agent.session.new, {
        cwd: params?.cwd ?? this.workspaceRoot(),
        mcpServers: params?.mcpServers ?? [],
        additionalDirectories: params?.additionalDirectories,
        _meta: params?._meta,
      });
  }

  async loadSession(
    params: LoadSessionRequest,
  ): Promise<{ _meta: Record<string, unknown> }> {
    await this.ensureInitialized();
    await this.hostProxy
      .connection()
      .agent.request(methods.agent.session.load, params);
    return this.loadResponses.get(params.sessionId) ?? { _meta: {} };
  }

  async prompt(params: PromptRequest): Promise<{
    stopReason: string;
    updates: AcpSessionUpdateRecord[];
  }> {
    await this.ensureInitialized();
    const beforeCursor = this.latestCursor(params.sessionId);
    const response = await this.hostProxy
      .connection()
      .agent.request(methods.agent.session.prompt, params);
    return {
      stopReason: response.stopReason,
      updates: this.sessionUpdates(params.sessionId, beforeCursor).updates,
    };
  }

  cancel(sessionId: string): void {
    this.sessions.get(sessionId)?.pendingPrompt?.abort();
    this.recordTelemetry("session.cancel", { sessionId });
  }

  async notifyCancel(sessionId: string): Promise<void> {
    await this.hostProxy
      .connection()
      .agent.notify(methods.agent.session.cancel, {
        sessionId,
      });
  }

  updateEditorContext(
    sessionId: string,
    context: AcpEditorContext,
  ): AcpEditorContext {
    const session = this.requireSession(sessionId);
    if (!session.editorContextSupported) {
      throw new Error(
        "The ACP client did not negotiate Doolittle editor context support.",
      );
    }
    session.editorContext = sanitizeEditorContext(context);
    session.editorContextUpdatedAt = new Date().toISOString();
    return session.editorContext;
  }

  latestEditorContext(
    workspaceRoot: string,
  ): AcpLatestEditorContext | undefined {
    const matching = Array.from(this.sessions.values())
      .filter(
        (session) =>
          session.editorContext &&
          session.editorContextUpdatedAt &&
          isPathInside(workspaceRoot, session.cwd),
      )
      .sort((left, right) =>
        (right.editorContextUpdatedAt ?? "").localeCompare(
          left.editorContextUpdatedAt ?? "",
        ),
      );
    const latest = matching[0];
    if (!latest?.editorContext || !latest.editorContextUpdatedAt) {
      return undefined;
    }
    return {
      sessionId: latest.sessionId,
      workspaceRoot: resolve(workspaceRoot),
      updatedAt: latest.editorContextUpdatedAt,
      context: structuredClone(latest.editorContext),
    };
  }

  sessionUpdates(sessionId: string, cursor = 0): AcpProtocolSnapshot {
    const matching = (this.updates.get(sessionId) ?? []).filter(
      (entry) => entry.cursor > cursor,
    );
    return {
      sessionId,
      cursor: matching.at(-1)?.cursor ?? cursor,
      updates: matching,
    };
  }

  readTextFile(params: ReadTextFileRequest): Promise<string> {
    return this.hostProxy.readTextFile(params);
  }

  writeTextFile(params: WriteTextFileRequest) {
    return this.hostProxy.writeTextFile(params);
  }

  createTerminal(params: CreateTerminalRequest) {
    return this.hostProxy.createTerminal(params);
  }

  terminalOutput(params: TerminalOutputRequest) {
    return this.hostProxy.terminalOutput(params);
  }

  waitForTerminalExit(params: WaitForTerminalExitRequest) {
    return this.hostProxy.waitForTerminalExit(params);
  }

  killTerminal(params: KillTerminalRequest) {
    return this.hostProxy.killTerminal(params);
  }

  releaseTerminal(params: ReleaseTerminalRequest) {
    return this.hostProxy.releaseTerminal(params);
  }

  private handleInitialize(
    params: InitializeRequest,
    context: AgentContext,
  ): InitializeResponse {
    this.clientCapabilities.set(
      connectionKey(context),
      params.clientCapabilities ?? {},
    );
    const editorContext =
      params._meta?.["doolittle/editor-context"] === true ||
      params._meta?.["doolittle/resources"] === true;
    this.recordTelemetry("initialize", {
      requestedVersion: params.protocolVersion,
      editorContext,
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          embeddedContext: true,
        },
        sessionCapabilities: {
          additionalDirectories: {},
        },
      },
      agentInfo: {
        name: "Doolittle",
        version: DOOLITTLE_VERSION,
      },
      _meta: editorContext
        ? {
            "doolittle/editor-context": true,
            "doolittle/resources": true,
            "doolittle/stable-acp": "v1",
          }
        : {
            "doolittle/stable-acp": "v1",
          },
    };
  }

  private handleNewSession(
    params: NewSessionRequest,
    context: AgentContext,
  ): { sessionId: string; _meta: Record<string, unknown> } {
    this.assertWorkspaceRoots(params.cwd, params.additionalDirectories);
    const sessionId = `acp:${randomUUID()}`;
    const capabilities =
      this.clientCapabilities.get(connectionKey(context)) ?? {};
    this.sessions.set(sessionId, {
      sessionId,
      cwd: params.cwd,
      additionalDirectories: params.additionalDirectories ?? [],
      clientCapabilities: capabilities,
      editorContextSupported:
        params._meta?.["doolittle/editor-context"] === true ||
        params._meta?.["doolittle/resources"] === true ||
        capabilities._meta?.["doolittle/editor-context"] === true ||
        capabilities._meta?.["doolittle/resources"] === true,
    });
    this.recordTelemetry("session.new", { sessionId, cwd: params.cwd });
    return {
      sessionId,
      _meta: {
        resources: [],
      },
    };
  }

  private async handleLoadSession(
    params: LoadSessionRequest,
    context: AgentContext,
  ): Promise<{ _meta: Record<string, unknown> }> {
    this.assertWorkspaceRoots(params.cwd, params.additionalDirectories);
    if (
      !this.sessions.has(params.sessionId) &&
      !this.sessionExists(params.sessionId)
    ) {
      throw new AcpSessionNotFoundError(params.sessionId);
    }
    const capabilities =
      this.clientCapabilities.get(connectionKey(context)) ?? {};
    this.sessions.set(params.sessionId, {
      sessionId: params.sessionId,
      cwd: params.cwd,
      additionalDirectories: params.additionalDirectories ?? [],
      clientCapabilities: capabilities,
      editorContextSupported:
        params._meta?.["doolittle/editor-context"] === true ||
        params._meta?.["doolittle/resources"] === true ||
        capabilities._meta?.["doolittle/editor-context"] === true ||
        capabilities._meta?.["doolittle/resources"] === true,
    });
    const history = this.loadPersistedHistory(params.sessionId);
    for (const message of history.messages) {
      await this.sendUpdate(context, params.sessionId, {
        sessionUpdate:
          message.role === "assistant"
            ? "agent_message_chunk"
            : "user_message_chunk",
        messageId: message.id,
        content: { type: "text", text: message.text },
      });
    }
    this.recordTelemetry("session.load", {
      sessionId: params.sessionId,
      replayedMessages: history.messages.length,
      historyTruncated: history.truncated,
    });
    const response = {
      _meta: {
        resources: [],
        "doolittle/history-replayed": history.messages.length,
        "doolittle/history-truncated": history.truncated,
        ...(history.truncated
          ? {
              "doolittle/history-continuation": {
                offset: history.nextOffset,
                reason: history.reason,
              },
            }
          : {}),
      },
    };
    this.loadResponses.set(params.sessionId, response);
    return response;
  }

  private async handlePrompt(
    params: PromptRequest,
    context: AgentContext,
    signal: AbortSignal,
  ): Promise<{ stopReason: "end_turn" | "cancelled" }> {
    const session = this.requireSession(params.sessionId);
    session.pendingPrompt?.abort();
    const controller = new AbortController();
    session.pendingPrompt = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const message = buildPromptText(params.prompt, params._meta, session);
    const toolCalls = new Map<string, string>();
    this.recordTelemetry("session.prompt.start", {
      sessionId: params.sessionId,
    });
    try {
      await this.requireHost().executeTurn({
        sessionId: params.sessionId,
        message,
        signal: controller.signal,
        onText: async (delta) => {
          if (!delta) return;
          await this.sendUpdate(context, params.sessionId, {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: delta },
          });
        },
        onRunUpdate: async (event) => {
          await this.publishRunUpdate(
            context,
            params.sessionId,
            event,
            toolCalls,
          );
        },
      });
      const stopReason = controller.signal.aborted ? "cancelled" : "end_turn";
      this.recordTelemetry("session.prompt.stop", {
        sessionId: params.sessionId,
        stopReason,
      });
      return { stopReason };
    } catch (error) {
      if (controller.signal.aborted) {
        this.recordTelemetry("session.prompt.stop", {
          sessionId: params.sessionId,
          stopReason: "cancelled",
        });
        return { stopReason: "cancelled" };
      }
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      if (session.pendingPrompt === controller) {
        session.pendingPrompt = undefined;
      }
    }
  }

  private async publishRunUpdate(
    context: AgentContext,
    sessionId: string,
    event: RunUpdateEvent,
    toolCalls: Map<string, string>,
  ): Promise<void> {
    const action =
      event.run.activeAction ?? event.run.lastAction ?? "Doolittle tool";
    if (event.type === "action-started") {
      const id = `tool:${event.run.runId}:${event.run.observedActionCount}`;
      toolCalls.set(action, id);
      await this.sendUpdate(context, sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: id,
        title: action,
        kind: guessAcpToolKind({ id: action.toLowerCase() }),
        status: "in_progress",
        rawInput: { action },
      });
      return;
    }
    if (event.type === "action-completed") {
      const id = toolCalls.get(action);
      if (!id) return;
      await this.sendUpdate(context, sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: id,
        status: "completed",
        rawOutput: { action },
      });
      return;
    }
    if (event.type !== "local-mutation") return;
    const mutation = event.run.localMutations.at(-1);
    if (!mutation) return;
    const path = mutation.resolvedPath ?? mutation.requestedPath;
    const id =
      toolCalls.get(action) ??
      `tool:${event.run.runId}:mutation:${event.run.localMutations.length}`;
    if (!toolCalls.has(action)) {
      toolCalls.set(action, id);
      await this.sendUpdate(context, sessionId, {
        sessionUpdate: "tool_call",
        toolCallId: id,
        title: action,
        kind: "edit",
        status: "in_progress",
        locations: path ? [{ path }] : undefined,
      });
    }
    const locations: ToolCallLocation[] | undefined = path
      ? [{ path }]
      : undefined;
    const content = await this.diffContent(path);
    await this.sendUpdate(context, sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      status: mutation.success ? "completed" : "failed",
      locations,
      content,
      rawOutput: mutation,
    });
  }

  private async diffContent(
    path?: string,
  ): Promise<ToolCallContent[] | undefined> {
    if (!path) return undefined;
    try {
      const newText = await this.requireHost().readWorkspace(path);
      return [
        {
          type: "diff",
          path,
          newText:
            newText.length > MAX_CONTEXT_RESOURCE_CHARS
              ? newText.slice(0, MAX_CONTEXT_RESOURCE_CHARS)
              : newText,
          _meta: {
            "doolittle/base": "unavailable",
            ...(newText.length > MAX_CONTEXT_RESOURCE_CHARS
              ? { truncated: true }
              : {}),
          },
        },
      ];
    } catch {
      return undefined;
    }
  }

  private async sendUpdate(
    context: AgentContext,
    sessionId: string,
    update: SessionUpdate,
  ): Promise<void> {
    await context.notify(methods.client.session.update, { sessionId, update });
  }

  private recordUpdate(sessionId: string, update: SessionUpdate): void {
    const updates = this.updates.get(sessionId) ?? [];
    updates.push({
      cursor: (updates.at(-1)?.cursor ?? 0) + 1,
      sessionId,
      receivedAt: new Date().toISOString(),
      update,
    });
    if (updates.length > MAX_UPDATE_HISTORY) {
      updates.splice(0, updates.length - MAX_UPDATE_HISTORY);
    }
    this.updates.set(sessionId, updates);
    this.recordTelemetry("session.update", {
      sessionId,
      kind: update.sessionUpdate,
    });
  }

  private latestCursor(sessionId: string): number {
    return this.updates.get(sessionId)?.at(-1)?.cursor ?? 0;
  }

  private loadPersistedHistory(sessionId: string): {
    messages: StoredMessage[];
    truncated: boolean;
    nextOffset?: number;
    reason?: "replay-cap" | "repeated-page";
  } {
    const messages: StoredMessage[] = [];
    const pageSignatures = new Set<string>();
    let offset = 0;
    while (messages.length < MAX_SESSION_HISTORY_REPLAY) {
      const page = this.getSessionMessages(
        sessionId,
        Math.min(
          SESSION_HISTORY_PAGE_SIZE,
          MAX_SESSION_HISTORY_REPLAY - messages.length,
        ),
        offset,
      );
      if (!page.length) {
        return { messages, truncated: false };
      }
      const signature = page.map((message) => message.id).join("\u0000");
      if (pageSignatures.has(signature)) {
        return {
          messages,
          truncated: true,
          nextOffset: offset,
          reason: "repeated-page",
        };
      }
      pageSignatures.add(signature);
      messages.push(...page);
      offset += page.length;
      if (page.length < SESSION_HISTORY_PAGE_SIZE) {
        return { messages, truncated: false };
      }
    }
    // A full final page does not prove more history exists. Probe exactly one
    // row so an exactly-at-cap transcript is not falsely labeled truncated.
    return this.getSessionMessages(sessionId, 1, offset).length
      ? {
          messages,
          truncated: true,
          nextOffset: offset,
          reason: "replay-cap",
        }
      : { messages, truncated: false };
  }

  private assertWorkspaceRoots(
    cwd: string,
    additionalDirectories: string[] | undefined,
  ): void {
    const host = this.requireHost();
    host.assertWorkspacePath(cwd);
    for (const directory of additionalDirectories ?? []) {
      host.assertWorkspacePath(directory);
    }
  }

  private requireSession(sessionId: string): AcpProtocolSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new AcpSessionNotFoundError(sessionId);
    }
    return session;
  }

  private requireHost(): AcpProtocolHost {
    if (!this.host) {
      throw new Error("ACP runtime host is not bound.");
    }
    return this.host;
  }

  private requireAgentClient(): AgentContext {
    if (!this.agentClient) {
      throw new Error("ACP local agent connection is not available.");
    }
    return this.agentClient;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

function localClientCapabilities(): ClientCapabilities {
  return {
    fs: {
      readTextFile: true,
      writeTextFile: true,
    },
    terminal: true,
    _meta: {
      "doolittle/editor-context": true,
      "doolittle/resources": true,
    },
  };
}

function connectionKey(context: AgentContext): object {
  const connection = Reflect.get(context, "connectionContext");
  return connection && typeof connection === "object" ? connection : context;
}

function isPathInside(workspaceRoot: string, candidate: string): boolean {
  const relativePath = relative(resolve(workspaceRoot), resolve(candidate));
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(
        `..${process.platform === "win32" ? "\\" : "/"}`,
      ))
  );
}

function sanitizeEditorContext(context: AcpEditorContext): AcpEditorContext {
  const selectionStartLine =
    context.selection?.startLineNumber ?? context.selection?.startLine;
  const selectionEndLine =
    context.selection?.endLineNumber ?? context.selection?.endLine;
  return {
    activeFile: context.activeFile?.trim() || undefined,
    path: context.path?.trim().slice(0, 4_096) || undefined,
    uri: context.uri?.trim().slice(0, 4_096) || undefined,
    language: context.language?.trim().slice(0, 128) || undefined,
    content: context.content?.slice(0, MAX_CONTEXT_RESOURCE_CHARS),
    version:
      Number.isSafeInteger(context.version) && (context.version ?? 0) >= 0
        ? context.version
        : undefined,
    dirty: typeof context.dirty === "boolean" ? context.dirty : undefined,
    focused: typeof context.focused === "boolean" ? context.focused : undefined,
    cursor: context.cursor
      ? {
          lineNumber: boundedPosition(context.cursor.lineNumber),
          column: boundedPosition(context.cursor.column),
        }
      : undefined,
    selection:
      context.selection &&
      selectionStartLine !== undefined &&
      selectionEndLine !== undefined
        ? {
            startLineNumber: boundedPosition(selectionStartLine),
            startColumn: boundedPosition(context.selection.startColumn),
            endLineNumber: boundedPosition(selectionEndLine),
            endColumn: boundedPosition(context.selection.endColumn),
            text: context.selection.text?.slice(0, MAX_CONTEXT_RESOURCE_CHARS),
          }
        : undefined,
    visibleRanges: (context.visibleRanges ?? []).slice(0, 20).map((range) => ({
      startLineNumber: boundedPosition(range.startLineNumber),
      startColumn: boundedPosition(range.startColumn),
      endLineNumber: boundedPosition(range.endLineNumber),
      endColumn: boundedPosition(range.endColumn),
    })),
    resources: (context.resources ?? []).slice(0, 20).map((resource) => ({
      uri: resource.uri.slice(0, 2_048),
      name: resource.name?.slice(0, 256),
      text: resource.text?.slice(0, MAX_CONTEXT_RESOURCE_CHARS),
    })),
  };
}

function boundedPosition(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(10_000_000, Math.max(1, Math.floor(value)));
}

function buildPromptText(
  blocks: ContentBlock[],
  meta: Record<string, unknown> | null | undefined,
  session: AcpProtocolSession,
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      parts.push(block.text);
    } else if (block.type === "resource_link") {
      parts.push(`[Resource: ${block.name}] ${block.uri}`);
    } else if (block.type === "resource" && "text" in block.resource) {
      parts.push(
        `[Embedded resource: ${block.resource.uri}]\n${block.resource.text.slice(
          0,
          MAX_CONTEXT_RESOURCE_CHARS,
        )}`,
      );
    } else if (block.type === "image") {
      parts.push(
        `[Image: ${block.mimeType}${block.uri ? ` ${block.uri}` : ""}]`,
      );
    } else if (block.type === "audio") {
      parts.push(`[Audio: ${block.mimeType}]`);
    }
  }
  const metaResources = Array.isArray(meta?.resources)
    ? meta.resources.slice(0, 20)
    : [];
  const editorContext = session.editorContext;
  if (metaResources.length > 0 || editorContext) {
    parts.push(
      [
        "[ACP editor context]",
        editorContext
          ? JSON.stringify(editorContext).slice(0, MAX_CONTEXT_RESOURCE_CHARS)
          : undefined,
        metaResources.length
          ? `_meta/resources: ${JSON.stringify(metaResources).slice(
              0,
              MAX_CONTEXT_RESOURCE_CHARS,
            )}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return parts.join("\n\n").trim();
}
