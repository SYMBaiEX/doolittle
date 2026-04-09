import type blessed from "blessed";

export interface WizardScreenEventHandlers {
  onResize: () => void;
  onWarning: (warning: unknown) => void;
  onAbort: () => void;
}

export function installWizardScreenEvents(
  screen: blessed.Widgets.Screen,
  handlers: WizardScreenEventHandlers,
): void {
  screen.on("resize", handlers.onResize);
  screen.on("warning", handlers.onWarning);
  screen.key(["C-c"], () => {
    screen.destroy();
    handlers.onAbort();
  });
}
