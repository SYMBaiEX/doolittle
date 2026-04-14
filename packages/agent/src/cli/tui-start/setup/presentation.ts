import type { TuiStartAssemblyState } from "../assembly-state";
import { createTuiStartPresentation } from "../boot/presentation";
import type { TuiStartSetupOptions } from "./types";

interface TuiStartPresentationSetupOptions {
  options: TuiStartSetupOptions;
  assemblyState: TuiStartAssemblyState;
  appendActivity: (
    kind: string,
    message: string,
    tone: import("@/cli/execution").CliExecutionResult["tone"],
  ) => void;
  flushDeferredForeignActivity: () => void;
}

export function createTuiStartPresentationSetup({
  options,
  assemblyState,
  appendActivity,
  flushDeferredForeignActivity,
}: TuiStartPresentationSetupOptions) {
  const presentation = createTuiStartPresentation({
    context: options.context,
    state: options.state,
    screen: options.screen,
    widgets: options.widgets,
    tuiState: options.tuiState,
    logger: options.logger.child("presentation"),
    getActiveTheme: options.getActiveTheme,
    setActiveTheme: options.setActiveTheme,
    appendActivity,
    flushDeferredForeignActivity,
    truncate: options.truncate,
  });

  assemblyState.setUpdateFooterHint(presentation.updateFooterHint);
  assemblyState.setRefreshPanels(() => presentation.refreshPanels());
  assemblyState.setScheduleRefreshPanels((delayMs = 120) => {
    presentation.scheduleRefreshPanels(delayMs);
  });

  return presentation;
}
