/**
 * The complete desktop IPC surface shared by Electron's main and preload
 * processes. Keep channel names here so a rename cannot silently update only
 * one side of the context-isolated bridge.
 */
export const desktopIpcChannels = {
  invoke: {
    backendGetState: "backend:get-state",
    backendRetry: "backend:retry",
    workspaceGetState: "workspace:get-state",
    workspacePick: "workspace:pick",
    workspaceOpen: "workspace:open",
    workspaceSwitchRecent: "workspace:switch-recent",
    desktopLifecycleState: "desktop:lifecycle-state",
    desktopSetBackgroundMode: "desktop:set-background-mode",
    updateGetState: "update:get-state",
    updateCheck: "update:check",
    updateDownload: "update:download",
    updateInstall: "update:install",
    dialogPickFiles: "dialog:pick-files",
    dialogPickProjectFiles: "dialog:pick-project-files",
    dialogPickProjectFolders: "dialog:pick-project-folders",
    dialogPickChatAttachments: "dialog:pick-chat-attachments",
    chatImportRecordedAudio: "chat:import-recorded-audio",
    providerAuthStart: "provider-auth:start",
    providerAuthState: "provider-auth:state",
    providerAuthSubmitCode: "provider-auth:submit-code",
    providerAuthCancel: "provider-auth:cancel",
    providerAuthAcknowledge: "provider-auth:acknowledge",
    agentRequest: "agent:request",
    terminalRunConfirmed: "terminal:run-confirmed",
    terminalStreamStart: "terminal:stream-start",
    terminalStreamCancel: "terminal:stream-cancel",
    terminalSessionStart: "terminal:session-start",
    terminalSessionInput: "terminal:session-input",
    terminalSessionResize: "terminal:session-resize",
    terminalSessionInterrupt: "terminal:session-interrupt",
    terminalSessionClose: "terminal:session-close",
    terminalSessionOutput: "terminal:session-output",
    editorProjectContext: "editor:project-context",
    workspaceSaveConfirmed: "workspace:save-confirmed",
    repositoryCreateWorktreeConfirmed: "repository:create-worktree-confirmed",
    repositoryMutateConfirmed: "repository:mutate-confirmed",
    chatStart: "chat:start",
    chatCancel: "chat:cancel",
  },
  event: {
    backendState: "backend:state",
    workspaceState: "workspace:state",
    appCommand: "app:command",
    updateState: "update:state",
    terminalEvent: "terminal:event",
    chatEvent: "chat:event",
  },
} as const;

export type DesktopIpcInvokeChannel =
  (typeof desktopIpcChannels.invoke)[keyof typeof desktopIpcChannels.invoke];

export type DesktopIpcEventChannel =
  (typeof desktopIpcChannels.event)[keyof typeof desktopIpcChannels.event];

export const desktopIpcInvokeChannels = Object.freeze(
  Object.values(desktopIpcChannels.invoke),
) as readonly DesktopIpcInvokeChannel[];
