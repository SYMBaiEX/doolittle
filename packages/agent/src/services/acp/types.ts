import type {
  ClientCapabilities,
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  ReadTextFileRequest,
  ReleaseTerminalRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
} from "@doolittle/acp";
import type { RunUpdateEvent } from "../run-controller-service";

export interface AcpServicePaths {
  registryDir: string;
  registryPath: string;
  exportDir: string;
  importDir: string;
  rootPackagePath: string;
}

export interface AcpSessionSummarySource {
  totalSessions: number;
  recentSessionIds: string[];
}

export interface AcpImportBundlePayload {
  label?: string;
  package?: { name?: string };
  tools?: unknown[];
}

export interface AcpEditorResource {
  uri: string;
  name?: string;
  text?: string;
}

export interface AcpEditorSelection {
  startLine?: number;
  startLineNumber?: number;
  startColumn: number;
  endLine?: number;
  endLineNumber?: number;
  endColumn: number;
  text?: string;
}

export interface AcpEditorCursor {
  lineNumber: number;
  column: number;
}

export interface AcpEditorVisibleRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface AcpEditorContext {
  activeFile?: string;
  path?: string;
  uri?: string;
  language?: string;
  content?: string;
  version?: number;
  dirty?: boolean;
  focused?: boolean;
  cursor?: AcpEditorCursor;
  selection?: AcpEditorSelection;
  visibleRanges?: AcpEditorVisibleRange[];
  resources?: AcpEditorResource[];
}

export interface AcpProtocolSession {
  sessionId: string;
  cwd: string;
  additionalDirectories: string[];
  clientCapabilities: ClientCapabilities;
  editorContextSupported: boolean;
  editorContext?: AcpEditorContext;
  editorContextUpdatedAt?: string;
  pendingPrompt?: AbortController;
}

export interface AcpLatestEditorContext {
  sessionId: string;
  workspaceRoot: string;
  updatedAt: string;
  context: AcpEditorContext;
}

export interface AcpSessionUpdateRecord {
  cursor: number;
  sessionId: string;
  receivedAt: string;
  update: SessionUpdate;
}

export interface AcpProtocolSnapshot {
  sessionId: string;
  cursor: number;
  updates: AcpSessionUpdateRecord[];
}

export interface AcpProtocolHost {
  assertWorkspacePath(path: string): void;
  readWorkspace(path: string, options?: ReadTextFileRequest): string;
  writeWorkspace(path: string, content: string): Promise<string>;
  requestPermission(
    params: RequestPermissionRequest,
    signal: AbortSignal,
  ): Promise<RequestPermissionResponse>;
  createTerminal(
    params: CreateTerminalRequest,
    signal: AbortSignal,
  ): Promise<CreateTerminalResponse>;
  terminalOutput(
    params: TerminalOutputRequest,
  ): Promise<TerminalOutputResponse> | TerminalOutputResponse;
  waitForTerminalExit(
    params: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse>;
  killTerminal(params: KillTerminalRequest): Promise<void>;
  releaseTerminal(params: ReleaseTerminalRequest): Promise<void>;
  executeTurn(input: {
    sessionId: string;
    message: string;
    signal: AbortSignal;
    onText(delta: string): Promise<void>;
    onRunUpdate(event: RunUpdateEvent): Promise<void>;
  }): Promise<string>;
}
