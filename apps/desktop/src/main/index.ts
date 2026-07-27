import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  Notification,
  screen,
  shell,
} from "electron";
import type { DesktopCommand, WorkspacePickResult } from "../shared/contracts";
import { importSelectedAttachments } from "./attachment-import";
import {
  BackendManager,
  findPackagedRuntime,
  findRepoRoot,
  sourceRuntimeTarget,
} from "./backend";
import { type DesktopBackgroundNotification, registerIpc } from "./ipc";
import {
  isTrustedRendererNavigation,
  trustedDevRendererUrl,
} from "./renderer-url";
import { ensureDesktopRuntimeState } from "./runtime-state";
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
let disposeIpc: (() => void) | null = null;
let quitting = false;

function sendAppCommand(command: DesktopCommand): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("app:command", command);
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

async function pickFiles() {
  const options = {
    title: "Add context to Doolittle",
    buttonLabel: "Add context",
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

async function pickChatAttachments(runtimeDataDir: string) {
  const options = {
    title: "Attach files to this message",
    buttonLabel: "Attach",
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
    properties: ["openDirectory", "dontAddToRecent"],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  const selection = workspaceState.applyPickerResult({
    canceled: result.canceled,
    filePaths: result.filePaths,
  });
  if (selection.canceled) return selection;
  await backend.switchWorkspace(selection.state.currentPath);
  return selection;
}

function pickWorkspace(): Promise<WorkspacePickResult> {
  if (workspacePickInFlight) return workspacePickInFlight;
  workspacePickInFlight = pickWorkspaceImpl().finally(() => {
    workspacePickInFlight = null;
  });
  return workspacePickInFlight;
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
      preload: resolve(__dirname, "../preload/preload.cjs"),
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

  void loadDesktopWindow(window, {
    rendererFile: resolve(__dirname, "../renderer/index.html"),
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
  window.on("closed", () => windowState.stop());
  return window;
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.setActivationPolicy("regular");
    await app.dock.show();
  }
  const sourceRoot = process.env.DOOLITTLE_DESKTOP_SOURCE_ROOT?.trim();
  const sourceRepoRoot = sourceRoot
    ? findRepoRoot([sourceRoot])
    : app.isPackaged
      ? null
      : findRepoRoot(
          [
            process.env.DOOLITTLE_REPO_ROOT || "",
            app.getAppPath(),
            process.cwd(),
            __dirname,
          ].filter(Boolean),
        );
  const packagedRuntime = app.isPackaged
    ? findPackagedRuntime(process.resourcesPath)
    : null;
  const target = packagedRuntime
    ? {
        ...packagedRuntime,
        repoRoot: sourceRepoRoot ?? packagedRuntime.repoRoot,
      }
    : sourceRuntimeTarget(
        sourceRepoRoot ??
          findRepoRoot([app.getAppPath(), process.cwd(), __dirname]),
      );
  const runtimeDataDir = resolve(app.getPath("userData"), "runtime");
  ensureDesktopRuntimeState(
    runtimeDataDir,
    sourceRepoRoot ? resolve(sourceRepoRoot, ".doolittle") : undefined,
  );
  const requestedWorkspace =
    process.env.DOOLITTLE_DESKTOP_CWD?.trim() || homedir();
  let fallbackWorkspace = homedir();
  try {
    fallbackWorkspace = normalizeWorkspaceDirectory(requestedWorkspace);
  } catch {
    // Invalid environment overrides must not prevent the desktop from opening.
  }
  workspaceState = new WorkspaceStateManager(
    resolve(app.getPath("userData"), "workspace-state.json"),
    fallbackWorkspace,
  );
  backend = new BackendManager(
    target,
    runtimeDataDir,
    workspaceState.getState().currentPath,
  );
  mainWindow = createWindow();
  installApplicationMenu();
  disposeIpc = registerIpc(
    ipcMain,
    backend,
    () => mainWindow,
    pickFiles,
    {
      getState: () =>
        workspaceState?.getState() ?? { currentPath: "", recentPaths: [] },
      pickWorkspace,
      subscribe: (listener) =>
        workspaceState?.subscribe(listener) ?? (() => undefined),
    },
    { notify: showBackgroundNotification },
    () => pickChatAttachments(runtimeDataDir),
  );
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
  void backend.stop().finally(() => {
    disposeIpc?.();
    app.quit();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
