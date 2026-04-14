import { blockedByTextEntry } from "./guards";
import type { TuiScreenBindingsOptions } from "./types";

export function installScrollBindings(opts: TuiScreenBindingsOptions): void {
  const { screen, response, activity, sidebar, assistBox } = opts;

  const scrollFocusedPane = (delta: number): void => {
    const target =
      screen.focused === response
        ? response
        : screen.focused === sidebar
          ? sidebar
          : screen.focused === assistBox
            ? assistBox
            : activity;
    target.scroll?.(delta);
    screen.render();
  };

  screen.key(["pageup"], () => scrollFocusedPane(-8));
  screen.key(["pagedown"], () => scrollFocusedPane(8));
  screen.key(["C-u"], () => {
    if (blockedByTextEntry(opts)) return;
    scrollFocusedPane(-8);
  });
  screen.key(["C-d"], () => {
    if (blockedByTextEntry(opts)) return;
    scrollFocusedPane(8);
  });
}
