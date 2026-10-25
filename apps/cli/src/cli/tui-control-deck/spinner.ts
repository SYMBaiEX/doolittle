import { renderFooterContent } from "./footer";
import type { TuiControlDeckOptions, TuiControlDeckState } from "./types";

export function startBusySpinner(
  options: Pick<
    TuiControlDeckOptions,
    "screen" | "footer" | "getBusyFrames" | "buildFooterContent"
  >,
  state: TuiControlDeckState,
): void {
  if (state.busySpinnerTimer) {
    return;
  }
  state.busySpinnerTimer = setInterval(() => {
    const frames = options.getBusyFrames();
    state.busyFrameIndex =
      frames.length > 0 ? (state.busyFrameIndex + 1) % frames.length : 0;
    options.footer.setContent(renderFooterContent(options, state));
    options.screen.render();
  }, 120);
}

export function stopBusySpinner(state: TuiControlDeckState): void {
  if (!state.busySpinnerTimer) {
    return;
  }
  clearInterval(state.busySpinnerTimer);
  state.busySpinnerTimer = null;
  state.busyFrameIndex = 0;
}
