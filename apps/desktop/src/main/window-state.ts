import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { asRecord } from "@elizaos/shared/type-guards";

export const MIN_WINDOW_WIDTH = 920;
export const MIN_WINDOW_HEIGHT = 620;

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
  defaultState?: PersistedWindowState;
  debounceMs?: number;
}

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

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value)
  );
}

function sanitizeWindowState(
  state: PersistedWindowState,
  options: Required<WindowStatePersistenceOptions>,
): PersistedWindowState {
  const bounds = sanitizeWindowBounds(state.bounds, options);
  return {
    bounds,
    isMaximized: Boolean(state.isMaximized),
  };
}

function sanitizeWindowBounds(
  raw: WindowBounds,
  options: Required<WindowStatePersistenceOptions>,
): WindowBounds {
  const minWidth = options.minWidth;
  const minHeight = options.minHeight;
  const displayBounds = options.displayBounds;
  const marginX = Math.max(1_000, Math.floor(displayBounds.width * 0.25));
  const marginY = Math.max(1_000, Math.floor(displayBounds.height * 0.25));
  const maxWidth = Math.max(minWidth, displayBounds.width * 4);
  const maxHeight = Math.max(minHeight, displayBounds.height * 4);
  const maxX = Math.max(
    displayBounds.x + displayBounds.width + marginX,
    10_000,
  );
  const minX = Math.min(displayBounds.x - marginX, -10_000);
  const maxY = Math.max(
    displayBounds.y + displayBounds.height + marginY,
    10_000,
  );
  const minY = Math.min(displayBounds.y - marginY, -10_000);

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

  if (
    width < minWidth ||
    height < minHeight ||
    width > maxWidth ||
    height > maxHeight ||
    x < minX ||
    x > maxX ||
    y < minY ||
    y > maxY
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
  const normalizedOptions: Required<WindowStatePersistenceOptions> = {
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    displayBounds: DEFAULT_DISPLAY_BOUNDS,
    defaultState: DEFAULT_WINDOW_STATE,
    debounceMs: 150,
    ...options,
  };

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
  const normalizedOptions: Required<WindowStatePersistenceOptions> = {
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    displayBounds: DEFAULT_DISPLAY_BOUNDS,
    defaultState: DEFAULT_WINDOW_STATE,
    debounceMs: 150,
    ...options,
  };

  const normalizedState = sanitizeWindowState(state, normalizedOptions);
  writeJsonAtomicSync(statePath, normalizedState, { trailingNewline: true });
}

export function createWindowStatePersistenceController(
  window: PersistableWindow,
  statePath: string,
  options: WindowStatePersistenceOptions = {},
): WindowStateController {
  const normalizedOptions: Required<WindowStatePersistenceOptions> = {
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    displayBounds: DEFAULT_DISPLAY_BOUNDS,
    defaultState: DEFAULT_WINDOW_STATE,
    debounceMs: 150,
    ...options,
  };

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
