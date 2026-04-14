import type { TuiCommandQueueState } from "@/cli/tui-command-queue";
import type { ControlDeckMode } from "@/cli/tui-control-deck";
import type { TuiLifecycleState } from "@/cli/tui-lifecycle/types";
import type { TuiOverlayState } from "@/cli/tui-overlays";

export interface TuiStateStore {
  screenDestroyed: boolean;
  busy: boolean;
  queueDepth: number;
  opsCollapsed: boolean;
  controlDeckMode: ControlDeckMode;
  paletteSelectionIndex: number;
  composerOpen: boolean;
  activeTurnAbortController: AbortController | null;
  lastInterruptAt: number;
  paletteOpen: boolean;
  focusIndex: number;
  shuttingDown: boolean;
  requestedExitCode: number;
  exitAfterTurnCancellation: boolean;
  forceExitTimer: ReturnType<typeof setTimeout> | null;
  deferredForeignRefreshTimer: ReturnType<typeof setTimeout> | null;
  lastTextEntryAt: number;
}

interface CreateTuiStateOptions {
  initialFocusIndex: number;
}

interface TuiStateHandle {
  state: TuiStateStore;
  lifecycleState: TuiLifecycleState;
  queueState: TuiCommandQueueState;
  overlayState: TuiOverlayState;
}

export function createTuiState(options: CreateTuiStateOptions): TuiStateHandle {
  const state: TuiStateStore = {
    screenDestroyed: false,
    busy: false,
    queueDepth: 0,
    opsCollapsed: true,
    controlDeckMode: "assist",
    paletteSelectionIndex: 0,
    composerOpen: false,
    activeTurnAbortController: null,
    lastInterruptAt: 0,
    paletteOpen: false,
    focusIndex: options.initialFocusIndex,
    shuttingDown: false,
    requestedExitCode: 0,
    exitAfterTurnCancellation: false,
    forceExitTimer: null,
    deferredForeignRefreshTimer: null,
    lastTextEntryAt: 0,
  };

  const lifecycleState: TuiLifecycleState = {
    get screenDestroyed() {
      return state.screenDestroyed;
    },
    set screenDestroyed(value) {
      state.screenDestroyed = value;
    },
    get shuttingDown() {
      return state.shuttingDown;
    },
    set shuttingDown(value) {
      state.shuttingDown = value;
    },
    get requestedExitCode() {
      return state.requestedExitCode;
    },
    set requestedExitCode(value) {
      state.requestedExitCode = value;
    },
    get exitAfterTurnCancellation() {
      return state.exitAfterTurnCancellation;
    },
    set exitAfterTurnCancellation(value) {
      state.exitAfterTurnCancellation = value;
    },
    get forceExitTimer() {
      return state.forceExitTimer;
    },
    set forceExitTimer(value) {
      state.forceExitTimer = value;
    },
    get lastInterruptAt() {
      return state.lastInterruptAt;
    },
    set lastInterruptAt(value) {
      state.lastInterruptAt = value;
    },
    get activeTurnAbortController() {
      return state.activeTurnAbortController;
    },
    set activeTurnAbortController(value) {
      state.activeTurnAbortController = value;
    },
    get busy() {
      return state.busy;
    },
    set busy(value) {
      state.busy = value;
    },
  };

  const queueState: TuiCommandQueueState = {
    get busy() {
      return state.busy;
    },
    set busy(value) {
      state.busy = value;
    },
    get queueDepth() {
      return state.queueDepth;
    },
    set queueDepth(value) {
      state.queueDepth = value;
    },
    get activeTurnAbortController() {
      return state.activeTurnAbortController;
    },
    set activeTurnAbortController(value) {
      state.activeTurnAbortController = value;
    },
    get exitAfterTurnCancellation() {
      return state.exitAfterTurnCancellation;
    },
    set exitAfterTurnCancellation(value) {
      state.exitAfterTurnCancellation = value;
    },
    get requestedExitCode() {
      return state.requestedExitCode;
    },
    set requestedExitCode(value) {
      state.requestedExitCode = value;
    },
    get screenDestroyed() {
      return state.screenDestroyed;
    },
    set screenDestroyed(value) {
      state.screenDestroyed = value;
    },
  };

  const overlayState: TuiOverlayState = {
    get paletteOpen() {
      return state.paletteOpen;
    },
    set paletteOpen(value) {
      state.paletteOpen = value;
    },
    get composerOpen() {
      return state.composerOpen;
    },
    set composerOpen(value) {
      state.composerOpen = value;
    },
    get paletteSelectionIndex() {
      return state.paletteSelectionIndex;
    },
    set paletteSelectionIndex(value) {
      state.paletteSelectionIndex = value;
    },
  };

  return {
    state,
    lifecycleState,
    queueState,
    overlayState,
  };
}
