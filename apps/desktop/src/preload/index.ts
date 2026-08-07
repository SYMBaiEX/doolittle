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

const bridge: DoolittleDesktopBridge = {
  platform: process.platform as DoolittleDesktopBridge["platform"],
  getBackendState: () => ipcRenderer.invoke("backend:get-state"),
  retryBackend: () => ipcRenderer.invoke("backend:retry"),
  onBackendState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: BackendState) =>
      listener(state);
    ipcRenderer.on("backend:state", wrapped);
    return () => ipcRenderer.removeListener("backend:state", wrapped);
  },
  getWorkspaceState: () => ipcRenderer.invoke("workspace:get-state"),
  pickWorkspace: () => ipcRenderer.invoke("workspace:pick"),
  openWorkspace: (path) => ipcRenderer.invoke("workspace:open", path),
  switchWorkspace: (path) =>
    ipcRenderer.invoke("workspace:switch-recent", path),
  onWorkspaceState: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      state: WorkspaceState,
    ) => listener(state);
    ipcRenderer.on("workspace:state", wrapped);
    return () => ipcRenderer.removeListener("workspace:state", wrapped);
  },
  onAppCommand: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      command: DesktopCommand,
    ) => listener(command);
    ipcRenderer.on("app:command", wrapped);
    return () => ipcRenderer.removeListener("app:command", wrapped);
  },
  getLifecycleState: () => ipcRenderer.invoke("desktop:lifecycle-state"),
  setKeepRunningInBackground: (enabled) =>
    ipcRenderer.invoke("desktop:set-background-mode", enabled),
  getUpdateState: () => ipcRenderer.invoke("update:get-state"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateState: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      state: DesktopUpdateState,
    ) => listener(state);
    ipcRenderer.on("update:state", wrapped);
    return () => ipcRenderer.removeListener("update:state", wrapped);
  },
  pickFiles: () => ipcRenderer.invoke("dialog:pick-files"),
  pickProjectFiles: () => ipcRenderer.invoke("dialog:pick-project-files"),
  pickProjectFolders: () => ipcRenderer.invoke("dialog:pick-project-folders"),
  pickChatAttachments: () => ipcRenderer.invoke("dialog:pick-chat-attachments"),
  importRecordedAudio: (request: RecordedAudioImportRequest) =>
    ipcRenderer.invoke("chat:import-recorded-audio", request),
  startProviderAuth: (
    provider: ProviderAuthProvider,
    options?: ProviderAuthStartOptions,
  ) => ipcRenderer.invoke("provider-auth:start", provider, options),
  getProviderAuthState: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke("provider-auth:state", provider),
  submitProviderAuthCode: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke("provider-auth:submit-code", provider),
  cancelProviderAuth: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke("provider-auth:cancel", provider),
  acknowledgeProviderAuth: (provider: ProviderAuthProvider) =>
    ipcRenderer.invoke("provider-auth:acknowledge", provider),
  requestAgent: (request: AgentTransportRequest) =>
    ipcRenderer.invoke("agent:request", request),
  runCommand: (request: DesktopCommandRequest) =>
    ipcRenderer.invoke("terminal:run-confirmed", request),
  startTerminalRun: (request: TerminalStreamRequest) =>
    ipcRenderer.invoke("terminal:stream-start", request),
  cancelTerminalRun: (requestId: string) =>
    ipcRenderer.invoke("terminal:stream-cancel", requestId),
  onTerminalEvent: (listener) => {
    const wrapped = (
      _event: Electron.IpcRendererEvent,
      terminalEvent: TerminalStreamEvent,
    ) => listener(terminalEvent);
    ipcRenderer.on("terminal:event", wrapped);
    return () => ipcRenderer.removeListener("terminal:event", wrapped);
  },
  startInteractiveTerminal: (request: InteractiveTerminalStartRequest) =>
    ipcRenderer.invoke("terminal:session-start-confirmed", request),
  writeInteractiveTerminal: (request: InteractiveTerminalInputRequest) =>
    ipcRenderer.invoke("terminal:session-input", request),
  resizeInteractiveTerminal: (request: InteractiveTerminalResizeRequest) =>
    ipcRenderer.invoke("terminal:session-resize", request),
  interruptInteractiveTerminal: (sessionId: string) =>
    ipcRenderer.invoke("terminal:session-interrupt", sessionId),
  closeInteractiveTerminal: (sessionId: string) =>
    ipcRenderer.invoke("terminal:session-close", sessionId),
  getInteractiveTerminalOutput: (sessionId: string, cursor: number) =>
    ipcRenderer.invoke("terminal:session-output", sessionId, cursor),
  getEditorProjectContext: (request: EditorProjectContextRequest) =>
    ipcRenderer.invoke("editor:project-context", request),
  saveWorkspaceFile: (request: WorkspaceFileSaveRequest) =>
    ipcRenderer.invoke("workspace:save-confirmed", request),
  createWorktree: (request: RepositoryWorktreeCreateRequest) =>
    ipcRenderer.invoke("repository:create-worktree-confirmed", request),
  mutateRepository: (request: RepositoryMutationRequest) =>
    ipcRenderer.invoke("repository:mutate-confirmed", request),
  startChat: (request: ChatRequest) =>
    ipcRenderer.invoke("chat:start", request),
  cancelChat: (requestId: string) =>
    ipcRenderer.invoke("chat:cancel", requestId),
  onChatEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, chatEvent: ChatEvent) =>
      listener(chatEvent);
    ipcRenderer.on("chat:event", wrapped);
    return () => ipcRenderer.removeListener("chat:event", wrapped);
  },
};

contextBridge.exposeInMainWorld("doolittle", bridge);
