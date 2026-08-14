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
  screen,
  shell,
  Tray,
} from "electron";
import type { DesktopCommand, WorkspacePickResult } from "../shared/contracts";
import { desktopIpcChannels } from "../shared/ipc-channels";
import { importSelectedAttachments } from "./attachment-import";
import {
  BackendManager,
  findPackagedRuntime,
  findRepoRoot,
  sourceRuntimeTarget,
} from "./backend";
import {
  handleWindowClose,
  shouldStayOnDirtyClosePrompt,
} from "./desktop-lifecycle";
import { DesktopPreferences } from "./desktop-preferences";
import { type DesktopBackgroundNotification, registerIpc } from "./ipc";
import { ProviderAuthController } from "./provider-auth";
import { importRecordedAudio } from "./recorded-audio-import";
import {
  isTrustedRendererNavigation,
  trustedDevRendererUrl,
} from "./renderer-url";
import { ensureDesktopRuntimeState } from "./runtime-state";
import {
  selectBackendLaunchTarget,
  sourceRootOverride,
} from "./runtime-target-policy";
import { configuredUpdater, DesktopUpdateController } from "./update-state";
import { loadDesktopWindow } from "./window-loading";
import {
  createWindowStatePersistenceController,
  loadWindowState,
  type WindowBounds,
} from "./window-state";
import {
  normalizeWorkspaceDirectory,
  WorkspaceStateManager,
} from "./workspace-state";

let mainWindow: BrowserWindow | null = null;
let backend: BackendManager | null = null;
let workspaceState: WorkspaceStateManager | null = null;
let workspacePickInFlight: Promise<WorkspacePickResult> | null = null;
let workspaceSwitchQueue: Promise<void> = Promise.resolve();
let disposeIpc: (() => void) | null = null;
let quitting = false;
let tray: Tray | null = null;
let desktopPreferences: DesktopPreferences | null = null;
let updates: DesktopUpdateController | null = null;
const mainBundleDirectory = import.meta.dirname;

function sendAppCommand(command: DesktopCommand): void {
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
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
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
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
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
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return {
    canceled: result.canceled,
    kind: "folder" as const,
    paths: result.canceled ? [] : result.filePaths,
  };
}

async function pickChatAttachments(runtimeDataDir: string) {
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
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, attachments: [] };
  }
  return {
    canceled: false,
    attachments: importSelectedAttachments(result.filePaths, runtimeDataDir),
  };
}

async function pickWorkspaceImpl(): Promise<WorkspacePickResult> {
  if (!workspaceState || !backend) {
    throw new Error("The desktop workspace manager is not ready.");
  }
  const options: Electron.OpenDialogOptions = {
    title: "Open a Doolittle workspace",
    buttonLabel: "Open workspace",
    defaultPath: currentWorkspaceDialogPath(),
    properties: ["openDirectory", "dontAddToRecent"],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
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
  await backend.switchWorkspace(normalizedPath);
  return workspaceState.applyPickerResult({
    canceled: false,
    filePaths: [normalizedPath],
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
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Open workspace",
        message: "Open this worktree as the active Doolittle workspace?",
        detail: normalizedPath,
        buttons: ["Open workspace", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
    : await dialog.showMessageBox({
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
  const operation = workspaceSwitchQueue.then(() =>
    switchRecentWorkspaceImpl(path),
  );
  workspaceSwitchQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function openWorkspacePath(path: string): Promise<WorkspacePickResult> {
  const operation = workspaceSwitchQueue.then(() =>
    openWorkspacePathImpl(path),
  );
  workspaceSwitchQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function reportWorkspacePickerError(error: unknown): void {
  dialog.showErrorBox(
    "Unable to open workspace",
    error instanceof Error
      ? error.message
      : "Doolittle could not open the selected workspace.",
  );
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

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

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

function desktopDisplayBounds(): WindowBounds {
  const areas = screen.getAllDisplays().map((display) => display.workArea);
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
  const displayBounds = desktopDisplayBounds();
  const savedState = loadWindowState(statePath, { displayBounds });
  const window = new BrowserWindow({
    ...savedState.bounds,
    minWidth: 920,
    minHeight: 620,
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
    if (url.startsWith("https://")) {
      let destination = url;
      try {
        destination = new URL(url).hostname;
      } catch {
        // The invalid URL remains blocked below.
      }
      void dialog
        .showMessageBox(window, {
          type: "question",
          buttons: ["Open link", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          title: "Open external link?",
          message: `Leave Doolittle and open ${destination}?`,
          detail: url,
          noLink: true,
        })
        .then((result) => {
          if (result.response === 0) void shell.openExternal(url);
        });
    }
    return { action: "deny" };
  });
  const rendererUrl = trustedDevRendererUrl(
    process.env.DOOLITTLE_RENDERER_URL,
    app.isPackaged,
  );
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererNavigation(url, rendererUrl)) event.preventDefault();
  });
  window.webContents.on("will-prevent-unload", (event) => {
    const result = dialog.showMessageBoxSync(window, {
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
    { displayBounds },
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

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.setActivationPolicy("regular");
    await app.dock.show();
  }
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
  // Eliza's OAuth/account-storage helpers resolve their state root from
  // ELIZA_HOME. Bind the desktop main process to the same private data root
  // passed to the backend so newly saved accounts appear in the live pool.
  process.env.ELIZA_HOME ??= runtimeDataDir;
  ensureDesktopRuntimeState(
    runtimeDataDir,
    sourceRepoRoot ? resolve(sourceRepoRoot, ".doolittle") : undefined,
  );
  const requestedWorkspaceOverride = process.env.DOOLITTLE_DESKTOP_CWD?.trim();
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
  updates = new DesktopUpdateController(
    app.isPackaged ? configuredUpdater() : null,
    app.isPackaged
      ? "Updates are unavailable in this packaged build."
      : "Updates are only available in a packaged, signed Doolittle build.",
  );
  backend = new BackendManager(
    target,
    runtimeDataDir,
    workspaceState.getState().currentPath || fallbackWorkspace,
  );
  mainWindow = createWindow();
  const providerAuth = new ProviderAuthController({
    openExternal: (url) => shell.openExternal(url),
    readClipboardText: () => clipboard.readText(),
  });
  installApplicationMenu();
  installTray();
  disposeIpc = registerIpc({
    ipcMain,
    backend,
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
    sensitiveActionDependencies: { notify: showBackgroundNotification },
    pickChatAttachments: () => pickChatAttachments(runtimeDataDir),
    pickProjectFiles,
    pickProjectFolders,
    importRecordedAudio: (request) =>
      importRecordedAudio(request, runtimeDataDir),
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
  void backend.start();

  app.on("activate", () => {
    if (!mainWindow) {
      mainWindow = createWindow();
      return;
    }
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  });
});

app.on("before-quit", (event) => {
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  tray?.destroy();
  tray = null;
  void backend.stop().finally(() => {
    disposeIpc?.();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
