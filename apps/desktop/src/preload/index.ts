import type { UiHostEvent } from "@doolittle/contracts/ui-host";
import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentTransportRequest,
  BackendState,
  ChatEvent,
  ChatRequest,
  ChatRunSubscription,
  DesktopCommand,
  DesktopCommandRequest,
  DesktopUpdateState,
  DoolittleDesktopBridge,
  EditorProjectContextRequest,
  EditorProjectRevisionRequest,
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
import {
  type UiInterfaceState,
  uiInterfaceChannels,
} from "../shared/ui-interface";

function subscribeToDesktopEvent<T>(
  channel:
    | DesktopIpcEventChannel
    | (typeof uiInterfaceChannels)[keyof typeof uiInterfaceChannels],
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
  ui: {
    getSnapshot: () => ipcRenderer.invoke(uiInterfaceChannels.snapshot),
    dispatch: (command) =>
      ipcRenderer.invoke(uiInterfaceChannels.dispatch, command),
    subscribe: (id, after) =>
      ipcRenderer.invoke(uiInterfaceChannels.subscribe, id, after),
    unsubscribe: (id) =>
      ipcRenderer.invoke(uiInterfaceChannels.unsubscribe, id),
    onEvent: (listener) =>
      subscribeToDesktopEvent<{ subscriptionId: string; value: UiHostEvent }>(
        uiInterfaceChannels.event,
        listener,
      ),
    getState: () => ipcRenderer.invoke(uiInterfaceChannels.state),
    onState: (listener) =>
      subscribeToDesktopEvent<UiInterfaceState>(
        uiInterfaceChannels.stateChanged,
        listener,
      ),
    install: () => ipcRenderer.invoke(uiInterfaceChannels.install),
    activate: (request) =>
      ipcRenderer.invoke(uiInterfaceChannels.activate, request),
    restore: () => ipcRenderer.invoke(uiInterfaceChannels.restore),
    revoke: (identity) =>
      ipcRenderer.invoke(uiInterfaceChannels.revoke, identity),
    stopAll: () => ipcRenderer.invoke(uiInterfaceChannels.stopAll),
    onSurface: (listener) =>
      subscribeToDesktopEvent(uiInterfaceChannels.surface, listener),
  },
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
  pickChatAttachments: (botId?: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.dialogPickChatAttachments,
      botId,
    ),
  discardChatAttachments: (request) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.chatDiscardAttachments,
      request,
    ),
  commitChatAttachments: (request) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.chatCommitAttachments,
      request,
    ),
  importRecordedAudio: (request: RecordedAudioImportRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.chatImportRecordedAudio,
      request,
    ),
  discardRecordedAudio: (recordingId: string, botId?: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.chatDiscardRecordedAudio,
      recordingId,
      botId,
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
  cancelAgentRequest: (requestId: string, botId?: string) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.agentRequestCancel,
      requestId,
      botId,
    ),
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
  getEditorProjectRevision: (request: EditorProjectRevisionRequest) =>
    ipcRenderer.invoke(
      desktopIpcChannels.invoke.editorProjectRevision,
      request,
    ),
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
  subscribeChat: (request: ChatRunSubscription) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.chatSubscribe, request),
  cancelChat: (requestId: string, botId?: string) =>
    ipcRenderer.invoke(desktopIpcChannels.invoke.chatCancel, requestId, botId),
  onChatEvent: (listener) =>
    subscribeToDesktopEvent<ChatEvent>(
      desktopIpcChannels.event.chatEvent,
      listener,
    ),
};

contextBridge.exposeInMainWorld("doolittle", bridge);
