import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  Notification,
  protocol,
  screen,
  shell,
  Tray,
} from "electron";
import type { DesktopCommand, WorkspacePickResult } from "../shared/contracts";
import { desktopIpcChannels } from "../shared/ipc-channels";
import { uiInterfaceChannels } from "../shared/ui-interface";
import { importSelectedAttachments } from "./attachment-import";
import {
  BackendManager,
  findPackagedRuntime,
  findRepoRoot,
  sourceRuntimeTarget,
} from "./backend";
import type { BotConsultationDispatchInput } from "./bot-consultation-broker";
import { BotProcessRegistry } from "./bot-process-registry";
import { isActiveManagedRenderUrl } from "./browser-render-targets";
import {
  type BrowserRenderBridge,
  startBrowserRenderBridge,
} from "./browser-renderer";
import { ChatAttachmentLifecycle } from "./chat-attachment-lifecycle";
import {
  contextMenuHttpsLink,
  registerMainWindowContextMenu,
} from "./context-menu";
import {
  configureDesktopSingleInstance,
  DEFAULT_DESKTOP_LIFECYCLE_STATE,
  ensureDesktopWindow,
  handleWindowClose,
  shouldQuitAfterAllWindowsClosed,
  shouldStayOnDirtyClosePrompt,
} from "./desktop-lifecycle";
import { DesktopPreferences } from "./desktop-preferences";
import { DesktopExecutionAdmission } from "./execution-admission";
import { type DesktopBackgroundNotification, registerIpc } from "./ipc";
import { readBoundedResponseText } from "./ipc/runtime-http";
import { ProviderAuthController } from "./provider-auth";
import {
  discardRecordedAudioImport,
  importRecordedAudio,
  pruneStaleRecordedAudioImports,
} from "./recorded-audio-import";
import {
  isTrustedRendererNavigation,
  trustedDevRendererUrl,
} from "./renderer-url";
import { ensureDesktopRuntimeState } from "./runtime-state";
import {
  selectBackendLaunchTarget,
  sourceRootOverride,
} from "./runtime-target-policy";
import { registerUiExtensionScheme } from "./ui-extensions/community-view";
import { UiExtensionHost } from "./ui-extensions/host";
import { NativeUiBackend } from "./ui-host-integration";
import { UiInterfaceController } from "./ui-interface-controller";
import { configuredUpdater, DesktopUpdateController } from "./update-state";
import { loadDesktopWindow } from "./window-loading";
import {
  createWindowStatePersistenceController,
  loadWindowState,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  type WindowBounds,
} from "./window-state";
import {
  normalizeWorkspaceDirectory,
  WorkspaceStateManager,
} from "./workspace-state";

let mainWindow: BrowserWindow | null = null;
let backend: BackendManager | null = null;
let bots: BotProcessRegistry | null = null;
let browserRenderBridge: BrowserRenderBridge | null = null;
let workspaceState: WorkspaceStateManager | null = null;
let workspacePickInFlight: Promise<WorkspacePickResult> | null = null;
let disposeIpc: (() => void) | null = null;
let quitting = false;
let tray: Tray | null = null;
let desktopPreferences: DesktopPreferences | null = null;
let updates: DesktopUpdateController | null = null;
let secondInstanceRequested = false;
let desktopInitialized = false;
let uiBackend: NativeUiBackend | null = null;
let uiInterfaces: UiInterfaceController | null = null;
let disposeUiWorkspace: (() => void) | null = null;
const mainBundleDirectory = import.meta.dirname;
registerUiExtensionScheme(protocol);

function protectedNative<T>(operation: () => Promise<T>): Promise<T> {
  return uiInterfaces
    ? uiInterfaces.withProtectedDialog(operation)
    : operation();
}

function nativeOpenDialog(options: Electron.OpenDialogOptions) {
  return protectedNative(() =>
    mainWindow && !mainWindow.isDestroyed()
      ? dialog.showOpenDialog(mainWindow, options)
      : dialog.showOpenDialog(options),
  );
}

function nativeMessageBox(options: Electron.MessageBoxOptions) {
  return protectedNative(() =>
    mainWindow && !mainWindow.isDestroyed()
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options),
  );
}

async function openConfirmedExternalLink(value: string) {
  const url = contextMenuHttpsLink(value);
  if (!url) return;
  const result = await nativeMessageBox({
    type: "question",
    buttons: ["Open link", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Open external link?",
    message: `Leave Doolittle and open ${new URL(url).hostname}?`,
    detail: url,
    noLink: true,
  });
  if (result.response === 0) await shell.openExternal(url);
}

async function nativeConfirm(options: {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
}) {
  return (
    (
      await nativeMessageBox({
        ...options,
        type: "warning",
        buttons: [options.confirmLabel, "Cancel"],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
    ).response === 0
  );
}

/**
 * Keeps backend workspace transitions and their persisted desktop state in the
 * same order, while allowing a failed transition to leave later requests live.
 */
export function createSerializedWorkspaceSwitchQueue() {
  let queue: Promise<void> = Promise.resolve();

  return <T>(operation: () => Promise<T>): Promise<T> => {
    const queuedOperation = queue.then(operation);
    queue = queuedOperation.then(
      () => undefined,
      () => undefined,
    );
    return queuedOperation;
  };
}

const enqueueWorkspaceSwitch = createSerializedWorkspaceSwitchQueue();

function sendAppCommand(command: DesktopCommand): void {
  if (uiInterfaces?.getState().mode !== "default")
    uiInterfaces?.restoreDefault();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send(desktopIpcChannels.event.appCommand, command);
}

function showBackgroundNotification({
  title,
  body,
}: DesktopBackgroundNotification): void {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
    return;
  }
  if (!Notification.isSupported()) return;

  const notification = new Notification({ title, body });
  notification.once("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
  notification.show();
}

function currentWorkspaceDialogPath(): string | undefined {
  return workspaceState?.getState().currentPath || undefined;
}

async function pickFiles() {
  const options = {
    title: "Add context to Doolittle",
    buttonLabel: "Add context",
    defaultPath: currentWorkspaceDialogPath(),
    properties: [
      "openFile",
      "multiSelections",
      "dontAddToRecent",
    ] as Electron.OpenDialogOptions["properties"],
  };
  const result = await nativeOpenDialog(options);
  return {
    canceled: result.canceled,
    paths: result.canceled ? [] : result.filePaths,
  };
}

async function pickProjectFiles() {
  const options: Electron.OpenDialogOptions = {
    title: "Add files to this project",
    buttonLabel: "Add to project",
    defaultPath: currentWorkspaceDialogPath(),
    properties: ["openFile", "multiSelections", "dontAddToRecent"],
  };
  const result = await nativeOpenDialog(options);
  return {
    canceled: result.canceled,
    kind: "file" as const,
    paths: result.canceled ? [] : result.filePaths,
  };
}

async function pickProjectFolders() {
  const options: Electron.OpenDialogOptions = {
    title: "Add folders to this project",
    buttonLabel: "Add to project",
    defaultPath: currentWorkspaceDialogPath(),
    properties: ["openDirectory", "multiSelections", "dontAddToRecent"],
  };
  const result = await nativeOpenDialog(options);
  return {
    canceled: result.canceled,
    kind: "folder" as const,
    paths: result.canceled ? [] : result.filePaths,
  };
}

async function pickChatAttachments(
  runtimeDataDir: string,
  lifecycle: ChatAttachmentLifecycle,
  botId: string,
  recheck?: () => Promise<void>,
) {
  const options = {
    title: "Attach files to this message",
    buttonLabel: "Attach",
    defaultPath: currentWorkspaceDialogPath(),
    properties: [
      "openFile",
      "multiSelections",
      "dontAddToRecent",
    ] as Electron.OpenDialogOptions["properties"],
  };
  const result = await nativeOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, attachments: [] };
  }
  await recheck?.();
  const attachments = importSelectedAttachments(
    result.filePaths,
    runtimeDataDir,
  ).map((attachment) => ({ ...attachment, botId }));
  return {
    canceled: false,
    attachments,
    cleanupCapability: lifecycle.lease(attachments),
  };
}

async function pickWorkspaceImpl(): Promise<WorkspacePickResult> {
  if (!workspaceState || !backend) {
    throw new Error("The desktop workspace manager is not ready.");
  }
  const activeWorkspaceState = workspaceState;
  const activeBackend = backend;
  const options: Electron.OpenDialogOptions = {
    title: "Open a Doolittle workspace",
    buttonLabel: "Open workspace",
    defaultPath: currentWorkspaceDialogPath(),
    properties: ["openDirectory", "dontAddToRecent"],
  };
  const result = await nativeOpenDialog(options);
  if (result.canceled) {
    return workspaceState.applyPickerResult({
      canceled: true,
      filePaths: [],
    });
  }
  const selectedPath = result.filePaths[0];
  if (!selectedPath) {
    throw new Error("The directory picker did not return a workspace.");
  }
  const normalizedPath = normalizeWorkspaceDirectory(selectedPath);
  return enqueueWorkspaceSwitch(async () => {
    await activeBackend.switchWorkspace(normalizedPath);
    return activeWorkspaceState.applyPickerResult({
      canceled: false,
      filePaths: [normalizedPath],
    });
  });
}

async function switchRecentWorkspaceImpl(
  requestedPath: string,
): Promise<WorkspacePickResult> {
  if (!workspaceState || !backend) {
    throw new Error("The desktop workspace manager is not ready.");
  }
  const normalizedPath = normalizeWorkspaceDirectory(requestedPath);
  const pathKey =
    process.platform === "win32"
      ? normalizedPath.toLowerCase()
      : normalizedPath;
  const allowed = workspaceState
    .getState()
    .recentPaths.some(
      (path) =>
        (process.platform === "win32" ? path.toLowerCase() : path) === pathKey,
    );
  if (!allowed) {
    throw new Error(
      "This folder is not in recent workspaces. Choose it with Open workspace first.",
    );
  }
  await backend.switchWorkspace(normalizedPath);
  return workspaceState.applyPickerResult({
    canceled: false,
    filePaths: [normalizedPath],
  });
}

async function openWorkspacePathImpl(
  requestedPath: string,
): Promise<WorkspacePickResult> {
  if (!workspaceState || !backend) {
    throw new Error("The desktop workspace manager is not ready.");
  }
  const normalizedPath = normalizeWorkspaceDirectory(requestedPath);
  const result = await nativeMessageBox({
    type: "question",
    title: "Open workspace",
    message: "Open this worktree as the active Doolittle workspace?",
    detail: normalizedPath,
    buttons: ["Open workspace", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (result.response !== 0) {
    return {
      canceled: true,
      state: workspaceState.getState(),
    };
  }
  await backend.switchWorkspace(normalizedPath);
  return workspaceState.applyPickerResult({
    canceled: false,
    filePaths: [normalizedPath],
  });
}

function pickWorkspace(): Promise<WorkspacePickResult> {
  if (workspacePickInFlight) return workspacePickInFlight;
  workspacePickInFlight = pickWorkspaceImpl().finally(() => {
    workspacePickInFlight = null;
  });
  return workspacePickInFlight;
}

function switchRecentWorkspace(path: string): Promise<WorkspacePickResult> {
  return enqueueWorkspaceSwitch(() => switchRecentWorkspaceImpl(path));
}

function openWorkspacePath(path: string): Promise<WorkspacePickResult> {
  return enqueueWorkspaceSwitch(() => openWorkspacePathImpl(path));
}

function reportWorkspacePickerError(error: unknown): void {
  const show = () =>
    dialog.showErrorBox(
      "Unable to open workspace",
      error instanceof Error
        ? error.message
        : "Doolittle could not open the selected workspace.",
    );
  if (uiInterfaces) uiInterfaces.withProtectedDialogSync(show);
  else show();
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "CommandOrControl+,",
                click: () => sendAppCommand("settings"),
              },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open workspace…",
          accelerator: "CommandOrControl+O",
          click: () => void pickWorkspace().catch(reportWorkspacePickerError),
        },
        { type: "separator" },
        {
          label: "New conversation",
          accelerator: "CommandOrControl+N",
          click: () => sendAppCommand("new-chat"),
        },
        {
          label: "Open command palette",
          accelerator: "CommandOrControl+K",
          click: () => sendAppCommand("command-palette"),
        },
        ...(process.platform === "darwin"
          ? []
          : [
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "CommandOrControl+,",
                click: () => sendAppCommand("settings"),
              },
              { type: "separator" as const },
              { role: "quit" as const },
            ]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle chat terminal",
          accelerator: "CommandOrControl+J",
          click: () => sendAppCommand("toggle-terminal"),
        },
        { type: "separator" },
        {
          label: "Toggle navigation",
          accelerator: "CommandOrControl+Shift+B",
          click: () => sendAppCommand("toggle-sidebar"),
        },
        {
          label: "Toggle context panel",
          accelerator: "CommandOrControl+Alt+I",
          click: () => sendAppCommand("toggle-inspector"),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Interface",
      submenu: [
        {
          label: "Restore default interface",
          accelerator: "CommandOrControl+Shift+R",
          click: () => uiInterfaces?.restoreDefault(),
        },
        {
          label: "Install local interface…",
          click: () =>
            void uiInterfaces
              ?.install()
              .then(() => sendAppCommand("settings"))
              .catch(reportInterfaceError),
        },
        {
          label: "Manage interface access…",
          click: () => sendAppCommand("settings"),
        },
        { type: "separator" },
        {
          label: "Stop all conversations",
          click: () =>
            void uiBackend
              ?.stopAllOwnedConversations()
              .catch(reportInterfaceError),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function reportInterfaceError(): void {
  void nativeMessageBox({
    type: "error",
    title: "Interface operation unavailable",
    message:
      "The interface operation could not finish safely. Restore the default interface and review Settings. Running work and saved conversations are preserved.",
    buttons: ["OK"],
  });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function handleSecondInstance(): void {
  secondInstanceRequested = true;
  if (!desktopInitialized) return;
  mainWindow = ensureDesktopWindow(mainWindow, createWindow);
  uiInterfaces?.attachWindow(mainWindow);
  showMainWindow();
}

const ownsSingleInstance = configureDesktopSingleInstance(
  app,
  handleSecondInstance,
);

function requestQuit(): void {
  if (!quitting) app.quit();
}

function installTray(): void {
  tray?.destroy();
  tray = new Tray(resolve(app.getAppPath(), "assets/icon.png"));
  tray.setToolTip("Doolittle");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Doolittle", click: showMainWindow },
      { type: "separator" },
      { label: "Quit Doolittle", click: requestQuit },
    ]),
  );
  tray.on("click", showMainWindow);
}

function enclosingDisplayBounds(areas: WindowBounds[]): WindowBounds {
  const left = Math.min(...areas.map((area) => area.x));
  const top = Math.min(...areas.map((area) => area.y));
  const right = Math.max(...areas.map((area) => area.x + area.width));
  const bottom = Math.max(...areas.map((area) => area.y + area.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function createWindow(): BrowserWindow {
  const statePath = resolve(app.getPath("userData"), "window-state.json");
  const displayWorkAreas = screen
    .getAllDisplays()
    .map((display) => display.workArea);
  const displayBounds = enclosingDisplayBounds(displayWorkAreas);
  const savedState = loadWindowState(statePath, {
    displayBounds,
    displayWorkAreas,
  });
  const window = new BrowserWindow({
    ...savedState.bounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    autoHideMenuBar: process.platform !== "darwin",
    show: false,
    title: "Doolittle",
    backgroundColor: "#0b0a09",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: resolve(mainBundleDirectory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openConfirmedExternalLink(url).catch(() => undefined);
    return { action: "deny" };
  });
  const disposeContextMenu = registerMainWindowContextMenu(window, {
    buildMenu: (items) => Menu.buildFromTemplate(items),
    copyLink: (url) => clipboard.writeText(url),
    openLink: openConfirmedExternalLink,
  });
  window.once("closed", disposeContextMenu);
  const rendererUrl = trustedDevRendererUrl(
    process.env.DOOLITTLE_RENDERER_URL,
    app.isPackaged,
  );
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererNavigation(url, rendererUrl)) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const showDirtyPrompt = () =>
      dialog.showMessageBoxSync(window, {
        type: "warning",
        title: "Unsaved coding changes",
        message: "This coding workspace has unsaved edits.",
        detail:
          "Stay to keep the draft, or leave to discard it and close Doolittle.",
        buttons: ["Stay", "Leave"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
    const result = uiInterfaces
      ? uiInterfaces.withProtectedDialogSync(showDirtyPrompt)
      : showDirtyPrompt();
    if (shouldStayOnDirtyClosePrompt(result)) event.preventDefault();
  });

  void loadDesktopWindow(window, {
    rendererFile: resolve(mainBundleDirectory, "../renderer/index.html"),
    rendererUrl,
    startMaximized: savedState.isMaximized,
  });

  const windowState = createWindowStatePersistenceController(
    window,
    statePath,
    { displayBounds, displayWorkAreas },
  );
  const persistWindowState = () => windowState.requestPersist();
  window.on("resize", persistWindowState);
  window.on("move", persistWindowState);
  window.on("maximize", persistWindowState);
  window.on("unmaximize", persistWindowState);
  window.on("close", () => {
    try {
      windowState.flush();
    } catch {
      // Window state is a convenience and must never block shutdown.
    }
  });
  window.on("close", (event) => {
    if (desktopPreferences)
      handleWindowClose(window, event, desktopPreferences.getState(), quitting);
  });
  window.on("closed", () => windowState.stop());
  return window;
}

if (ownsSingleInstance)
  app.whenReady().then(async () => {
    const sourceRoot = sourceRootOverride(
      app.isPackaged,
      process.env.DOOLITTLE_DESKTOP_SOURCE_ROOT,
    );
    const sourceRepoRoot = app.isPackaged
      ? null
      : sourceRoot
        ? findRepoRoot([sourceRoot])
        : findRepoRoot(
            [
              process.env.DOOLITTLE_REPO_ROOT || "",
              app.getAppPath(),
              process.cwd(),
              mainBundleDirectory,
            ].filter(Boolean),
          );
    const packagedRuntime = app.isPackaged
      ? findPackagedRuntime(process.resourcesPath)
      : null;
    const target = selectBackendLaunchTarget({
      isPackaged: app.isPackaged,
      packagedRuntime,
      sourceRuntime: app.isPackaged
        ? null
        : sourceRuntimeTarget(
            sourceRepoRoot ??
              findRepoRoot([
                app.getAppPath(),
                process.cwd(),
                mainBundleDirectory,
              ]),
          ),
    });
    const runtimeDataDir = resolve(app.getPath("userData"), "runtime");
    try {
      browserRenderBridge = await startBrowserRenderBridge({
        isManagedAppUrl: (url) =>
          isActiveManagedRenderUrl(
            url,
            () =>
              backend?.getState() ?? {
                phase: "booting",
                message: "Runtime unavailable",
              },
            () => backend?.getWorkspaceDirectory() ?? "",
          ),
      });
      target.environment = {
        ...target.environment,
        ...browserRenderBridge.environment,
      };
    } catch {
      // Text capture remains available; never report native rendering as ready.
      console.warn("Private rendered-page capture is unavailable.");
    }
    const chatAttachmentLifecycles = new Map<string, ChatAttachmentLifecycle>();
    const attachmentLifecycleFor = (botId = "default") => {
      const dataDirectory = bots?.dataDirectory(botId) ?? runtimeDataDir;
      let lifecycle = chatAttachmentLifecycles.get(dataDirectory);
      if (!lifecycle) {
        lifecycle = new ChatAttachmentLifecycle(dataDirectory);
        chatAttachmentLifecycles.set(dataDirectory, lifecycle);
      }
      return { dataDirectory, lifecycle };
    };
    // Eliza's OAuth/account-storage helpers resolve their state root from
    // ELIZA_HOME. Bind the desktop main process to the same private data root
    // passed to the backend so newly saved accounts appear in the live pool.
    process.env.ELIZA_HOME ??= runtimeDataDir;
    ensureDesktopRuntimeState(
      runtimeDataDir,
      sourceRepoRoot ? resolve(sourceRepoRoot, ".doolittle") : undefined,
    );
    pruneStaleRecordedAudioImports(runtimeDataDir);
    const requestedWorkspaceOverride =
      process.env.DOOLITTLE_DESKTOP_CWD?.trim();
    const requestedWorkspace = requestedWorkspaceOverride || homedir();
    let fallbackWorkspace = homedir();
    try {
      fallbackWorkspace = normalizeWorkspaceDirectory(requestedWorkspace);
    } catch {
      // Invalid environment overrides must not prevent the desktop from opening.
    }
    workspaceState = new WorkspaceStateManager(
      resolve(app.getPath("userData"), "workspace-state.json"),
      fallbackWorkspace,
      { selectFallback: Boolean(requestedWorkspaceOverride) },
    );
    desktopPreferences = new DesktopPreferences(
      resolve(app.getPath("userData"), "desktop-preferences.json"),
    );
    const packagedUpdater = app.isPackaged ? configuredUpdater() : null;
    updates = new DesktopUpdateController(
      packagedUpdater,
      app.isPackaged && process.platform === "linux"
        ? "Automatic updates are disabled on Linux until release metadata has an independently pinned signature. Download and verify a signed release manually."
        : app.isPackaged
          ? "Updates are unavailable in this packaged build."
          : "Updates are only available in a packaged, signed Doolittle build.",
    );
    const executionAdmission = new DesktopExecutionAdmission();
    backend = new BackendManager(
      target,
      runtimeDataDir,
      workspaceState.getState().currentPath || fallbackWorkspace,
      fetch,
      {
        hostRpcBotId: "default",
        workerHostHandler: async (request, signal) => {
          if (
            request.operation === "execution.claim" ||
            request.operation === "execution.release"
          ) {
            const mutationRoot = workspaceState?.getState().currentPath;
            return executionAdmission.handle(
              "default",
              request.operation,
              request.payload,
              {
                mutationRoot: mutationRoot
                  ? realpathSync(mutationRoot)
                  : undefined,
              },
            );
          }
          if (!bots) throw new Error("The consultation broker is unavailable.");
          if (request.operation === "automation.validate")
            return bots.automations.validate(
              "default",
              (
                request.payload as {
                  job: import("@doolittle/contracts").AutomationJobRecord;
                }
              ).job,
              signal,
            );
          if (request.operation === "automation.dispatch")
            return bots.automations.dispatch(
              "default",
              request.payload as Parameters<
                typeof bots.automations.dispatch
              >[1],
              signal,
            );
          if (request.operation === "automation.status")
            return bots.automations.status(
              "default",
              request.payload as Parameters<typeof bots.automations.status>[1],
            );
          if (
            request.operation === "automation.wait" ||
            request.operation === "automation.cancel"
          ) {
            const payload = request.payload as { fireId?: unknown } | null;
            if (!payload || typeof payload.fireId !== "string")
              throw new Error("Automation fire identity is invalid.");
            return request.operation === "automation.wait"
              ? bots.automations.wait("default", payload.fireId, signal)
              : bots.automations.cancel("default", payload.fireId);
          }
          if (request.operation === "consult.dispatch") {
            return bots.consultations.dispatch(
              "default",
              request.payload as BotConsultationDispatchInput,
              signal,
            );
          }
          if (
            request.operation === "consult.wait" ||
            request.operation === "consult.cancel"
          ) {
            const payload = request.payload as { dispatchId?: unknown } | null;
            if (
              !payload ||
              typeof payload.dispatchId !== "string" ||
              !/^[0-9a-f-]{36}$/iu.test(payload.dispatchId)
            ) {
              throw new Error("Consultation ID is invalid.");
            }
            return request.operation === "consult.wait"
              ? bots.consultations.wait("default", payload.dispatchId, signal)
              : bots.consultations.cancel("default", payload.dispatchId);
          }
          throw new Error(
            "This host operation is not available to the lead runtime.",
          );
        },
        onHostDisconnect: () => executionAdmission.releaseBot("default"),
      },
    );
    bots = new BotProcessRegistry(
      target,
      runtimeDataDir,
      backend,
      workspaceState.getState().currentPath || fallbackWorkspace,
      { admission: executionAdmission, confirmAutomation: nativeConfirm },
    );
    // Start the bundled Eliza runtime as soon as its immutable launch inputs
    // are ready. Window construction, menus, tray wiring, and IPC registration
    // do not depend on the listener, so let that UI work overlap the backend's
    // database and plugin bootstrap instead of delaying process spawn.
    void backend.start();
    // The packaged app is a normal foreground APPL. Let Electron/AppKit own its
    // activation policy and construct the first window immediately. Explicit
    // Dock registration here can leave newly installed builds without a
    // WindowServer connection on recent macOS releases.
    mainWindow = createWindow();
    desktopInitialized = true;
    if (secondInstanceRequested) showMainWindow();
    const providerAuth = new ProviderAuthController({
      openExternal: (url) => shell.openExternal(url),
      readClipboardText: () => clipboard.readText(),
    });
    const uiBots = bots;
    uiBackend = new NativeUiBackend({
      registry: uiBots,
      currentWorkspace: () => workspaceState?.getState().currentPath ?? "",
      pickAttachments: async (target, recheck) => {
        const { dataDirectory, lifecycle } = attachmentLifecycleFor(
          target.botId,
        );
        const selection = await pickChatAttachments(
          dataDirectory,
          lifecycle,
          target.botId,
          recheck,
        );
        return selection.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          ...(selection.cleanupCapability
            ? { cleanupCapability: selection.cleanupCapability }
            : {}),
        }));
      },
      commitAttachments: (target, attachments) => {
        const grouped = new Map<string, string[]>();
        for (const attachment of attachments) {
          if (!attachment.cleanupCapability) continue;
          const ids = grouped.get(attachment.cleanupCapability) ?? [];
          ids.push(attachment.id);
          grouped.set(attachment.cleanupCapability, ids);
        }
        for (const [capability, ids] of grouped)
          attachmentLifecycleFor(target.botId).lifecycle.commit(
            ids,
            capability,
          );
      },
      openSurface: (target, surface) => {
        // The native renderer resolves this explicit owner; it must not retarget
        // an extension's request to whichever conversation happens to be focused.
        uiInterfaces?.revealHostSurface(target, surface);
        mainWindow?.webContents.send(uiInterfaceChannels.surface, {
          target,
          surface,
        });
      },
      presentApproval: async (target, runId, approvalId, recheck) => {
        await uiBots.assertRunOwner(target.botId, runId);
        const state = (await uiBots.backendFor(target.botId)).getState();
        if (state.phase !== "ready" || !state.url)
          throw new Error("The bot is offline.");
        const response = await fetch(
          `${state.url}/execution/approvals?status=pending`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!response.ok) throw new Error("Native approvals are unavailable.");
        const payload = JSON.parse(
          await readBoundedResponseText(response, 1_000_000),
        ) as {
          approvals?: Array<{
            id: string;
            roomId: string;
            runId?: string;
            command: string;
            reason: string;
            status: string;
          }>;
        };
        const approval = payload.approvals?.find(
          (item) =>
            item.id === approvalId &&
            item.roomId === target.sessionId &&
            item.runId === runId &&
            item.status === "pending",
        );
        if (!approval)
          throw new Error(
            "This approval has no matching canonical run ownership.",
          );
        const decision = await nativeMessageBox({
          type: "warning",
          title: "Agent execution permission",
          message: `${uiBots.get(target.botId).name} requests permission to run a command.`,
          detail: `${approval.command.slice(0, 4096)}\n\n${approval.reason.slice(0, 2048)}`,
          buttons: ["Approve", "Deny", "Cancel"],
          defaultId: 2,
          cancelId: 2,
          noLink: true,
        });
        if (decision.response === 2) return;
        await recheck();
        const result = await fetch(
          `${state.url}/execution/approvals/${encodeURIComponent(approvalId)}/${decision.response === 0 ? "approve" : "deny"}`,
          { method: "POST", signal: AbortSignal.timeout(10_000) },
        );
        if (!result.ok)
          throw new Error("The native approval could not be resolved.");
      },
    });
    const interfaceRoot = resolve(app.getPath("userData"), "interfaces");
    let uiHost: UiExtensionHost;
    let corruptUiHost = false;
    try {
      uiHost = new UiExtensionHost(
        uiBackend,
        resolve(interfaceRoot, "host.json"),
      );
    } catch {
      // Preserve the original ledger. A corrupt idempotency record must never
      // become permission to resubmit an uncertain historical action.
      corruptUiHost = true;
      uiHost = new UiExtensionHost(
        uiBackend,
        resolve(interfaceRoot, `recovery-host-${randomUUID()}.json`),
      );
    }
    uiBackend.attachHost(uiHost);
    uiInterfaces = new UiInterfaceController({
      host: uiHost,
      artifactRoot: interfaceRoot,
      statePath: resolve(interfaceRoot, "selection.json"),
      extensionPreload: resolve(
        mainBundleDirectory,
        "../preload/extension-bridge.cjs",
      ),
      getWindow: () => mainWindow,
      ipcMain,
      protocol,
      safeMode:
        corruptUiHost ||
        process.argv.includes("--safe-ui") ||
        process.env.DOOLITTLE_SAFE_UI === "1",
      rendererOrigin: trustedDevRendererUrl(
        process.env.DOOLITTLE_RENDERER_URL,
        app.isPackaged,
      )
        ? new URL(
            trustedDevRendererUrl(
              process.env.DOOLITTLE_RENDERER_URL,
              app.isPackaged,
            ) as string,
          ).origin
        : "file://",
      commandsDisabled: corruptUiHost,
      ...(corruptUiHost
        ? {
            initialRecovery:
              "The interface host ledger needs recovery. Default UI is available; the original ledger and all running work are preserved. Extension commands are disabled.",
          }
        : {}),
      pickArtifactDirectory: async () => {
        const selected = await nativeOpenDialog({
          title: "Install a Doolittle interface",
          buttonLabel: "Inspect interface",
          properties: ["openDirectory", "dontAddToRecent"],
        });
        return selected.canceled ? undefined : selected.filePaths[0];
      },
      confirm: nativeConfirm,
      ownsTarget: (target) =>
        uiBackend?.ownsTarget(target) ?? Promise.resolve(false),
      stopAll: async () => {
        if (!uiBackend || !bots)
          throw new Error("Native execution control is unavailable.");
        let chatFailure: unknown;
        try {
          await uiBackend.stopAllOwnedConversations();
        } catch (error) {
          chatFailure = error;
        }
        await bots.stopAllOwnedExecutions();
        if (chatFailure) throw chatFailure;
      },
    });
    await uiInterfaces.start();
    if (!corruptUiHost) uiBackend.start();
    let uiWorkspace = workspaceState.getState().currentPath;
    disposeUiWorkspace = workspaceState.subscribe((state) => {
      if (state.currentPath === uiWorkspace) return;
      uiWorkspace = state.currentPath;
      bots?.automations.cancelPendingValidations();
      uiInterfaces?.workspaceChanged();
    });
    installApplicationMenu();
    installTray();
    disposeIpc = registerIpc({
      ipcMain,
      backend,
      bots,
      admission: executionAdmission,
      getMainWindow: () => mainWindow,
      pickFiles,
      workspace: {
        getState: () =>
          workspaceState?.getState() ?? { currentPath: "", recentPaths: [] },
        pickWorkspace,
        openWorkspace: openWorkspacePath,
        switchWorkspace: switchRecentWorkspace,
        subscribe: (listener) =>
          workspaceState?.subscribe(listener) ?? (() => undefined),
      },
      sensitiveActionDependencies: {
        notify: showBackgroundNotification,
        confirm: nativeConfirm,
      },
      pickChatAttachments: (botId = "default") => {
        const { dataDirectory, lifecycle } = attachmentLifecycleFor(botId);
        return pickChatAttachments(dataDirectory, lifecycle, botId);
      },
      pickProjectFiles,
      pickProjectFolders,
      importRecordedAudio: (request) =>
        importRecordedAudio(
          request,
          attachmentLifecycleFor(request.botId).dataDirectory,
        ),
      discardRecordedAudio: (recordingId, botId) =>
        discardRecordedAudioImport(
          attachmentLifecycleFor(botId).dataDirectory,
          recordingId,
        ),
      discardChatAttachments: ({ botId, attachmentIds, cleanupCapability }) =>
        attachmentLifecycleFor(botId).lifecycle.discard(
          attachmentIds,
          cleanupCapability,
        ),
      commitChatAttachments: ({ botId, attachmentIds, cleanupCapability }) =>
        attachmentLifecycleFor(botId).lifecycle.commit(
          attachmentIds,
          cleanupCapability,
        ),
      desktopControls: {
        getLifecycleState: () =>
          desktopPreferences?.getState() ?? { keepRunningInBackground: false },
        setKeepRunningInBackground: (enabled) =>
          desktopPreferences?.setBackgroundMode(enabled) ?? {
            keepRunningInBackground: false,
          },
        updates,
        providerAuth,
      },
    });
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    app.on("activate", () => {
      mainWindow = ensureDesktopWindow(mainWindow, createWindow);
      uiInterfaces?.attachWindow(mainWindow);
      showMainWindow();
    });
  });

app.on("before-quit", (event) => {
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  tray?.destroy();
  tray = null;
  disposeUiWorkspace?.();
  uiInterfaces?.dispose();
  uiBackend?.dispose();
  void Promise.all([backend.stop(), bots?.stopAll()]).finally(async () => {
    try {
      await browserRenderBridge?.dispose();
    } finally {
      browserRenderBridge = null;
      disposeIpc?.();
      app.quit();
    }
  });
});

app.on("window-all-closed", () => {
  if (
    shouldQuitAfterAllWindowsClosed(
      desktopPreferences?.getState() ?? DEFAULT_DESKTOP_LIFECYCLE_STATE,
    )
  ) {
    app.quit();
  }
});
