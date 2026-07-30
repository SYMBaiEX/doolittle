export interface DesktopWindowLoader {
  once(event: "ready-to-show", listener: () => void): unknown;
  loadFile(path: string): Promise<void>;
  loadURL(url: string): Promise<void>;
  maximize(): void;
  show(): void;
  focus(): void;
}

export interface DesktopWindowLoadOptions {
  rendererFile: string;
  rendererUrl?: string;
  revealTimeoutMs?: number;
  startMaximized: boolean;
}

export function loadDesktopWindow(
  window: DesktopWindowLoader,
  options: DesktopWindowLoadOptions,
): Promise<void> {
  let revealed = false;
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (revealTimer) clearTimeout(revealTimer);
    if (options.startMaximized) window.maximize();
    window.show();
    window.focus();
  };

  window.once("ready-to-show", reveal);
  revealTimer = setTimeout(reveal, options.revealTimeoutMs ?? 2_000);

  const load = options.rendererUrl
    ? window.loadURL(options.rendererUrl)
    : window.loadFile(options.rendererFile);

  return load.then(reveal, (error: unknown) => {
    reveal();
    throw error;
  });
}
