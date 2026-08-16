import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  AttachmentSelection,
  ChatRequest,
  DesktopCommandRequest,
  DesktopLifecycleState,
  FileSelection,
  InteractiveTerminalInputRequest,
  InteractiveTerminalOutput,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalSession,
  InteractiveTerminalStartRequest,
  ProjectResourceSelection,
  ProviderAuthProvider,
  ProviderAuthStartOptions,
  RecordedAudioImportRequest,
  TerminalStreamRequest,
  WorkspaceFileSaveRequest,
  WorkspacePickResult,
  WorkspaceState,
} from "../../shared/contracts";
import type { BackendManager } from "../backend";
import type { ProviderAuthController } from "../provider-auth";
import type { DesktopUpdateController } from "../update-state";
import {
  fullyDecodeComponent,
  hasControlCharacters,
  isRecord,
  isSafeResourceId,
} from "./input-validation";

export const MAX_WORKSPACE_PATH_LENGTH = 4_096;
export const MAX_WORKSPACE_FILE_BYTES = 1_000_000;
export const MAX_CHAT_ATTACHMENTS = 8;
export const MAX_INTERACTIVE_TERMINAL_INPUT_BYTES = 64_000;
export const MIN_INTERACTIVE_TERMINAL_COLUMNS = 20;
export const MAX_INTERACTIVE_TERMINAL_COLUMNS = 400;
export const MIN_INTERACTIVE_TERMINAL_ROWS = 5;
export const MAX_INTERACTIVE_TERMINAL_ROWS = 200;

const MAX_COMMAND_LENGTH = 4_096;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface SensitiveActionConfirmationRequest {
  kind:
    | "command"
    | "workspace-write"
    | "worktree-create"
    | "repository-mutation";
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}

export interface DesktopBackgroundNotification {
  title: string;
  body: string;
}

export interface SensitiveActionIpcDependencies {
  confirm?: (request: SensitiveActionConfirmationRequest) => Promise<boolean>;
  fetch?: typeof fetch;
  notify?: (notification: DesktopBackgroundNotification) => void;
}

export interface DesktopControlIpcDependencies {
  getLifecycleState: () => DesktopLifecycleState;
  setKeepRunningInBackground: (enabled: boolean) => DesktopLifecycleState;
  updates: DesktopUpdateController;
  providerAuth?: ProviderAuthController;
}

export interface WorkspaceIpcController {
  getState(): WorkspaceState;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace?(path: string): Promise<WorkspacePickResult>;
  switchWorkspace(path: string): Promise<WorkspacePickResult>;
  subscribe(listener: (state: WorkspaceState) => void): () => void;
}

export interface RegisterIpcDependencies {
  ipcMain: IpcMain;
  backend: BackendManager;
  getMainWindow: () => BrowserWindow | null;
  authorizeSender?: (event: IpcMainInvokeEvent) => boolean;
  pickFiles: () => Promise<FileSelection>;
  workspace: WorkspaceIpcController;
  sensitiveActionDependencies?: SensitiveActionIpcDependencies;
  pickChatAttachments?: () => Promise<AttachmentSelection>;
  pickProjectFiles?: () => Promise<ProjectResourceSelection>;
  pickProjectFolders?: () => Promise<ProjectResourceSelection>;
  importRecordedAudio?: (
    request: RecordedAudioImportRequest,
  ) => AttachmentSelection["attachments"][number];
  discardRecordedAudio?: (recordingId: string) => void;
  desktopControls?: DesktopControlIpcDependencies;
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function validateDesktopCommandRequest(
  value: unknown,
): Required<DesktopCommandRequest> {
  if (!isRecord(value)) {
    throw new Error("A command request is required.");
  }
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (!command) {
    throw new Error("A command is required.");
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    throw new Error(
      `Command must be ${MAX_COMMAND_LENGTH.toLocaleString()} characters or fewer.`,
    );
  }
  if (command.includes("\0")) {
    throw new Error("Command contains an unsupported null character.");
  }
  const timeoutMs =
    value.timeoutMs === undefined
      ? DEFAULT_COMMAND_TIMEOUT_MS
      : value.timeoutMs;
  if (
    typeof timeoutMs !== "number" ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < MIN_COMMAND_TIMEOUT_MS ||
    timeoutMs > MAX_COMMAND_TIMEOUT_MS
  ) {
    throw new Error(
      `Command timeout must be an integer from ${MIN_COMMAND_TIMEOUT_MS} to ${MAX_COMMAND_TIMEOUT_MS} milliseconds.`,
    );
  }
  const request = { command, timeoutMs };
  if (serializedByteLength(request) > MAX_COMMAND_LENGTH + 1_000) {
    throw new Error("Command request is too large.");
  }
  return request;
}

export function validateTerminalRequestId(value: unknown): string {
  const requestId = typeof value === "string" ? value.trim() : "";
  if (
    !requestId ||
    requestId.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/u.test(requestId)
  ) {
    throw new Error("A safe terminal request id is required.");
  }
  return requestId;
}

export function validateTerminalStreamRequest(
  value: unknown,
): Required<TerminalStreamRequest> {
  if (!isRecord(value)) {
    throw new Error("A terminal stream request is required.");
  }
  return {
    requestId: validateTerminalRequestId(value.requestId),
    ...validateDesktopCommandRequest(value),
  };
}

export function validateInteractiveTerminalSessionId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(id)) {
    throw new Error("A valid interactive terminal session id is required.");
  }
  return id;
}

export function validateInteractiveTerminalDimension(
  value: unknown,
  label: "columns" | "rows",
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(
      `Terminal ${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

export function validateInteractiveTerminalStartRequest(
  value: unknown,
): InteractiveTerminalStartRequest {
  if (!isRecord(value)) {
    throw new Error("Interactive terminal dimensions are required.");
  }
  return {
    cols: validateInteractiveTerminalDimension(
      value.cols,
      "columns",
      MIN_INTERACTIVE_TERMINAL_COLUMNS,
      MAX_INTERACTIVE_TERMINAL_COLUMNS,
    ),
    rows: validateInteractiveTerminalDimension(
      value.rows,
      "rows",
      MIN_INTERACTIVE_TERMINAL_ROWS,
      MAX_INTERACTIVE_TERMINAL_ROWS,
    ),
  };
}

export function validateInteractiveTerminalInputRequest(
  value: unknown,
): InteractiveTerminalInputRequest {
  if (!isRecord(value) || typeof value.data !== "string" || !value.data) {
    throw new Error("Interactive terminal input is required.");
  }
  if (
    new TextEncoder().encode(value.data).byteLength >
    MAX_INTERACTIVE_TERMINAL_INPUT_BYTES
  ) {
    throw new Error("Interactive terminal input is too large.");
  }
  return {
    sessionId: validateInteractiveTerminalSessionId(value.sessionId),
    data: value.data,
  };
}

export function validateInteractiveTerminalResizeRequest(
  value: unknown,
): InteractiveTerminalResizeRequest {
  if (!isRecord(value)) {
    throw new Error("Interactive terminal resize details are required.");
  }
  return {
    sessionId: validateInteractiveTerminalSessionId(value.sessionId),
    cols: validateInteractiveTerminalDimension(
      value.cols,
      "columns",
      MIN_INTERACTIVE_TERMINAL_COLUMNS,
      MAX_INTERACTIVE_TERMINAL_COLUMNS,
    ),
    rows: validateInteractiveTerminalDimension(
      value.rows,
      "rows",
      MIN_INTERACTIVE_TERMINAL_ROWS,
      MAX_INTERACTIVE_TERMINAL_ROWS,
    ),
  };
}

export function validateInteractiveTerminalSession(
  value: unknown,
): InteractiveTerminalSession {
  if (!isRecord(value)) {
    throw new Error("The runtime returned an invalid terminal session.");
  }
  const state = value.state;
  if (state !== "running" && state !== "exited" && state !== "closed") {
    throw new Error("The runtime returned an invalid terminal session state.");
  }
  if (
    typeof value.cwd !== "string" ||
    !value.cwd ||
    typeof value.shell !== "string" ||
    !value.shell ||
    typeof value.startedAt !== "string" ||
    !value.startedAt ||
    typeof value.pty !== "boolean" ||
    typeof value.supportsResize !== "boolean" ||
    typeof value.outputBytes !== "number" ||
    !Number.isSafeInteger(value.outputBytes) ||
    value.outputBytes < 0
  ) {
    throw new Error("The runtime returned invalid terminal session details.");
  }
  if (
    value.completedAt !== undefined &&
    typeof value.completedAt !== "string"
  ) {
    throw new Error(
      "The runtime returned an invalid terminal completion time.",
    );
  }
  if (
    value.exitCode !== undefined &&
    (typeof value.exitCode !== "number" ||
      !Number.isSafeInteger(value.exitCode))
  ) {
    throw new Error("The runtime returned an invalid terminal exit code.");
  }

  return {
    id: validateInteractiveTerminalSessionId(value.id),
    state,
    cwd: value.cwd,
    shell: value.shell,
    cols: validateInteractiveTerminalDimension(
      value.cols,
      "columns",
      MIN_INTERACTIVE_TERMINAL_COLUMNS,
      MAX_INTERACTIVE_TERMINAL_COLUMNS,
    ),
    rows: validateInteractiveTerminalDimension(
      value.rows,
      "rows",
      MIN_INTERACTIVE_TERMINAL_ROWS,
      MAX_INTERACTIVE_TERMINAL_ROWS,
    ),
    startedAt: value.startedAt,
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: value.completedAt }),
    ...(value.exitCode === undefined ? {} : { exitCode: value.exitCode }),
    pty: value.pty,
    supportsResize: value.supportsResize,
    outputBytes: value.outputBytes,
  };
}

export function validateInteractiveTerminalOutput(
  value: unknown,
): InteractiveTerminalOutput {
  if (
    !isRecord(value) ||
    !Array.isArray(value.chunks) ||
    typeof value.nextCursor !== "number" ||
    !Number.isSafeInteger(value.nextCursor) ||
    value.nextCursor < 0 ||
    typeof value.truncatedBeforeCursor !== "boolean"
  ) {
    throw new Error("The runtime returned invalid terminal output.");
  }
  const chunks = value.chunks.map((chunk) => {
    if (
      !isRecord(chunk) ||
      typeof chunk.cursor !== "number" ||
      !Number.isSafeInteger(chunk.cursor) ||
      chunk.cursor < 0 ||
      typeof chunk.data !== "string"
    ) {
      throw new Error("The runtime returned an invalid terminal output chunk.");
    }
    return { cursor: chunk.cursor, data: chunk.data };
  });
  return {
    session: validateInteractiveTerminalSession(value.session),
    chunks,
    nextCursor: value.nextCursor,
    truncatedBeforeCursor: value.truncatedBeforeCursor,
  };
}

export function validateSensitiveWorkspacePath(path: unknown): string {
  if (typeof path !== "string" || !path || path !== path.trim()) {
    throw new Error("A workspace-relative file path is required.");
  }
  if (
    path.length > MAX_WORKSPACE_PATH_LENGTH ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\") ||
    hasControlCharacters(path)
  ) {
    throw new Error("File path must be a safe workspace-relative path.");
  }
  const decoded = fullyDecodeComponent(path);
  if (decoded === null || decoded !== path) {
    throw new Error("Encoded file paths are not accepted.");
  }
  if (
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("File path contains unsafe traversal tokens.");
  }
  return path;
}

export function validateWorkspaceFileSaveRequest(
  value: unknown,
): WorkspaceFileSaveRequest {
  if (!isRecord(value)) {
    throw new Error("A workspace file save request is required.");
  }
  const path = validateSensitiveWorkspacePath(value.path);
  if (
    typeof value.content !== "string" ||
    typeof value.expectedContent !== "string"
  ) {
    throw new Error(
      "File content and its expected prior content are required.",
    );
  }
  const contentBytes = new TextEncoder().encode(value.content).byteLength;
  const expectedContentBytes = new TextEncoder().encode(
    value.expectedContent,
  ).byteLength;
  if (
    contentBytes > MAX_WORKSPACE_FILE_BYTES ||
    expectedContentBytes > MAX_WORKSPACE_FILE_BYTES
  ) {
    throw new Error(
      `Workspace files must be ${MAX_WORKSPACE_FILE_BYTES.toLocaleString()} bytes or smaller.`,
    );
  }
  const request = {
    path,
    content: value.content,
    expectedContent: value.expectedContent,
  };
  if (
    serializedByteLength(request) >
    MAX_WORKSPACE_FILE_BYTES * 2 + MAX_WORKSPACE_PATH_LENGTH + 1_000
  ) {
    throw new Error("Workspace save request is too large.");
  }
  return request;
}

export function validateChatAttachmentIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CHAT_ATTACHMENTS) {
    throw new Error(
      `A chat request may include at most ${MAX_CHAT_ATTACHMENTS} attachments.`,
    );
  }
  const ids = value.map((entry) => {
    if (typeof entry !== "string" || !UUID_PATTERN.test(entry)) {
      throw new Error("A chat attachment id is invalid.");
    }
    return entry.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) {
    throw new Error("A chat request cannot include duplicate attachments.");
  }
  return ids;
}

export function assertChatRequest(
  request: ChatRequest,
): asserts request is ChatRequest & {
  requestId: string;
  message: string;
  roomId: string;
  workspacePath: string;
} {
  const message = request.message?.trim();
  if (!request.requestId) {
    throw new Error("A request id is required.");
  }
  if (!message) {
    throw new Error("A message is required.");
  }
  if (!request.roomId) {
    throw new Error("A conversation id is required.");
  }
  if (
    typeof request.workspacePath !== "string" ||
    !request.workspacePath ||
    request.workspacePath !== request.workspacePath.trim() ||
    request.workspacePath.length > MAX_WORKSPACE_PATH_LENGTH ||
    hasControlCharacters(request.workspacePath)
  ) {
    throw new Error("A valid workspace path is required.");
  }
  if (
    request.projectId !== undefined &&
    (typeof request.projectId !== "string" ||
      !isSafeResourceId(request.projectId))
  ) {
    throw new Error("A project id is invalid.");
  }
  const attachmentIds = validateChatAttachmentIds(request.attachmentIds);
  if (
    attachmentIds.length > 0 &&
    (message.startsWith("/") || message.startsWith("!"))
  ) {
    throw new Error("Command messages cannot include attachments.");
  }
}

export function validateProviderAuthProvider(
  provider: unknown,
): ProviderAuthProvider {
  if (provider === "codex" || provider === "claude-code") return provider;
  throw new Error("Provider sign in is only available for Codex and Claude.");
}

export function validateProviderAuthStartOptions(
  value: unknown,
): ProviderAuthStartOptions {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provider sign-in options must be an object.");
  }
  const options = value as Record<string, unknown>;
  if (
    options.accountId !== undefined &&
    typeof options.accountId !== "string"
  ) {
    throw new Error("Provider account ID must be a string.");
  }
  if (options.label !== undefined && typeof options.label !== "string") {
    throw new Error("Provider account label must be a string.");
  }
  return {
    ...(typeof options.accountId === "string"
      ? { accountId: options.accountId }
      : {}),
    ...(typeof options.label === "string" ? { label: options.label } : {}),
  };
}
