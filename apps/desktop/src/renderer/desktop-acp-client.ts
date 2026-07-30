import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeEditorStateSnapshot } from "./components/CodeEditor";

const MAX_EDITOR_CONTENT_CHARS = 32_000;
const MAX_SESSION_UPDATES = 100;
const EDITOR_SYNC_DELAY_MS = 180;
const SESSION_UPDATE_POLL_MS = 1_000;

export type DesktopAcpPhase = "idle" | "connecting" | "connected" | "degraded";
export type DesktopAcpPromptPhase = "idle" | "running" | "cancelling";

export type DesktopAcpPromptBlock =
  | { type: "text"; text: string }
  | {
      type: "resource_link";
      uri: string;
      name: string;
      mimeType?: string;
    }
  | {
      type: "resource";
      resource: { uri: string; text: string; mimeType?: string };
    };

export interface DesktopAcpSessionUpdate {
  cursor: number;
  sessionId?: string;
  receivedAt?: string;
  update: unknown;
}

export interface DesktopAcpSnapshot {
  sessionId: string;
  cursor: number;
  updates: DesktopAcpSessionUpdate[];
}

export interface DesktopAcpTerminal {
  terminalId?: string;
  output?: string;
  [key: string]: unknown;
}

export interface DesktopAcpPromptResult {
  stopReason?: string;
  updates?: DesktopAcpSessionUpdate[];
}

export interface DesktopAcpCapabilities {
  embeddedContext: boolean;
}

export function buildDesktopAcpPromptBlocks(
  text: string,
  context: DesktopAcpEditorContext | undefined,
  capabilities: DesktopAcpCapabilities,
): DesktopAcpPromptBlock[] {
  const normalizedText = requireValue(text, "An ACP prompt is required.");
  const blocks: DesktopAcpPromptBlock[] = [
    { type: "text", text: normalizedText },
  ];
  if (!context) return blocks;
  blocks.push(
    capabilities.embeddedContext
      ? {
          type: "resource",
          resource: {
            uri: context.uri,
            text: context.content,
            mimeType: "text/plain",
          },
        }
      : {
          type: "resource_link",
          uri: context.uri,
          name: context.activeFile,
          mimeType: "text/plain",
        },
  );
  return blocks;
}

export function describeDesktopAcpUpdate(update: unknown): string {
  if (!update || typeof update !== "object") return "ACP update";
  const record = update as Record<string, unknown>;
  for (const key of ["sessionUpdate", "type", "kind", "status"]) {
    if (typeof record[key] === "string" && record[key])
      return record[key] as string;
  }
  return "ACP update";
}

export function desktopAcpResponseText(
  updates: DesktopAcpSessionUpdate[],
): string {
  return updates
    .map((entry) => {
      if (!entry.update || typeof entry.update !== "object") return "";
      const update = entry.update as Record<string, unknown>;
      if (update.sessionUpdate !== "agent_message_chunk") return "";
      const content =
        update.content && typeof update.content === "object"
          ? (update.content as Record<string, unknown>)
          : undefined;
      return content?.type === "text" && typeof content.text === "string"
        ? content.text
        : "";
    })
    .join("");
}

export function mergeDesktopAcpUpdates(
  current: DesktopAcpSessionUpdate[],
  incoming: DesktopAcpSessionUpdate[],
): DesktopAcpSessionUpdate[] {
  const merged = new Map<number, DesktopAcpSessionUpdate>();
  for (const entry of [...current, ...incoming]) {
    if (Number.isSafeInteger(entry.cursor) && entry.cursor >= 0) {
      merged.set(entry.cursor, entry);
    }
  }
  return [...merged.values()]
    .sort((left, right) => left.cursor - right.cursor)
    .slice(-MAX_SESSION_UPDATES);
}

export interface DesktopAcpEditorContext {
  activeFile: string;
  path: string;
  uri: string;
  language: string;
  content: string;
  version: number;
  dirty: boolean;
  focused: boolean;
  cursor?: {
    lineNumber: number;
    column: number;
  };
  selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    text: string;
  };
  visibleRanges: Array<{
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }>;
  resources: Array<{
    uri: string;
    name: string;
    text: string;
  }>;
}

interface AcpSessionResponse {
  session?: {
    sessionId?: string;
  };
}

interface AcpEditorContextResponse {
  context?: DesktopAcpEditorContext;
}

interface AcpUpdatesResponse {
  snapshot?: DesktopAcpSnapshot;
}

interface AcpPromptResponse {
  result?: DesktopAcpPromptResult;
}

interface AcpTerminalResponse {
  terminal?: DesktopAcpTerminal;
}

interface AcpInitializeResponse {
  initialized?: {
    agentCapabilities?: {
      promptCapabilities?: {
        embeddedContext?: boolean;
      };
    };
  };
}

export function buildDesktopAcpEditorContext(
  snapshot: CodeEditorStateSnapshot,
  dirty: boolean,
): DesktopAcpEditorContext {
  const content = snapshot.content.slice(0, MAX_EDITOR_CONTENT_CHARS);
  return {
    activeFile: snapshot.path,
    path: snapshot.path,
    uri: snapshot.uri,
    language: snapshot.language,
    content,
    version: snapshot.version,
    dirty,
    focused: snapshot.focused,
    cursor: snapshot.cursor
      ? {
          lineNumber: snapshot.cursor.line,
          column: snapshot.cursor.column,
        }
      : undefined,
    selection: snapshot.selection
      ? {
          startLineNumber: snapshot.selection.startLine,
          startColumn: snapshot.selection.startColumn,
          endLineNumber: snapshot.selection.endLine,
          endColumn: snapshot.selection.endColumn,
          text: snapshot.selection.text.slice(0, MAX_EDITOR_CONTENT_CHARS),
        }
      : undefined,
    visibleRanges: snapshot.visibleRanges.slice(0, 20).map((range) => ({
      startLineNumber: range.startLine,
      startColumn: range.startColumn,
      endLineNumber: range.endLine,
      endColumn: range.endColumn,
    })),
    resources: [
      {
        uri: snapshot.uri,
        name: snapshot.path.split("/").at(-1) ?? snapshot.path,
        text: content,
      },
    ],
  };
}

export class DesktopAcpClient {
  private initializePromise?: Promise<DesktopAcpCapabilities>;
  private readonly sessions = new Map<string, Promise<string>>();

  capabilities(): Promise<DesktopAcpCapabilities> {
    return this.initialize();
  }

  async ensureSession(workspacePath: string): Promise<string> {
    const key = requireValue(
      workspacePath,
      "An ACP workspace path is required.",
    );
    const existing = this.sessions.get(key);
    if (existing) return existing;
    const pending = this.createSession(key).catch((error) => {
      this.sessions.delete(key);
      throw error;
    });
    this.sessions.set(key, pending);
    return pending;
  }

  async syncEditorContext(
    workspacePath: string,
    context: DesktopAcpEditorContext,
  ): Promise<{ sessionId: string; context?: DesktopAcpEditorContext }> {
    const sessionId = await this.ensureSession(workspacePath);
    const response = await window.doolittle.api<AcpEditorContextResponse>({
      path: "/acp/editor/context",
      method: "POST",
      body: {
        sessionId,
        ...context,
      },
    });
    return { sessionId, context: response.context };
  }

  async prompt(
    workspacePath: string,
    prompt: DesktopAcpPromptBlock[],
  ): Promise<{ sessionId: string; result?: DesktopAcpPromptResult }> {
    if (prompt.length === 0) {
      throw new Error("An ACP prompt is required.");
    }
    const sessionId = await this.ensureSession(workspacePath);
    const response = await window.doolittle.api<AcpPromptResponse>({
      path: "/acp/session/prompt",
      method: "POST",
      body: { sessionId, prompt },
    });
    return { sessionId, result: response.result };
  }

  async cancel(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return;
    await window.doolittle.api({
      path: "/acp/session/cancel",
      method: "POST",
      body: { sessionId: normalizedSessionId },
    });
  }

  async loadSession(sessionId: string, workspacePath: string): Promise<void> {
    const normalizedSessionId = requireValue(
      sessionId,
      "An ACP session id is required.",
    );
    const key = requireValue(
      workspacePath,
      "An ACP workspace path is required.",
    );
    await this.initialize();
    await window.doolittle.api({
      path: "/acp/session/load",
      method: "POST",
      body: {
        sessionId: normalizedSessionId,
        cwd: key,
        _meta: {
          "doolittle/editor-context": true,
          "doolittle/resources": true,
        },
      },
    });
    this.sessions.set(key, Promise.resolve(normalizedSessionId));
  }

  async updates(
    sessionId: string,
    cursor = 0,
  ): Promise<AcpUpdatesResponse["snapshot"]> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) return undefined;
    const normalizedCursor = normalizeCursor(cursor);
    const response = await window.doolittle.api<AcpUpdatesResponse>({
      path: `/acp/session/updates?sessionId=${encodeURIComponent(normalizedSessionId)}&cursor=${normalizedCursor}`,
      method: "GET",
    });
    return response.snapshot;
  }

  async readFile(sessionId: string, path: string): Promise<string> {
    const input = sessionPathInput(sessionId, path);
    const response = await window.doolittle.api<{ content?: string }>({
      path: "/acp/fs/read",
      method: "POST",
      body: input,
    });
    return response.content ?? "";
  }

  async writeFile(
    sessionId: string,
    path: string,
    content: string,
  ): Promise<unknown> {
    const input = sessionPathInput(sessionId, path);
    const response = await window.doolittle.api<{ result?: unknown }>({
      path: "/acp/fs/write",
      method: "POST",
      body: { ...input, content },
    });
    return response.result;
  }

  async createTerminal(
    sessionId: string,
    command: string,
    args: string[] = [],
  ): Promise<DesktopAcpTerminal | undefined> {
    const normalizedSessionId = requireValue(
      sessionId,
      "An ACP session id is required.",
    );
    const normalizedCommand = requireValue(
      command,
      "An ACP terminal command is required.",
    );
    const response = await window.doolittle.api<AcpTerminalResponse>({
      path: "/acp/terminal/create",
      method: "POST",
      body: {
        sessionId: normalizedSessionId,
        command: normalizedCommand,
        args,
      },
    });
    return response.terminal;
  }

  async terminalOutput(
    sessionId: string,
    terminalId: string,
    cursor = 0,
  ): Promise<DesktopAcpTerminal | undefined> {
    const input = terminalInput(sessionId, terminalId);
    const response = await window.doolittle.api<AcpTerminalResponse>({
      path: "/acp/terminal/output",
      method: "POST",
      body: { ...input, cursor: normalizeCursor(cursor) },
    });
    return response.terminal;
  }

  async waitForTerminal(
    sessionId: string,
    terminalId: string,
  ): Promise<DesktopAcpTerminal | undefined> {
    const input = terminalInput(sessionId, terminalId);
    const response = await window.doolittle.api<AcpTerminalResponse>({
      path: "/acp/terminal/wait",
      method: "POST",
      body: input,
    });
    return response.terminal;
  }

  async killTerminal(sessionId: string, terminalId: string): Promise<void> {
    const input = terminalInput(sessionId, terminalId);
    await window.doolittle.api({
      path: "/acp/terminal/kill",
      method: "POST",
      body: input,
    });
  }

  async releaseTerminal(sessionId: string, terminalId: string): Promise<void> {
    const input = terminalInput(sessionId, terminalId);
    await window.doolittle.api({
      path: "/acp/terminal/release",
      method: "POST",
      body: input,
    });
  }

  private async initialize(): Promise<DesktopAcpCapabilities> {
    if (!this.initializePromise) {
      this.initializePromise = window.doolittle
        .api<AcpInitializeResponse>({
          path: "/acp/initialize",
          method: "POST",
          body: {},
        })
        .then((response) => ({
          embeddedContext:
            response.initialized?.agentCapabilities?.promptCapabilities
              ?.embeddedContext === true,
        }))
        .catch((error) => {
          this.initializePromise = undefined;
          throw error;
        });
    }
    return this.initializePromise;
  }

  private async createSession(workspacePath: string): Promise<string> {
    await this.initialize();
    const response = await window.doolittle.api<AcpSessionResponse>({
      path: "/acp/session/new",
      method: "POST",
      body: {
        cwd: workspacePath,
        mcpServers: [],
        _meta: {
          "doolittle/editor-context": true,
          "doolittle/resources": true,
        },
      },
    });
    const sessionId = response.session?.sessionId?.trim();
    if (!sessionId) {
      throw new Error("The ACP runtime did not return a session id.");
    }
    return sessionId;
  }
}

function requireValue(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function normalizeCursor(cursor: number): number {
  return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : 0;
}

function sessionPathInput(
  sessionId: string,
  path: string,
): { sessionId: string; path: string } {
  return {
    sessionId: requireValue(sessionId, "An ACP session id is required."),
    path: requireValue(path, "An ACP file path is required."),
  };
}

function terminalInput(
  sessionId: string,
  terminalId: string,
): { sessionId: string; terminalId: string } {
  return {
    sessionId: requireValue(sessionId, "An ACP session id is required."),
    terminalId: requireValue(terminalId, "An ACP terminal id is required."),
  };
}

const desktopAcpClient = new DesktopAcpClient();

export function useDesktopAcpEditorBridge({
  active,
  workspacePath,
}: {
  active: boolean;
  workspacePath: string;
}) {
  const [phase, setPhase] = useState<DesktopAcpPhase>("idle");
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const timerRef = useRef<number | undefined>(undefined);
  const generationRef = useRef(0);
  const lastPayloadRef = useRef("");
  const pendingContextRef = useRef<DesktopAcpEditorContext | undefined>(
    undefined,
  );
  const latestContextRef = useRef<DesktopAcpEditorContext | undefined>(
    undefined,
  );
  const cursorRef = useRef(0);
  const pollingRef = useRef(false);
  const promptPhaseRef = useRef<DesktopAcpPromptPhase>("idle");
  const [updates, setUpdates] = useState<DesktopAcpSessionUpdate[]>([]);
  const [promptPhase, setPromptPhase] = useState<DesktopAcpPromptPhase>("idle");
  const [promptError, setPromptError] = useState("");
  const [stopReason, setStopReason] = useState("");

  useEffect(() => {
    promptPhaseRef.current = promptPhase;
  }, [promptPhase]);

  useEffect(() => {
    const boundSessionId = sessionId;
    return () => {
      if (boundSessionId && promptPhaseRef.current !== "idle") {
        void desktopAcpClient.cancel(boundSessionId).catch(() => undefined);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    lastPayloadRef.current = "";
    pendingContextRef.current = undefined;
    latestContextRef.current = undefined;
    cursorRef.current = 0;
    setUpdates([]);
    setPromptPhase("idle");
    setPromptError("");
    setStopReason("");
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    if (!active || !workspacePath.trim()) {
      setPhase("idle");
      setSessionId("");
      setError("");
      return;
    }
    setPhase("connecting");
    setError("");
    void desktopAcpClient
      .ensureSession(workspacePath)
      .then((nextSessionId) => {
        if (generationRef.current !== generation) return;
        setSessionId(nextSessionId);
        setPhase("connected");
      })
      .catch((reason) => {
        if (generationRef.current !== generation) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase("degraded");
      });
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [active, workspacePath]);

  useEffect(() => {
    if (
      !active ||
      !sessionId ||
      phase !== "connected" ||
      promptPhase === "idle"
    )
      return;
    let disposed = false;
    const poll = async () => {
      if (disposed || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const snapshot = await desktopAcpClient.updates(
          sessionId,
          cursorRef.current,
        );
        if (!snapshot || disposed) return;
        setPromptError("");
        cursorRef.current = snapshot.cursor;
        if (snapshot.updates.length > 0) {
          setUpdates((current) =>
            mergeDesktopAcpUpdates(current, snapshot.updates),
          );
        }
      } catch (reason) {
        if (!disposed) {
          setPromptError(
            reason instanceof Error ? reason.message : String(reason),
          );
        }
      } finally {
        pollingRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), SESSION_UPDATE_POLL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [active, phase, promptPhase, sessionId]);

  const syncEditorContext = useCallback(
    async (
      context: DesktopAcpEditorContext,
      generation: number,
    ): Promise<void> => {
      try {
        const result = await desktopAcpClient.syncEditorContext(
          workspacePath,
          context,
        );
        if (generationRef.current !== generation) return;
        pendingContextRef.current = undefined;
        setSessionId(result.sessionId);
        setError("");
        setPhase("connected");
      } catch (reason) {
        if (generationRef.current !== generation) return;
        lastPayloadRef.current = "";
        setError(reason instanceof Error ? reason.message : String(reason));
        setPhase("degraded");
      }
    },
    [workspacePath],
  );

  const publishEditorState = useCallback(
    (snapshot: CodeEditorStateSnapshot, dirty: boolean) => {
      if (!active || !workspacePath.trim()) return;
      const context = buildDesktopAcpEditorContext(snapshot, dirty);
      latestContextRef.current = context;
      const payload = JSON.stringify(context);
      if (payload === lastPayloadRef.current) return;
      lastPayloadRef.current = payload;
      pendingContextRef.current = context;
      const generation = generationRef.current;
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        void syncEditorContext(context, generation);
      }, EDITOR_SYNC_DELAY_MS);
    },
    [active, syncEditorContext, workspacePath],
  );

  const flushEditorState = useCallback(async (): Promise<void> => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    const pending = pendingContextRef.current;
    if (!pending || !active || !workspacePath.trim()) return;
    await syncEditorContext(pending, generationRef.current);
  }, [active, syncEditorContext, workspacePath]);

  const prompt = useCallback(
    async (text: string): Promise<DesktopAcpPromptResult | undefined> => {
      const normalizedText = text.trim();
      if (!normalizedText) {
        setPromptError("Enter an ACP editor task.");
        return undefined;
      }
      if (!active || phase !== "connected") {
        setPromptError("The ACP editor session is not connected.");
        return undefined;
      }
      const generation = generationRef.current;
      setPromptError("");
      setStopReason("");
      setUpdates([]);
      setPromptPhase("running");
      try {
        await flushEditorState();
        const capabilities = await desktopAcpClient.capabilities();
        const blocks = buildDesktopAcpPromptBlocks(
          normalizedText,
          latestContextRef.current,
          capabilities,
        );
        const response = await desktopAcpClient.prompt(workspacePath, blocks);
        if (generationRef.current !== generation) return response.result;
        setSessionId(response.sessionId);
        const resultUpdates = (response.result?.updates ?? []).filter(
          (entry) =>
            entry.sessionId === undefined ||
            entry.sessionId === response.sessionId,
        );
        if (resultUpdates.length > 0) {
          setUpdates((current) =>
            mergeDesktopAcpUpdates(current, resultUpdates),
          );
          cursorRef.current = Math.max(
            cursorRef.current,
            resultUpdates.at(-1)?.cursor ?? 0,
          );
        }
        setStopReason(response.result?.stopReason ?? "end_turn");
        return response.result;
      } catch (reason) {
        if (generationRef.current === generation) {
          setPromptError(
            reason instanceof Error ? reason.message : String(reason),
          );
        }
        return undefined;
      } finally {
        if (generationRef.current === generation) {
          setPromptPhase("idle");
        }
      }
    },
    [active, flushEditorState, phase, workspacePath],
  );

  const cancel = useCallback(async () => {
    if (!sessionId || promptPhase === "idle") return;
    setPromptPhase("cancelling");
    setPromptError("");
    try {
      await desktopAcpClient.cancel(sessionId);
    } catch (reason) {
      setPromptError(reason instanceof Error ? reason.message : String(reason));
      setPromptPhase("running");
    }
  }, [promptPhase, sessionId]);

  const lastUpdate = updates.at(-1);

  return {
    error,
    flushEditorState,
    phase,
    publishEditorState,
    sessionId,
    updates,
    lastUpdate,
    lastUpdateLabel: lastUpdate
      ? describeDesktopAcpUpdate(lastUpdate.update)
      : "",
    promptBusy: promptPhase !== "idle",
    promptPhase,
    promptError,
    responseText: desktopAcpResponseText(updates),
    stopReason,
    prompt,
    cancel,
  };
}
