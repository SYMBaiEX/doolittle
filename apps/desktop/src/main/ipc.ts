import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  ChatRequest,
  DesktopUpdateState,
  EditorProjectContextRequest,
  EditorProjectContextResult,
  RecordedAudioImportRequest,
  WorkspaceFileSaveRequest,
  WorkspaceFileSaveResult,
  WorkspaceState,
} from "../shared/contracts";
import {
  type DesktopIpcInvokeChannel,
  desktopIpcChannels,
} from "../shared/ipc-channels";
import { SseParser } from "../shared/sse";
import { resolveEditorProjectContext } from "./editor-project-context";
import { requestAgentTransport } from "./ipc/agent-transport";
import { isRecord } from "./ipc/input-validation";
import type {
  DesktopBackgroundNotification,
  RegisterIpcDependencies,
  SensitiveActionConfirmationRequest,
} from "./ipc/ipc-validation";
import {
  assertChatRequest,
  MAX_WORKSPACE_PATH_LENGTH,
  validateChatAttachmentIds,
  validateProviderAuthProvider,
  validateProviderAuthStartOptions,
  validateWorkspaceFileSaveRequest,
} from "./ipc/ipc-validation";
import { registerTerminalIpcHandlers } from "./ipc/register-terminal-ipc";
import { registerRepositoryIpcHandlers } from "./ipc/repository";
import { parseRequestError, parseSuccessfulJson } from "./ipc/runtime-http";

export type {
  DesktopBackgroundNotification,
  DesktopControlIpcDependencies,
  RegisterIpcDependencies,
  SensitiveActionConfirmationRequest,
  SensitiveActionIpcDependencies,
  WorkspaceIpcController,
} from "./ipc/ipc-validation";
export {
  assertChatRequest,
  MAX_CHAT_ATTACHMENTS,
  MAX_INTERACTIVE_TERMINAL_COLUMNS,
  MAX_INTERACTIVE_TERMINAL_INPUT_BYTES,
  MAX_INTERACTIVE_TERMINAL_ROWS,
  MAX_WORKSPACE_FILE_BYTES,
  MAX_WORKSPACE_PATH_LENGTH,
  MIN_INTERACTIVE_TERMINAL_COLUMNS,
  MIN_INTERACTIVE_TERMINAL_ROWS,
  validateChatAttachmentIds,
  validateDesktopCommandRequest,
  validateInteractiveTerminalDimension,
  validateInteractiveTerminalInputRequest,
  validateInteractiveTerminalOutput,
  validateInteractiveTerminalResizeRequest,
  validateInteractiveTerminalSession,
  validateInteractiveTerminalSessionId,
  validateInteractiveTerminalStartRequest,
  validateProviderAuthProvider,
  validateProviderAuthStartOptions,
  validateSensitiveWorkspacePath,
  validateTerminalRequestId,
  validateTerminalStreamRequest,
  validateWorkspaceFileSaveRequest,
} from "./ipc/ipc-validation";

const API_TIMEOUT_MS = 15_000;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;

export function isTrustedDesktopIpcSender(
  event: Pick<IpcMainInvokeEvent, "sender">,
  mainWindow: Pick<BrowserWindow, "isDestroyed" | "webContents"> | null,
): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return event.sender === mainWindow.webContents;
}

interface ActiveChat {
  controller: AbortController;
}

function chatKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
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
  const activeTerminalRuns = new Map<string, { controller: AbortController }>();
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
  registerTerminalIpcHandlers({
    backend,
    registerHandler,
    activeTerminalRuns,
    confirmSensitiveAction,
    sensitiveFetch,
    notifyBackground,
  });
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
      const payload = await parseSuccessfulJson(
        response,
        MAX_SENSITIVE_RESPONSE_BYTES,
      );
      const savedPath = isRecord(payload) ? payload.path : undefined;
      if (typeof savedPath !== "string" || !savedPath) {
        throw new Error("The local runtime did not confirm the saved path.");
      }
      return { status: "saved", path: savedPath };
    },
  );
  registerRepositoryIpcHandlers({
    backend,
    confirmSensitiveAction,
    sensitiveFetch,
    registerHandler,
  });
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
      if (request.workspacePath !== backend.getWorkspaceDirectory()) {
        throw new Error(
          "The selected workspace changed before this chat started. Switch back before sending it.",
        );
      }

      const key = chatKey(event, request.requestId);
      if (activeChats.has(key)) {
        throw new Error("This chat request is already running.");
      }

      const controller = new AbortController();
      let terminalEventEmitted = false;
      const emitEvent = (payload: { event: string; data: unknown }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(eventChannels.chatEvent, {
            requestId: request.requestId,
            ...payload,
          });
        }
      };
      const emitChatEvent = (payload: { event: string; data: unknown }) => {
        const terminal =
          payload.event === "response.completed" ||
          payload.event === "response.failed" ||
          payload.event === "error" ||
          payload.event === "cancelled" ||
          payload.event === "response.cancelled";
        if (terminal && terminalEventEmitted) {
          return false;
        }
        if (terminal) {
          terminalEventEmitted = true;
        }
        emitEvent(payload);
        return terminal;
      };
      const notifyChatTerminalEvent = (eventName: string) => {
        if (eventName === "response.completed") {
          notifyBackground({
            title: "Doolittle is ready",
            body: "Your response is ready.",
          });
        } else if (eventName === "response.failed" || eventName === "error") {
          notifyBackground({
            title: "Doolittle needs attention",
            body: "A response stopped with an error.",
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
            workspaceDir: request.workspacePath,
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
            if (emitChatEvent(eventMessage)) {
              notifyChatTerminalEvent(eventMessage.event);
            }
          }
        }
        const tail = decoder.decode();
        for (const eventMessage of parser.push(tail)) {
          if (emitChatEvent(eventMessage)) {
            notifyChatTerminalEvent(eventMessage.event);
          }
        }
        for (const eventMessage of parser.finish()) {
          if (emitChatEvent(eventMessage)) {
            notifyChatTerminalEvent(eventMessage.event);
          }
        }
        if (!terminalEventEmitted) {
          throw new Error(
            "The runtime closed the chat stream before completing the response.",
          );
        }
      } catch (error) {
        // A terminal event is authoritative. A transport failure after it
        // should not manufacture a second terminal state for the renderer.
        if (terminalEventEmitted) {
          return;
        }
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
      const payload = await parseSuccessfulJson(
        response,
        MAX_SENSITIVE_RESPONSE_BYTES,
      );
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
