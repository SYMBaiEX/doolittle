import type { ControlDeckMode } from "@/cli/tui-control-deck";
import { blockedByTextEntry } from "./guards";
import type { TuiScreenBindingsOptions } from "./types";

export function installDeckBindings(opts: TuiScreenBindingsOptions): void {
  const { screen, setControlDeckMode, refreshPanels } = opts;

  const setDeckMode = (mode: ControlDeckMode): void => {
    if (blockedByTextEntry(opts)) return;
    setControlDeckMode(mode);
    void refreshPanels();
  };

  screen.key(["C-g"], () => setDeckMode("gateway"));
  screen.key(["C-b"], () => setDeckMode("jobs"));
  screen.key(["M-1"], () => setDeckMode("assist"));
  screen.key(["M-2"], () => setDeckMode("ecosystem"));
  screen.key(["M-3"], () => setDeckMode("gateway"));
  screen.key(["M-4"], () => setDeckMode("responses"));
  screen.key(["M-5"], () => setDeckMode("jobs"));
}
