import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentTransportRequest,
  BackendState,
  ChatEvent,
  ChatRequest,
  DesktopCommand,
  DesktopCommandRequest,
  DesktopUpdateState,
  DoolittleDesktopBridge,
  EditorProjectContextRequest,
  InteractiveTerminalInputRequest,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalStartRequest,
  ProviderAuthProvider,
  ProviderAuthStartOptions,
  RecordedAudioImportRequest,
  RepositoryMutationRequest,
  RepositoryWorktreeCreateRequest,
  TerminalStreamEvent,
  TerminalStreamRequest,
  WorkspaceFileSaveRequest,
  WorkspaceState,
} from "../shared/contracts";
import {
  type DesktopIpcEventChannel,
  desktopIpcChannels,
} from "../shared/ipc-channels";

function subscribeToDesktopEvent<T>(
  channel: DesktopIpcEventChannel,
  listener: (value: T) => void,
): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, value: T) =>
    listener(value);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const platform = process.platform;
if (platform !== "darwin" && platform !== "linux" && platform !== "win32") {
  throw new Error(`Unsupported Electron desktop platform: ${platform}`);
}

const bridge: DoolittleDesktopBridge = {
  platform,
  getBackendState: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.backendGetState),
  retryBackend: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.backendRetry),
  onBackendState: (listener) =>
    subscribeToDesktopEvent<BackendState>(
      desktopIpcChannels.event.backendState,
      listener,
    ),
  getWorkspaceState: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.workspaceGetState),
  pickWorkspace: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.workspacePick),
  openWorkspace: (path) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.workspaceOpen, path),
  switchWorkspace: (path) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.workspaceSwitchRecent, path),
  onWorkspaceState: (listener) =>
    subscribeToDesktopEvent<WorkspaceState>(
      desktopIpcChannels.event.workspaceState,
      listener,
    ),
  onAppCommand: (listener) =>
    subscribeToDesktopEvent<DesktopCommand>(
      desktopIpcChannels.event.appCommand,
      listener,
    ),
  getLifecycleState: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.desktopLifecycleState),
  setKeepRunningInBackground: (enabled) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.desktopSetBackgroundMode,
      enabled,
    ),
  getUpdateState: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.updateGetState),
  checkForUpdates: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.updateCheck),
  downloadUpdate: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.updateDownload),
  installUpdate: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.updateInstall),
  onUpdateState: (listener) =>
    subscribeToDesktopEvent<DesktopUpdateState>(
      desktopIpcChannels.event.updateState,
      listener,
    ),
  pickFiles: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.dialogPickFiles),
  pickProjectFiles: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.dialogPickProjectFiles),
  pickProjectFolders: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.dialogPickProjectFolders),
  pickChatAttachments: () =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.dialogPickChatAttachments),
  importRecordedAudio: (request: RecordedAudioImportRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.chatImportRecordedAudio,
      request,
    ),
  startProviderAuth: (
    provider: ProviderAuthProvider,
    options?: ProviderAuthStartOptions,
  ) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.providerAuthStart,
      provider,
      options,
    ),
  getProviderAuthState: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.providerAuthState, provider),
  submitProviderAuthCode: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.providerAuthSubmitCode,
      provider,
    ),
  cancelProviderAuth: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.providerAuthCancel, provider),
  acknowledgeProviderAuth: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.providerAuthAcknowledge,
      provider,
    ),
  requestAgent: (request: AgentTransportRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.agentRequest, request),
  runCommand: (request: DesktopCommandRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.terminalRunConfirmed, request),
  startTerminalRun: (request: TerminalStreamRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.terminalStreamStart, request),
  cancelTerminalRun: (requestId: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.terminalStreamCancel,
      requestId,
    ),
  onTerminalEvent: (listener) =>
    subscribeToDesktopEvent<TerminalStreamEvent>(
      desktopIpcChannels.event.terminalEvent,
      listener,
    ),
  startInteractiveTerminal: (request: InteractiveTerminalStartRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.terminalSessionStart, request),
  writeInteractiveTerminal: (request: InteractiveTerminalInputRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.terminalSessionInput, request),
  resizeInteractiveTerminal: (request: InteractiveTerminalResizeRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.terminalSessionResize,
      request,
    ),
  interruptInteractiveTerminal: (sessionId: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.terminalSessionInterrupt,
      sessionId,
    ),
  closeInteractiveTerminal: (sessionId: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.terminalSessionClose,
      sessionId,
    ),
  getInteractiveTerminalOutput: (sessionId: string, cursor: number) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.terminalSessionOutput,
      sessionId,
      cursor,
    ),
  getEditorProjectContext: (request: EditorProjectContextRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.editorProjectContext, request),
  saveWorkspaceFile: (request: WorkspaceFileSaveRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.workspaceSaveConfirmed,
      request,
    ),
  createWorktree: (request: RepositoryWorktreeCreateRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.repositoryCreateWorktreeConfirmed,
      request,
    ),
  mutateRepository: (request: RepositoryMutationRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.repositoryMutateConfirmed,
      request,
    ),
  startChat: (request: ChatRequest) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.chatStart, request),
  cancelChat: (requestId: string) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.chatCancel, requestId),
  onChatEvent: (listener) =>
    subscribeToDesktopEvent<ChatEvent>(
      desktopIpcChannels.event.chatEvent,
      listener,
    ),
};

contextBridge.exposeInMainWorld("doolittle", bridge);
