import type { BackendState } from "./backend";
import type {
  AttachmentSelection,
  DesktopCommand,
  DesktopCommandRequest,
  DesktopCommandResult,
  DesktopLifecycleState,
  DesktopUpdateState,
  FileSelection,
  ManagedAttachmentDescriptor,
  ProjectResourceSelection,
  RecordedAudioImportRequest,
  WorkspacePickResult,
  WorkspaceState,
} from "./desktop";
import type {
  EditorProjectContextRequest,
  EditorProjectContextResult,
  WorkspaceFileSaveRequest,
  WorkspaceFileSaveResult,
} from "./editor";
import type {
  RepositoryMutationDesktopResult,
  RepositoryMutationRequest,
  RepositoryWorktreeCreateRequest,
  RepositoryWorktreeCreateResult,
} from "./repository";
import type {
  ProviderAuthProvider,
  ProviderAuthStartOptions,
  ProviderAuthState,
} from "./runtime";
import type {
  InteractiveTerminalInputRequest,
  InteractiveTerminalOutput,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalSession,
  InteractiveTerminalStartRequest,
  InteractiveTerminalStartResult,
  TerminalStreamEvent,
  TerminalStreamRequest,
} from "./terminal";
import type {
  AgentTransportRequest,
  AgentTransportResponse,
  ChatEvent,
  ChatRequest,
} from "./transport";

export interface DoolittleDesktopBridge {
  platform: "darwin" | "win32" | "linux";
  getBackendState(): Promise<BackendState>;
  retryBackend(): Promise<BackendState>;
  onBackendState(listener: (state: BackendState) => void): () => void;
  getWorkspaceState(): Promise<WorkspaceState>;
  pickWorkspace(): Promise<WorkspacePickResult>;
  openWorkspace(path: string): Promise<WorkspacePickResult>;
  switchWorkspace(path: string): Promise<WorkspacePickResult>;
  onWorkspaceState(listener: (state: WorkspaceState) => void): () => void;
  onAppCommand(listener: (command: DesktopCommand) => void): () => void;
  getLifecycleState(): Promise<DesktopLifecycleState>;
  setKeepRunningInBackground(enabled: boolean): Promise<DesktopLifecycleState>;
  getUpdateState(): Promise<DesktopUpdateState>;
  checkForUpdates(): Promise<DesktopUpdateState>;
  downloadUpdate(): Promise<DesktopUpdateState>;
  installUpdate(): Promise<void>;
  onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
  pickFiles(): Promise<FileSelection>;
  pickProjectFiles(): Promise<ProjectResourceSelection>;
  pickProjectFolders(): Promise<ProjectResourceSelection>;
  pickChatAttachments(): Promise<AttachmentSelection>;
  importRecordedAudio(
    request: RecordedAudioImportRequest,
  ): Promise<ManagedAttachmentDescriptor>;
  discardRecordedAudio(recordingId: string): Promise<void>;
  startProviderAuth(
    provider: ProviderAuthProvider,
    options?: ProviderAuthStartOptions,
  ): Promise<ProviderAuthState>;
  getProviderAuthState(
    provider: ProviderAuthProvider,
  ): Promise<ProviderAuthState>;
  submitProviderAuthCode(
    provider: ProviderAuthProvider,
  ): Promise<ProviderAuthState>;
  cancelProviderAuth(
    provider: ProviderAuthProvider,
  ): Promise<ProviderAuthState>;
  acknowledgeProviderAuth(
    provider: ProviderAuthProvider,
  ): Promise<ProviderAuthState>;
  requestAgent(request: AgentTransportRequest): Promise<AgentTransportResponse>;
  cancelAgentRequest(requestId: string): Promise<void>;
  runCommand(request: DesktopCommandRequest): Promise<DesktopCommandResult>;
  startTerminalRun(request: TerminalStreamRequest): Promise<void>;
  cancelTerminalRun(requestId: string): Promise<void>;
  onTerminalEvent(listener: (event: TerminalStreamEvent) => void): () => void;
  startInteractiveTerminal(
    request: InteractiveTerminalStartRequest,
  ): Promise<InteractiveTerminalStartResult>;
  writeInteractiveTerminal(
    request: InteractiveTerminalInputRequest,
  ): Promise<InteractiveTerminalSession>;
  resizeInteractiveTerminal(
    request: InteractiveTerminalResizeRequest,
  ): Promise<InteractiveTerminalSession>;
  interruptInteractiveTerminal(
    sessionId: string,
  ): Promise<InteractiveTerminalSession>;
  closeInteractiveTerminal(
    sessionId: string,
  ): Promise<InteractiveTerminalSession>;
  getInteractiveTerminalOutput(
    sessionId: string,
    cursor: number,
  ): Promise<InteractiveTerminalOutput>;
  getEditorProjectContext(
    request: EditorProjectContextRequest,
  ): Promise<EditorProjectContextResult>;
  saveWorkspaceFile(
    request: WorkspaceFileSaveRequest,
  ): Promise<WorkspaceFileSaveResult>;
  createWorktree(
    request: RepositoryWorktreeCreateRequest,
  ): Promise<RepositoryWorktreeCreateResult>;
  mutateRepository(
    request: RepositoryMutationRequest,
  ): Promise<RepositoryMutationDesktopResult>;
  startChat(request: ChatRequest): Promise<void>;
  cancelChat(requestId: string): Promise<void>;
  onChatEvent(listener: (event: ChatEvent) => void): () => void;
}
