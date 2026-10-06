import type {
  BrowserWindow,
  ContextMenuParams,
  Event,
  Menu,
  MenuItemConstructorOptions,
} from "electron";

interface MainWindowContextMenuDependencies {
  buildMenu: (
    items: MenuItemConstructorOptions[],
  ) => Pick<Menu, "popup" | "closePopup">;
  copyLink: (url: string) => void;
  openLink: (url: string) => Promise<unknown>;
}

/** The external-link policy is deliberately narrower than arbitrary clipboard text. */
export function contextMenuHttpsLink(value: string): string | null {
  if (!value || value.length > 4_096) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Uses Chromium's edit flags, not renderer-provided text or application commands. */
export function mainWindowContextMenuItems(
  params: Pick<
    ContextMenuParams,
    "isEditable" | "editFlags" | "selectionText" | "formControlType" | "linkURL"
  >,
  dependencies: Pick<
    MainWindowContextMenuDependencies,
    "copyLink" | "openLink"
  >,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const flags = params.editFlags;
  const password = params.formControlType === "input-password";
  if (params.isEditable) {
    items.push(
      { role: "undo", enabled: flags.canUndo },
      { role: "redo", enabled: flags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: flags.canCut && !password },
      { role: "copy", enabled: flags.canCopy && !password },
      { role: "paste", enabled: flags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: flags.canSelectAll },
    );
  } else if (params.selectionText.length > 0 && flags.canCopy && !password) {
    items.push({ role: "copy" });
    if (flags.canSelectAll) items.push({ role: "selectAll" });
  }
  const link = contextMenuHttpsLink(params.linkURL);
  if (link) {
    if (items.length) items.push({ type: "separator" });
    items.push(
      { label: "Copy link", click: () => dependencies.copyLink(link) },
      {
        label: "Open link in browser…",
        click: () => {
          // The host performs its existing protected confirmation. A failed open
          // must not create an unhandled rejection or block subsequent menus.
          void dependencies.openLink(link).catch(() => undefined);
        },
      },
    );
  }
  return items;
}

/**
 * Numeric coordinates and a selection boolean are the only interpolated values.
 * The read-only result contains no input values, selected text or DOM metadata.
 * Specialized surfaces keep their own menus and permission-sensitive editing.
 */
export function nativeContextMenuTargetScript(
  x: number,
  y: number,
  hasSelection: boolean,
): string | null {
  if (
    ![x, y].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000,
    )
  )
    return null;
  return `(() => {
    let target = document.elementFromPoint(${x}, ${y});
    if (!target) return false;
    const ancestors = [];
    while (target) {
      ancestors.push(target);
      const root = target.getRootNode();
      target = root instanceof ShadowRoot ? root.host : null;
    }
    if (ancestors.some(element => element.closest('.monaco-editor,.xterm,iframe,webview'))) return false;
    if (${hasSelection ? "true" : "false"} || ancestors.some(element => element.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),a[href],[data-native-context-menu]'))) return true;
    return !ancestors.some(element => element.closest('[data-doolittle-context-menu]'));
  })()`;
}

/** Register only on the host's main window, never hidden browser or community views. */
export function registerMainWindowContextMenu(
  window: BrowserWindow,
  dependencies: MainWindowContextMenuDependencies,
): () => void {
  const contents = window.webContents;
  let revision = 0;
  let disposed = false;
  let menu: Pick<Menu, "popup" | "closePopup"> | null = null;
  const invalidate = () => {
    revision += 1;
    const previous = menu;
    menu = null;
    // Electron closes native menus with their window. Do not pass a destroyed
    // BrowserWindow to closePopup during renderer/window teardown.
    if (previous && !window.isDestroyed()) previous.closePopup(window);
  };
  const current = (expected: number, params: ContextMenuParams) =>
    !disposed &&
    revision === expected &&
    !window.isDestroyed() &&
    window.isVisible() &&
    !contents.isDestroyed() &&
    params.frame === contents.mainFrame &&
    params.pageURL === contents.getURL();
  const show = async (event: Event, params: ContextMenuParams) => {
    invalidate();
    const expected = revision;
    if (event.defaultPrevented || !current(expected, params)) return;
    const script = nativeContextMenuTargetScript(
      params.x,
      params.y,
      params.selectionText.length > 0,
    );
    if (!script) return;
    const items = mainWindowContextMenuItems(params, dependencies);
    if (!items.length) return;
    const allowed = await contents.executeJavaScript(script);
    if (allowed !== true || !current(expected, params)) return;
    event.preventDefault();
    const next = dependencies.buildMenu(items);
    menu = next;
    next.popup({
      window,
      frame: contents.mainFrame,
      x: params.x,
      y: params.y,
      sourceType: params.menuSourceType,
      callback: () => {
        if (menu === next) menu = null;
      },
    });
  };
  const onContextMenu = (event: Event, params: ContextMenuParams) => {
    // Renderer teardown and blocked scripts simply leave this optional fallback closed.
    void show(event, params).catch(() => undefined);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    invalidate();
    contents.removeListener("context-menu", onContextMenu);
    contents.removeListener("did-start-navigation", invalidate);
    contents.removeListener("destroyed", dispose);
  };
  contents.on("context-menu", onContextMenu);
  contents.on("did-start-navigation", invalidate);
  contents.once("destroyed", dispose);
  return dispose;
}
