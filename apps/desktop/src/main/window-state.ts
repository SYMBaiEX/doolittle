import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { asRecord } from "@elizaos/shared/type-guards";

// Keep the native window aligned with the renderer's narrowest supported
// layout instead of clamping before the mobile shell can ever activate.
export const MIN_WINDOW_WIDTH = 360;
export const MIN_WINDOW_HEIGHT = 480;
const MIN_VISIBLE_WINDOW_EDGE = 64;

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PersistedWindowState {
  bounds: WindowBounds;
  isMaximized: boolean;
}

export interface WindowStatePersistenceOptions {
  minWidth?: number;
  minHeight?: number;
  displayBounds?: WindowBounds;
  displayWorkAreas?: WindowBounds[];
  defaultState?: PersistedWindowState;
  debounceMs?: number;
}

type NormalizedWindowStatePersistenceOptions = {
  minWidth: number;
  minHeight: number;
  displayBounds: WindowBounds;
  displayWorkAreas: WindowBounds[];
  defaultState: PersistedWindowState;
  debounceMs: number;
};

export interface PersistableWindow {
  getBounds(): WindowBounds;
  isMaximized(): boolean;
}

export interface WindowStateController {
  getState: () => PersistedWindowState;
  requestPersist: () => void;
  flush: () => void;
  stop: () => void;
  loadSavedState: () => PersistedWindowState;
}

export const DEFAULT_DISPLAY_BOUNDS: WindowBounds = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
};

export const DEFAULT_WINDOW_STATE: PersistedWindowState = {
  bounds: {
    x: 100,
    y: 100,
    width: 1320,
    height: 860,
  },
  isMaximized: false,
};

function normalizeWindowStateOptions(
  options: WindowStatePersistenceOptions,
): NormalizedWindowStatePersistenceOptions {
  const displayBounds = options.displayBounds ?? DEFAULT_DISPLAY_BOUNDS;
  return {
    minWidth: options.minWidth ?? MIN_WINDOW_WIDTH,
    minHeight: options.minHeight ?? MIN_WINDOW_HEIGHT,
    displayBounds,
    displayWorkAreas:
      options.displayWorkAreas && options.displayWorkAreas.length > 0
        ? options.displayWorkAreas
        : [displayBounds],
    defaultState: options.defaultState ?? DEFAULT_WINDOW_STATE,
    debounceMs: options.debounceMs ?? 150,
  };
}

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isSafeInteger(value)
  );
}

function sanitizeWindowState(
  state: PersistedWindowState,
  options: NormalizedWindowStatePersistenceOptions,
): PersistedWindowState {
  const bounds = sanitizeWindowBounds(state.bounds, options);
  return {
    bounds,
    isMaximized: Boolean(state.isMaximized),
  };
}

function sanitizeWindowBounds(
  raw: WindowBounds,
  options: NormalizedWindowStatePersistenceOptions,
): WindowBounds {
  const minWidth = options.minWidth;
  const minHeight = options.minHeight;
  const displayBounds = options.displayBounds;
  const maxWidth = Math.max(minWidth, displayBounds.width * 4);
  const maxHeight = Math.max(minHeight, displayBounds.height * 4);

  const x = raw.x;
  const y = raw.y;
  let width = raw.width;
  let height = raw.height;

  if (
    !isFiniteInteger(x) ||
    !isFiniteInteger(y) ||
    !isFiniteInteger(width) ||
    !isFiniteInteger(height)
  ) {
    return options.defaultState.bounds;
  }

  width = Math.max(minWidth, width);
  height = Math.max(minHeight, height);
  const windowRight = x + width;
  const windowBottom = y + height;
  const hasVisibleArea = options.displayWorkAreas.some((workArea) => {
    const displayRight = workArea.x + workArea.width;
    const displayBottom = workArea.y + workArea.height;
    return (
      windowRight >= workArea.x + MIN_VISIBLE_WINDOW_EDGE &&
      x <= displayRight - MIN_VISIBLE_WINDOW_EDGE &&
      windowBottom >= workArea.y + MIN_VISIBLE_WINDOW_EDGE &&
      y <= displayBottom - MIN_VISIBLE_WINDOW_EDGE
    );
  });

  if (
    width < minWidth ||
    height < minHeight ||
    width > maxWidth ||
    height > maxHeight ||
    !hasVisibleArea
  ) {
    return options.defaultState.bounds;
  }

  return {
    x,
    y,
    width,
    height,
  };
}

export function loadWindowState(
  statePath: string,
  options: WindowStatePersistenceOptions = {},
): PersistedWindowState {
  const normalizedOptions = normalizeWindowStateOptions(options);

  const raw = asRecord(readJsonFileSync<unknown>(statePath));
  if (!raw) return normalizedOptions.defaultState;

  const boundsRaw = asRecord(raw.bounds);
  if (!boundsRaw) return normalizedOptions.defaultState;

  const x = boundsRaw.x;
  const y = boundsRaw.y;
  const width = boundsRaw.width;
  const height = boundsRaw.height;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return normalizedOptions.defaultState;
  }

  const rawState: PersistedWindowState = {
    bounds: { x, y, width, height },
    isMaximized: typeof raw.isMaximized === "boolean" ? raw.isMaximized : false,
  };

  const bounds = sanitizeWindowBounds(rawState.bounds, normalizedOptions);
  return sanitizeWindowState(
    {
      bounds,
      isMaximized: rawState.isMaximized,
    },
    normalizedOptions,
  );
}

export function persistWindowState(
  statePath: string,
  state: PersistedWindowState,
  options: WindowStatePersistenceOptions = {},
): void {
  const normalizedOptions = normalizeWindowStateOptions(options);

  const normalizedState = sanitizeWindowState(state, normalizedOptions);
  writeJsonAtomicSync(statePath, normalizedState, { trailingNewline: true });
}

export function createWindowStatePersistenceController(
  window: PersistableWindow,
  statePath: string,
  options: WindowStatePersistenceOptions = {},
): WindowStateController {
  const normalizedOptions = normalizeWindowStateOptions(options);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const getState = (): PersistedWindowState => {
    const bounds = sanitizeWindowBounds(window.getBounds(), normalizedOptions);
    return { bounds, isMaximized: Boolean(window.isMaximized()) };
  };

  const requestPersist = (): void => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        persistWindowState(statePath, getState(), normalizedOptions);
      } catch {
        // Persist failures should not crash the app loop from a simple handler.
      }
    }, normalizedOptions.debounceMs);
  };

  const flush = (): void => {
    if (disposed) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    persistWindowState(statePath, getState(), normalizedOptions);
  };

  const stop = (): void => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const loadSavedState = (): PersistedWindowState =>
    loadWindowState(statePath, normalizedOptions);

  return {
    getState,
    requestPersist,
    flush,
    stop,
    loadSavedState,
  };
}
