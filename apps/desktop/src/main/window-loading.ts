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
  startMaximized: boolean;
}

export function loadDesktopWindow(
  window: DesktopWindowLoader,
  options: DesktopWindowLoadOptions,
): Promise<void> {
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (options.startMaximized) window.maximize();
    window.show();
    window.focus();
  };

  window.once("ready-to-show", reveal);

  const load = options.rendererUrl
    ? window.loadURL(options.rendererUrl)
    : window.loadFile(options.rendererFile);

  return load.then(reveal);
}
