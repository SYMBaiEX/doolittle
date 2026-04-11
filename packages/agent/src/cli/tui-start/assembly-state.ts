export interface TuiStartAssemblyHintOptions {
  flushForeign?: boolean;
  render?: boolean;
}

export interface TuiStartAssemblyState {
  refreshPanels: () => Promise<void>;
  scheduleRefreshPanels: (delayMs?: number) => void;
  updateFooterHint: (options?: TuiStartAssemblyHintOptions) => void;
  queueCommand: (line: string) => void;
  setRefreshPanels: (next: () => Promise<void>) => void;
  setScheduleRefreshPanels: (next: (delayMs?: number) => void) => void;
  setUpdateFooterHint: (
    next: (options?: TuiStartAssemblyHintOptions) => void,
  ) => void;
  setQueueCommand: (next: (line: string) => void) => void;
}

export function createTuiStartAssemblyState(): TuiStartAssemblyState {
  let refreshPanels: () => Promise<void> = async () => {};
  let scheduleRefreshPanels: (delayMs?: number) => void = () => {};
  let updateFooterHint: (options?: TuiStartAssemblyHintOptions) => void =
    () => {};
  let queueCommand: (line: string) => void = () => {};

  return {
    refreshPanels: () => refreshPanels(),
    scheduleRefreshPanels: (delayMs?: number) => scheduleRefreshPanels(delayMs),
    updateFooterHint: (options?: TuiStartAssemblyHintOptions) =>
      updateFooterHint(options),
    queueCommand: (line: string) => queueCommand(line),
    setRefreshPanels: (next: () => Promise<void>) => {
      refreshPanels = next;
    },
    setScheduleRefreshPanels: (next: (delayMs?: number) => void) => {
      scheduleRefreshPanels = next;
    },
    setUpdateFooterHint: (
      next: (options?: TuiStartAssemblyHintOptions) => void,
    ) => {
      updateFooterHint = next;
    },
    setQueueCommand: (next: (line: string) => void) => {
      queueCommand = next;
    },
  };
}
