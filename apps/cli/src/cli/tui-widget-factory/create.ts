import { createChromeWidgets } from "./chrome";
import { resolveTuiWidgetAssemblyContext } from "./context";
import { createOverlayWidgets } from "./overlays";
import { createPanelWidgets } from "./panels";
import type { TuiWidgetFactoryOptions, TuiWidgetSet } from "./types";

export function createTuiWidgets(
  options: TuiWidgetFactoryOptions,
): TuiWidgetSet {
  const context = resolveTuiWidgetAssemblyContext(options);

  return {
    ...createChromeWidgets(context),
    ...createPanelWidgets(context),
    ...createOverlayWidgets(context),
  };
}
