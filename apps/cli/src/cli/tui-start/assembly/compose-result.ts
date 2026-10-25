import type { TuiStartAssemblyHintOptions } from "../assembly-state";
import type { TuiStartSetupResult } from "../setup";
import type { TuiStartAssemblyResult } from "./types";

export interface TuiStartResultComposition {
  surfaces: TuiStartSetupResult;
  disposeControllers: () => void;
  bootstrapUnsubscribers: Array<() => void>;
}

export function composeTuiStartAssemblyResult({
  surfaces,
  disposeControllers,
  bootstrapUnsubscribers,
}: TuiStartResultComposition): TuiStartAssemblyResult {
  return {
    appendActivity: surfaces.appendActivity,
    pushNotice: surfaces.pushNotice,
    pushResponseEntry: surfaces.pushResponseEntry,
    refreshPanels: () => surfaces.refreshPanels(),
    scheduleRefreshPanels: (delayMs?: number) => {
      surfaces.scheduleRefreshPanels(delayMs);
    },
    updateFooterHint: (options?: TuiStartAssemblyHintOptions) => {
      surfaces.updateFooterHint(options);
    },
    syncLayout: surfaces.syncLayout,
    renderCurrentControlDeck: surfaces.renderCurrentControlDeck,
    renderTransportPanel: surfaces.renderTransportPanel,
    renderExecutionPanel: surfaces.renderExecutionPanel,
    applyTheme: surfaces.applyTheme,
    activatePrimaryInput: surfaces.activatePrimaryInput,
    logFatal: surfaces.logFatal,
    dispose: () => {
      surfaces.dispose();
      disposeControllers();
      for (const unsubscribe of bootstrapUnsubscribers) {
        unsubscribe();
      }
    },
  };
}
