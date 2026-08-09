import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  AttachmentSelection,
  ChatRequest,
  DesktopCommandRequest,
  DesktopCommandResult,
  DesktopLifecycleState,
  DesktopUpdateState,
  EditorProjectContextRequest,
  EditorProjectContextResult,
  FileSelection,
  InteractiveTerminalInputRequest,
  InteractiveTerminalOutput,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalSession,
  InteractiveTerminalStartRequest,
  InteractiveTerminalStartResult,
  ProjectResourceSelection,
  ProviderAuthProvider,
  ProviderAuthStartOptions,
  RecordedAudioImportRequest,
  RepositoryMutationDesktopResult,
  RepositoryMutationRequest,
  RepositoryMutationResult,
  RepositoryWorktree,
  RepositoryWorktreeCreateRequest,
  RepositoryWorktreeCreateResult,
  TerminalStreamRequest,
  WorkspaceFileSaveRequest,
  WorkspaceFileSaveResult,
  WorkspacePickResult,
  WorkspaceState,
} from "../shared/contracts";
import {
  type DesktopIpcInvokeChannel,
  desktopIpcChannels,
} from "../shared/ipc-channels";
import { SseParser } from "../shared/sse";
import type { BackendManager } from "./backend";
import { resolveEditorProjectContext } from "./editor-project-context";
import { requestAgentTransport } from "./ipc/agent-transport";
import {
  fullyDecodeComponent,
  hasControlCharacters,
  isRecord,
  isSafeResourceId,
} from "./ipc/input-validation";
import { parseRequestError, readBoundedResponseText } from "./ipc/runtime-http";
import type { ProviderAuthController } from "./provider-auth";
import type { DesktopUpdateController } from "./update-state";

const API_TIMEOUT_MS = 15_000;
const MAX_COMMAND_LENGTH = 4_096;
const MIN_COMMAND_TIMEOUT_MS = 1_000;
const MAX_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const MAX_WORKSPACE_PATH_LENGTH = 4_096;
const MAX_WORKSPACE_FILE_BYTES = 1_000_000;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;
const MAX_CHAT_ATTACHMENTS = 8;
const MAX_INTERACTIVE_TERMINAL_INPUT_BYTES = 64_000;
const MIN_INTERACTIVE_TERMINAL_COLUMNS = 20;
const MAX_INTERACTIVE_TERMINAL_COLUMNS = 400;
const MIN_INTERACTIVE_TERMINAL_ROWS = 5;
const MAX_INTERACTIVE_TERMINAL_ROWS = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export interface SensitiveActionConfirmationRequest {
  kind:
    | "command"
    | "terminal-session"
    | "workspace-write"
    | "worktree-create"
    | "repository-mutation";
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
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
  desktopControls?: DesktopControlIpcDependencies;
}

export function isTrustedDesktopIpcSender(
  event: Pick<IpcMainInvokeEvent, "sender">,
  mainWindow: Pick<BrowserWindow, "isDestroyed" | "webContents"> | null,
): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return event.sender === mainWindow.webContents;
}

export interface DesktopBackgroundNotification {
  title: string;
  body: string;
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

function validateTerminalRequestId(value: unknown): string {
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

function validateInteractiveTerminalSessionId(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(id)) {
    throw new Error("A valid interactive terminal session id is required.");
  }
  return id;
}

function validateInteractiveTerminalDimension(
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

function validateInteractiveTerminalSession(
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

function validateInteractiveTerminalOutput(
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

function validateSensitiveWorkspacePath(path: unknown): string {
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

export function validateWorktreeCreateRequest(
  value: unknown,
): RepositoryWorktreeCreateRequest {
  if (!isRecord(value)) {
    throw new Error("A worktree creation request is required.");
  }
  if (
    typeof value.branch !== "string" ||
    !value.branch ||
    value.branch !== value.branch.trim() ||
    value.branch.length > 255 ||
    value.branch.startsWith("-") ||
    value.branch.includes("\\") ||
    value.branch.includes("..") ||
    value.branch.includes("@{") ||
    value.branch.endsWith(".") ||
    value.branch.endsWith("/") ||
    /[\s~^:?*[\]]/u.test(value.branch) ||
    value.branch
      .split("/")
      .some((segment) => !segment || segment.endsWith(".lock")) ||
    hasControlCharacters(value.branch)
  ) {
    throw new Error("Branch name is not a valid Git branch.");
  }
  const path = validateSensitiveWorkspacePath(value.path);
  if (path.split("/").includes(".git")) {
    throw new Error("Worktree path contains an unsafe Git metadata segment.");
  }
  return { branch: value.branch, path };
}

const REPOSITORY_MUTATION_TYPES = new Set<RepositoryMutationRequest["type"]>([
  "stage",
  "unstage",
  "stage-all",
  "unstage-all",
  "discard",
  "discard-untracked",
  "stage-hunk",
  "unstage-hunk",
  "discard-hunk",
  "commit",
  "fetch",
  "pull",
  "push",
  "branch-create",
  "branch-switch",
  "branch-delete",
  "stash-create",
  "stash-apply",
  "stash-pop",
  "stash-drop",
  "worktree-remove",
  "worktree-prune",
  "remote-add",
  "remote-remove",
  "remote-set-url",
  "merge-abort",
  "merge",
  "rebase",
  "rebase-abort",
  "rebase-continue",
  "cherry-pick",
  "cherry-pick-continue",
  "cherry-pick-abort",
  "conflict-mark-resolved",
  "pr-create",
  "pr-update",
  "pr-ready",
  "pr-review",
  "pr-merge",
  "pr-close",
  "pr-reopen",
]);

function validateGitToken(
  value: unknown,
  label: string,
  maximumLength = 255,
): string {
  if (
    typeof value !== "string" ||
    !value ||
    value !== value.trim() ||
    value.length > maximumLength ||
    value.startsWith("-") ||
    hasControlCharacters(value)
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return value;
}

function validateGitPaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) {
    throw new Error("Repository operations require between 1 and 500 paths.");
  }
  const paths = value.map(validateSensitiveWorkspacePath);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Repository operation paths must be unique.");
  }
  return paths;
}

function validateGitPatch(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 240_000 ||
    value.includes("\0")
  ) {
    throw new Error("A bounded unified Git patch is required.");
  }
  return value;
}

function validateRepositoryText(
  value: unknown,
  label: string,
  maximumLength: number,
  options?: { allowEmpty?: boolean },
): string {
  if (
    typeof value !== "string" ||
    (!options?.allowEmpty && !value.trim()) ||
    value.length > maximumLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} is not valid.`);
  }
  return options?.allowEmpty ? value : value.trim();
}

export function validateRepositoryMutationRequest(
  value: unknown,
): RepositoryMutationRequest {
  if (!isRecord(value) || !REPOSITORY_MUTATION_TYPES.has(value.type as never)) {
    throw new Error("A supported repository operation is required.");
  }
  const type = value.type as RepositoryMutationRequest["type"];
  switch (type) {
    case "stage":
    case "unstage":
    case "discard":
    case "discard-untracked":
    case "conflict-mark-resolved":
      return { type, paths: validateGitPaths(value.paths) };
    case "stage-hunk":
    case "unstage-hunk":
    case "discard-hunk":
      return { type, patch: validateGitPatch(value.patch) };
    case "commit": {
      if (
        typeof value.message !== "string" ||
        !value.message.trim() ||
        value.message.length > 20_000 ||
        value.message.includes("\0")
      ) {
        throw new Error("A commit message is required.");
      }
      return {
        type,
        message: value.message.trim(),
        amend: value.amend === true,
      };
    }
    case "fetch": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      return remote ? { type, remote } : { type };
    }
    case "pull": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
      };
    }
    case "push": {
      const remote =
        value.remote === undefined
          ? undefined
          : validateGitToken(value.remote, "Remote");
      const branch =
        value.branch === undefined
          ? undefined
          : validateGitToken(value.branch, "Branch");
      return {
        type,
        ...(remote ? { remote } : {}),
        ...(branch ? { branch } : {}),
        setUpstream: value.setUpstream === true,
      };
    }
    case "branch-create": {
      const branch = validateGitToken(value.branch, "Branch");
      const startPoint =
        value.startPoint === undefined
          ? undefined
          : validateGitToken(value.startPoint, "Start point");
      return {
        type,
        branch,
        ...(startPoint ? { startPoint } : {}),
        checkout: value.checkout === true,
      };
    }
    case "branch-switch":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "merge":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        noFf: value.noFf === true,
      };
    case "rebase":
      return { type, branch: validateGitToken(value.branch, "Branch") };
    case "cherry-pick":
      return {
        type,
        commit: validateGitToken(value.commit, "Commit reference"),
      };
    case "branch-delete":
      return {
        type,
        branch: validateGitToken(value.branch, "Branch"),
        force: value.force === true,
      };
    case "stash-create": {
      const message =
        value.message === undefined
          ? undefined
          : validateGitToken(value.message, "Stash message", 2_000);
      return {
        type,
        ...(message ? { message } : {}),
        includeUntracked: value.includeUntracked === true,
      };
    }
    case "stash-apply":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "stash-pop": {
      const reference =
        value.reference === undefined
          ? undefined
          : validateGitToken(value.reference, "Stash reference");
      return reference ? { type, reference } : { type };
    }
    case "stash-drop":
      return {
        type,
        reference: validateGitToken(value.reference, "Stash reference"),
      };
    case "worktree-remove":
      return {
        type,
        path: validateGitToken(
          value.path,
          "Canonical worktree path",
          MAX_WORKSPACE_PATH_LENGTH,
        ),
        force: value.force === true,
      };
    case "remote-add":
    case "remote-set-url":
      return {
        type,
        name: validateGitToken(value.name, "Remote"),
        url: validateGitToken(value.url, "Remote URL", 2_048),
      };
    case "remote-remove":
      return { type, name: validateGitToken(value.name, "Remote") };
    case "pr-create": {
      const title = validateRepositoryText(
        value.title,
        "Pull request title",
        500,
      );
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      return {
        type,
        title,
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
        draft: value.draft === true,
      };
    }
    case "pr-update": {
      const title =
        value.title === undefined
          ? undefined
          : validateRepositoryText(value.title, "Pull request title", 500);
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Pull request body", 50_000, {
              allowEmpty: true,
            });
      const base =
        value.base === undefined
          ? undefined
          : validateGitToken(value.base, "Base branch");
      if (title === undefined && body === undefined && base === undefined) {
        throw new Error("At least one pull request field must be updated.");
      }
      return {
        type,
        ...(title ? { title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(base ? { base } : {}),
      };
    }
    case "pr-review": {
      const event = value.event;
      if (
        event !== "approve" &&
        event !== "request-changes" &&
        event !== "comment"
      ) {
        throw new Error("Pull request review event is not valid.");
      }
      const body =
        value.body === undefined
          ? undefined
          : validateRepositoryText(value.body, "Review body", 20_000);
      if (event !== "approve" && !body) {
        throw new Error("A review body is required for this review event.");
      }
      return { type, event, ...(body ? { body } : {}) };
    }
    case "pr-merge": {
      const method = value.method;
      if (method !== "merge" && method !== "squash" && method !== "rebase") {
        throw new Error("Pull request merge method is not valid.");
      }
      return { type, method, deleteBranch: value.deleteBranch === true };
    }
    case "pr-close":
      return { type, deleteBranch: value.deleteBranch === true };
    case "stage-all":
    case "unstage-all":
    case "worktree-prune":
    case "merge-abort":
    case "rebase-abort":
    case "rebase-continue":
    case "cherry-pick-continue":
    case "cherry-pick-abort":
    case "pr-ready":
    case "pr-reopen":
      return { type };
  }
}

export function repositoryMutationConfirmation(
  request: RepositoryMutationRequest,
): Omit<SensitiveActionConfirmationRequest, "kind"> {
  const target =
    "paths" in request
      ? request.paths.slice(0, 3).join(", ") +
        (request.paths.length > 3
          ? ` and ${request.paths.length - 3} more`
          : "")
      : "branch" in request
        ? request.branch
        : "reference" in request && request.reference
          ? request.reference
          : "name" in request
            ? request.name
            : request.type;
  const destructive = new Set([
    "discard",
    "discard-untracked",
    "discard-hunk",
    "branch-delete",
    "stash-drop",
    "worktree-remove",
    "merge-abort",
    "rebase-abort",
    "remote-remove",
    "merge",
    "rebase",
    "cherry-pick",
    "pr-merge",
    "pr-close",
  ]).has(request.type);
  const remote =
    ["fetch", "pull", "push"].includes(request.type) ||
    request.type.startsWith("pr-");
  return {
    title: destructive
      ? "Confirm destructive Git operation"
      : remote
        ? "Confirm remote Git operation"
        : "Confirm Git operation",
    message: `${request.type.replaceAll("-", " ")}: ${target}`,
    detail: destructive
      ? "This operation can remove or overwrite local repository state. Review the exact target before continuing."
      : remote
        ? "This operation contacts the configured Git remote and may change local or remote branch state."
        : "Doolittle will run this typed Git operation in the selected repository.",
    confirmLabel: destructive ? "Continue" : "Run operation",
  };
}

async function parseSuccessfulJson(response: Response): Promise<unknown> {
  const text = await readBoundedResponseText(
    response,
    MAX_SENSITIVE_RESPONSE_BYTES,
  );
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The local runtime returned an invalid response.");
  }
}

interface ActiveChat {
  controller: AbortController;
}

interface ActiveTerminalRun {
  controller: AbortController;
}

export interface WorkspaceIpcController {
  getState(): WorkspaceState;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace?(path: string): Promise<WorkspacePickResult>;
  switchWorkspace(path: string): Promise<WorkspacePickResult>;
  subscribe(listener: (state: WorkspaceState) => void): () => void;
}

function chatKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
}

function terminalKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
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

function assertChatRequest(
  request: ChatRequest,
): asserts request is ChatRequest & {
  requestId: string;
  message: string;
  roomId: string;
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

async function showSensitiveActionConfirmation(
  getMainWindow: () => BrowserWindow | null,
  request: SensitiveActionConfirmationRequest,
): Promise<boolean> {
  // Keep this load lazy so the validation helpers remain runnable outside the
  // Electron process in unit tests.
  const { dialog: nativeDialog } = await import("electron");
  if (!nativeDialog) {
    throw new Error("The native confirmation dialog is unavailable.");
  }
  const options = {
    type: "warning" as const,
    title: request.title,
    message: request.message,
    detail: request.detail,
    buttons: [request.confirmLabel, "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const mainWindow = getMainWindow();
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await nativeDialog.showMessageBox(mainWindow, options)
      : await nativeDialog.showMessageBox(options);
  return result.response === 0;
}

export function registerIpc(dependencies: RegisterIpcDependencies): () => void {
  const {
    ipcMain,
    backend,
    getMainWindow,
    pickFiles,
    workspace,
    sensitiveActionDependencies = {},
    pickChatAttachments = async () => ({ canceled: true, attachments: [] }),
    pickProjectFiles = async () => ({
      canceled: true,
      kind: "file" as const,
      paths: [],
    }),
    pickProjectFolders = async () => ({
      canceled: true,
      kind: "folder" as const,
      paths: [],
    }),
    importRecordedAudio,
    desktopControls,
  } = dependencies;
  const { event: eventChannels, invoke: invokeChannels } = desktopIpcChannels;
  const authorizeSender =
    dependencies.authorizeSender ??
    ((event: IpcMainInvokeEvent) =>
      isTrustedDesktopIpcSender(event, getMainWindow()));
  const activeChats = new Map<string, ActiveChat>();
  const activeTerminalRuns = new Map<string, ActiveTerminalRun>();
  const registeredChannels = new Set<DesktopIpcInvokeChannel>();
  const registerHandler = (
    channel: DesktopIpcInvokeChannel,
    handler: Parameters<IpcMain["handle"]>[1],
  ) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!authorizeSender(event)) {
        throw new Error(
          "Rejected desktop IPC request from an untrusted sender.",
        );
      }
      return handler(event, ...args);
    });
    registeredChannels.add(channel);
  };
  let disposeDesktopControls: (() => void) | undefined;
  const confirmSensitiveAction =
    sensitiveActionDependencies.confirm ??
    ((request: SensitiveActionConfirmationRequest) =>
      showSensitiveActionConfirmation(getMainWindow, request));
  const sensitiveFetch = sensitiveActionDependencies.fetch ?? fetch;
  const notify = sensitiveActionDependencies.notify ?? (() => undefined);
  const notifyBackground = (notification: DesktopBackgroundNotification) => {
    try {
      notify(notification);
    } catch {
      // OS notification failures are non-critical and must never turn a
      // successful agent or terminal result into a failed desktop request.
    }
  };
  const validateProviderAuthProvider = (
    provider: unknown,
  ): ProviderAuthProvider => {
    if (provider === "codex" || provider === "claude-code") return provider;
    throw new Error("Provider sign in is only available for Codex and Claude.");
  };
  const validateProviderAuthStartOptions = (
    value: unknown,
  ): ProviderAuthStartOptions => {
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
  };
  const requestInteractiveTerminal = async (
    path:
      | "/terminal/session/start"
      | "/terminal/session/input"
      | "/terminal/session/resize"
      | "/terminal/session/interrupt"
      | "/terminal/session/close"
      | `/terminal/session/output?${string}`,
    method: "GET" | "POST",
    body?: object,
  ): Promise<unknown> => {
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }
    const response = await sensitiveFetch(`${state.url}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Interactive terminal request failed: ${(
          await parseRequestError(response)
        ).trim()}`,
      );
    }
    return parseSuccessfulJson(response);
  };

  const emitBackendState = () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        eventChannels.backendState,
        backend.getState(),
      );
    }
  };
  const unsubscribeBackend = backend.subscribe(emitBackendState);
  const emitWorkspaceState = (state: WorkspaceState) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(eventChannels.workspaceState, state);
    }
  };
  const unsubscribeWorkspace = workspace.subscribe(emitWorkspaceState);

  registerHandler(invokeChannels.backendGetState, () => backend.getState());
  registerHandler(invokeChannels.backendRetry, () => backend.restart());
  registerHandler(invokeChannels.workspaceGetState, () => workspace.getState());
  registerHandler(invokeChannels.workspacePick, () =>
    workspace.pickWorkspace(),
  );
  registerHandler(invokeChannels.workspaceOpen, (_event, path: unknown) => {
    if (typeof path !== "string" || path.length > MAX_WORKSPACE_PATH_LENGTH) {
      throw new Error("A valid workspace path is required.");
    }
    if (!workspace.openWorkspace) {
      throw new Error("Opening a workspace path is unavailable.");
    }
    return workspace.openWorkspace(path);
  });
  registerHandler(
    invokeChannels.workspaceSwitchRecent,
    (_event, path: unknown) => {
      if (typeof path !== "string" || path.length > MAX_WORKSPACE_PATH_LENGTH) {
        throw new Error("A valid recent workspace path is required.");
      }
      return workspace.switchWorkspace(path);
    },
  );
  if (desktopControls) {
    const emitUpdateState = (state: DesktopUpdateState) => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send(eventChannels.updateState, state);
    };
    const unsubscribeUpdates =
      desktopControls.updates.subscribe(emitUpdateState);
    registerHandler(
      invokeChannels.desktopLifecycleState,
      desktopControls.getLifecycleState,
    );
    registerHandler(
      invokeChannels.desktopSetBackgroundMode,
      (_event, enabled: unknown) => {
        if (typeof enabled !== "boolean")
          throw new Error("Background mode must be a boolean.");
        return desktopControls.setKeepRunningInBackground(enabled);
      },
    );
    registerHandler(
      invokeChannels.updateGetState,
      desktopControls.updates.getState,
    );
    registerHandler(invokeChannels.updateCheck, () =>
      desktopControls.updates.check(),
    );
    registerHandler(invokeChannels.updateDownload, () =>
      desktopControls.updates.download(),
    );
    registerHandler(invokeChannels.updateInstall, () =>
      desktopControls.updates.install(),
    );
    const originalDispose = unsubscribeUpdates;
    // Keep the unsubscribe reachable from the shared disposer below.
    const existingDispose = disposeDesktopControls;
    disposeDesktopControls = () => {
      existingDispose?.();
      originalDispose();
    };
  }
  registerHandler(invokeChannels.dialogPickFiles, pickFiles);
  registerHandler(invokeChannels.dialogPickProjectFiles, pickProjectFiles);
  registerHandler(invokeChannels.dialogPickProjectFolders, pickProjectFolders);
  registerHandler(
    invokeChannels.dialogPickChatAttachments,
    pickChatAttachments,
  );
  registerHandler(
    invokeChannels.chatImportRecordedAudio,
    (_event, request: RecordedAudioImportRequest) => {
      if (!importRecordedAudio) {
        throw new Error("Recorded audio import is unavailable.");
      }
      return importRecordedAudio(request);
    },
  );
  registerHandler(
    invokeChannels.terminalRunConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: DesktopCommandRequest,
    ): Promise<DesktopCommandResult> => {
      const request = validateDesktopCommandRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "command",
        title: "Run command in this workspace?",
        message: request.command,
        detail: `Doolittle will run this command in the selected workspace. It will stop after at most ${Math.round(
          request.timeoutMs / 1_000,
        )} seconds.`,
        confirmLabel: "Run command",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/terminal/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(request.timeoutMs + 5_000),
      });
      if (!response.ok) {
        throw new Error(
          `Command failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      return {
        status: "completed",
        result: isRecord(payload) ? payload.result : payload,
      };
    },
  );
  registerHandler(
    invokeChannels.terminalStreamStart,
    async (event: IpcMainInvokeEvent, unsafeRequest: TerminalStreamRequest) => {
      const request = validateTerminalStreamRequest(unsafeRequest);
      const key = terminalKey(event, request.requestId);
      if (activeTerminalRuns.has(key)) {
        throw new Error("This terminal request is already running.");
      }

      const emitEvent = (payload: { event: string; data: unknown }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(eventChannels.terminalEvent, {
            requestId: request.requestId,
            ...payload,
          });
        }
      };
      const controller = new AbortController();
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        activeTerminalRuns.delete(key);
        event.sender.removeListener("destroyed", cleanup);
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };
      activeTerminalRuns.set(key, { controller });
      event.sender.once("destroyed", cleanup);

      try {
        const confirmed = await confirmSensitiveAction({
          kind: "command",
          title: "Run command in this workspace?",
          message: request.command,
          detail: `Doolittle will stream this command from the selected workspace. You can stop it at any time, and it will stop automatically after at most ${Math.round(
            request.timeoutMs / 1_000,
          )} seconds.`,
          confirmLabel: "Run command",
        });
        if (!confirmed || controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: {
              reason: controller.signal.aborted
                ? "Command stopped before it started."
                : "Command was cancelled before it started.",
            },
          });
          return;
        }

        const state = backend.getState();
        if (state.phase !== "ready" || !state.url) {
          throw new Error("The local runtime is not ready.");
        }
        const response = await sensitiveFetch(
          `${state.url}/terminal/run/stream`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              command: request.command,
              timeoutMs: request.timeoutMs,
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(
            `Command failed: ${(await parseRequestError(response)).trim()}`,
          );
        }
        if (!response.body) {
          throw new Error("The runtime returned an empty terminal stream.");
        }

        const parser = new SseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = decoder.decode(result.value, { stream: true });
          for (const eventMessage of parser.push(chunk)) {
            emitEvent(eventMessage);
            if (eventMessage.event === "terminal.completed") {
              notifyBackground({
                title: "Command complete",
                body: "Your terminal task finished in Doolittle.",
              });
            }
          }
        }
        for (const eventMessage of parser.finish()) {
          emitEvent(eventMessage);
          if (eventMessage.event === "terminal.completed") {
            notifyBackground({
              title: "Command complete",
              body: "Your terminal task finished in Doolittle.",
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: { reason: "Command stopped by the operator." },
          });
        } else {
          emitEvent({
            event: "error",
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          notifyBackground({
            title: "Command needs attention",
            body: "A terminal task stopped with an error in Doolittle.",
          });
          throw error;
        }
      } finally {
        cleanup();
      }
    },
  );
  registerHandler(
    invokeChannels.terminalStreamCancel,
    (event: IpcMainInvokeEvent, requestId: string) => {
      const validated = validateTerminalRequestId(requestId);
      const active = activeTerminalRuns.get(terminalKey(event, validated));
      active?.controller.abort();
    },
  );
  registerHandler(
    invokeChannels.terminalSessionStartConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalStartRequest,
    ): Promise<InteractiveTerminalStartResult> => {
      const request = validateInteractiveTerminalStartRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "terminal-session",
        title: "Open an interactive terminal?",
        message: "Workspace shell",
        detail:
          "Doolittle will open a real local pseudo-terminal in the selected workspace. Commands you type will run until you close the session.",
        confirmLabel: "Open terminal",
      });
      if (!confirmed) return { status: "cancelled" };
      const payload = await requestInteractiveTerminal(
        "/terminal/session/start",
        "POST",
        request,
      );
      if (!isRecord(payload) || !isRecord(payload.session)) {
        throw new Error("The runtime returned an invalid terminal session.");
      }
      return {
        status: "started",
        session: validateInteractiveTerminalSession(payload.session),
      };
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalInputRequest,
    ) => {
      const request = validateInteractiveTerminalInputRequest(unsafeRequest);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/input",
        "POST",
        request,
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionResize,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalResizeRequest,
    ) => {
      const request = validateInteractiveTerminalResizeRequest(unsafeRequest);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/resize",
        "POST",
        request,
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInterrupt,
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/interrupt",
        "POST",
        { sessionId },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionClose,
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/close",
        "POST",
        { sessionId },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionOutput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeCursor: number,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const cursor =
        typeof unsafeCursor === "number" &&
        Number.isSafeInteger(unsafeCursor) &&
        unsafeCursor >= 0
          ? unsafeCursor
          : 0;
      return requestInteractiveTerminal(
        `/terminal/session/output?sessionId=${encodeURIComponent(
          sessionId,
        )}&cursor=${cursor}`,
        "GET",
      ).then(validateInteractiveTerminalOutput);
    },
  );
  registerHandler(
    invokeChannels.providerAuthStart,
    (
      _event: IpcMainInvokeEvent,
      unsafeProvider: unknown,
      unsafeOptions: unknown,
    ) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.start(
        validateProviderAuthProvider(unsafeProvider),
        validateProviderAuthStartOptions(unsafeOptions),
      );
    },
  );
  registerHandler(
    invokeChannels.providerAuthState,
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.getState(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  registerHandler(
    invokeChannels.providerAuthSubmitCode,
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.submitCodeFromClipboard(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  registerHandler(
    invokeChannels.providerAuthCancel,
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.cancel(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  registerHandler(
    invokeChannels.providerAuthAcknowledge,
    (_event: IpcMainInvokeEvent, unsafeProvider: unknown) => {
      if (!desktopControls?.providerAuth) {
        throw new Error("Provider sign in is unavailable in this build.");
      }
      return desktopControls.providerAuth.acknowledge(
        validateProviderAuthProvider(unsafeProvider),
      );
    },
  );
  registerHandler(
    invokeChannels.editorProjectContext,
    (
      _event: IpcMainInvokeEvent,
      request: EditorProjectContextRequest,
    ): EditorProjectContextResult => resolveEditorProjectContext(request),
  );
  registerHandler(
    invokeChannels.workspaceSaveConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: WorkspaceFileSaveRequest,
    ): Promise<WorkspaceFileSaveResult> => {
      const request = validateWorkspaceFileSaveRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "workspace-write",
        title: "Save workspace file?",
        message: request.path,
        detail: `Doolittle will write ${new TextEncoder()
          .encode(request.content)
          .byteLength.toLocaleString()} bytes. The save will stop if the file changed after you opened it.`,
        confirmLabel: "Save changes",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/workspace/write`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (response.status === 409) {
        return {
          status: "conflict",
          message: (await parseRequestError(response)).trim(),
        };
      }
      if (!response.ok) {
        throw new Error(
          `Save failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const savedPath = isRecord(payload) ? payload.path : undefined;
      if (typeof savedPath !== "string" || !savedPath) {
        throw new Error("The local runtime did not confirm the saved path.");
      }
      return { status: "saved", path: savedPath };
    },
  );
  registerHandler(
    invokeChannels.repositoryCreateWorktreeConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: RepositoryWorktreeCreateRequest,
    ): Promise<RepositoryWorktreeCreateResult> => {
      const request = validateWorktreeCreateRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "worktree-create",
        title: "Create Git worktree?",
        message: request.branch,
        detail: `Doolittle will create a new branch and worktree at ${request.path}, inside the selected workspace.`,
        confirmLabel: "Create worktree",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(
        `${state.url}/repo/worktrees/create`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(
          `Worktree creation failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const worktree = isRecord(payload) ? payload.worktree : undefined;
      if (
        !isRecord(worktree) ||
        typeof worktree.path !== "string" ||
        !worktree.path ||
        typeof worktree.detached !== "boolean" ||
        typeof worktree.bare !== "boolean" ||
        typeof worktree.prunable !== "boolean"
      ) {
        throw new Error("The local runtime did not confirm the new worktree.");
      }
      const confirmedWorktree: RepositoryWorktree = {
        path: worktree.path,
        detached: worktree.detached,
        bare: worktree.bare,
        prunable: worktree.prunable,
      };
      if (typeof worktree.head === "string") {
        confirmedWorktree.head = worktree.head;
      }
      if (typeof worktree.branch === "string") {
        confirmedWorktree.branch = worktree.branch;
      }
      return {
        status: "created",
        worktree: confirmedWorktree,
      };
    },
  );
  registerHandler(
    invokeChannels.repositoryMutateConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: RepositoryMutationRequest,
    ): Promise<RepositoryMutationDesktopResult> => {
      const request = validateRepositoryMutationRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "repository-mutation",
        ...repositoryMutationConfirmation(request),
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/repo/mutate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(MAX_COMMAND_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Git operation failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(response);
      const result = isRecord(payload) ? payload.result : undefined;
      if (
        !isRecord(result) ||
        result.type !== request.type ||
        typeof result.ok !== "boolean" ||
        typeof result.summary !== "string" ||
        typeof result.stdout !== "string" ||
        typeof result.stderr !== "string" ||
        typeof result.exitCode !== "number"
      ) {
        throw new Error("The local runtime returned an invalid Git result.");
      }
      const validatedResult: RepositoryMutationResult = {
        type: request.type,
        ok: result.ok,
        summary: result.summary,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
      if (typeof result.error === "string") {
        validatedResult.error = result.error;
      }
      return { status: "completed", result: validatedResult };
    },
  );
  registerHandler(
    invokeChannels.agentRequest,
    (_event: IpcMainInvokeEvent, unsafeRequest: unknown) =>
      requestAgentTransport(backend, sensitiveFetch, unsafeRequest),
  );

  registerHandler(
    invokeChannels.chatStart,
    async (event, request: ChatRequest) => {
      assertChatRequest(request);
      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }

      const key = chatKey(event, request.requestId);
      if (activeChats.has(key)) {
        throw new Error("This chat request is already running.");
      }

      const controller = new AbortController();
      const emitEvent = (payload: { event: string; data: unknown }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(eventChannels.chatEvent, {
            requestId: request.requestId,
            ...payload,
          });
        }
      };
      const cleanup = () => {
        activeChats.delete(key);
        event.sender.removeListener("destroyed", cleanup);
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };
      activeChats.set(key, { controller });
      event.sender.once("destroyed", cleanup);

      try {
        const response = await sensitiveFetch(`${state.url}/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: request.message.trim(),
            roomId: request.roomId,
            runId: request.requestId,
            userId: "desktop-user",
            source: "desktop",
            stream: true,
            projectId: request.projectId,
            attachmentIds: validateChatAttachmentIds(request.attachmentIds),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await parseRequestError(response));
        }
        if (!response.body) {
          throw new Error("The runtime returned an empty stream.");
        }

        const parser = new SseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = decoder.decode(result.value, { stream: true });
          for (const eventMessage of parser.push(chunk)) {
            emitEvent(eventMessage);
            if (eventMessage.event === "response.completed") {
              notifyBackground({
                title: "Doolittle is ready",
                body: "Your response is ready.",
              });
            }
          }
        }
        for (const eventMessage of parser.finish()) {
          emitEvent(eventMessage);
          if (eventMessage.event === "response.completed") {
            notifyBackground({
              title: "Doolittle is ready",
              body: "Your response is ready.",
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          emitEvent({ event: "cancelled", data: null });
        } else {
          emitEvent({
            event: "error",
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          notifyBackground({
            title: "Doolittle needs attention",
            body: "A response stopped with an error.",
          });
          throw error;
        }
      } finally {
        cleanup();
      }
    },
  );

  registerHandler(
    invokeChannels.chatCancel,
    async (event, requestId: string) => {
      const active = activeChats.get(chatKey(event, requestId));
      if (!active) return;
      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      // Request server-side cancellation before closing the renderer stream. This
      // is what reaches the provider/tool abort signal; aborting fetch alone is
      // only a local transport teardown.
      const response = await sensitiveFetch(
        `${state.url}/chat/runs/${encodeURIComponent(requestId)}/cancel`,
        {
          method: "POST",
          signal: AbortSignal.timeout(API_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(await parseRequestError(response));
      }
      const payload = await parseSuccessfulJson(response);
      const run =
        isRecord(payload) && isRecord(payload.run) ? payload.run : undefined;
      if (run && !event.sender.isDestroyed()) {
        event.sender.send(eventChannels.chatEvent, {
          requestId,
          event: "agent.run",
          data: { type: "cancelled", sessionId: run.sessionId, run },
        });
      }
      active.controller.abort();
    },
  );

  return () => {
    unsubscribeBackend();
    unsubscribeWorkspace();
    disposeDesktopControls?.();
    desktopControls?.providerAuth?.dispose();
    for (const active of activeChats.values()) {
      active.controller.abort();
    }
    activeChats.clear();
    for (const active of activeTerminalRuns.values()) {
      active.controller.abort();
    }
    activeTerminalRuns.clear();
    for (const channel of registeredChannels) {
      ipcMain.removeHandler(channel);
    }
  };
}
