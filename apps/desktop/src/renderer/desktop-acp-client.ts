import { useCallback, useEffect, useRef, useState } from "react";
import type { CodeEditorStateSnapshot } from "./components/CodeEditor";

const MAX_EDITOR_CONTENT_CHARS = 32_000;
const EDITOR_SYNC_DELAY_MS = 180;

export type DesktopAcpPhase = "idle" | "connecting" | "connected" | "degraded";

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

class DesktopAcpClient {
  private initializePromise?: Promise<void>;
  private readonly sessions = new Map<string, Promise<string>>();

  async ensureSession(workspacePath: string): Promise<string> {
    const key = workspacePath.trim();
    if (!key) throw new Error("An ACP workspace path is required.");
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

  private async initialize(): Promise<void> {
    if (!this.initializePromise) {
      this.initializePromise = window.doolittle
        .api({
          path: "/acp/initialize",
          method: "POST",
          body: {},
        })
        .then(() => undefined)
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

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    lastPayloadRef.current = "";
    pendingContextRef.current = undefined;
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

  return {
    error,
    flushEditorState,
    phase,
    publishEditorState,
    sessionId,
  };
}
