import { installActionBindings } from "./actions";
import { installDeckBindings } from "./deck";
import { installFocusBindings } from "./focus";
import { installScrollBindings } from "./scroll";
import type { TuiScreenBindingsOptions } from "./types";

export type {
  FocusableTarget,
  ScreenBindingTarget,
  TuiScreenBindingsOptions,
} from "./types";

const SCREEN_OWNED_KEYS = [
  "C-q",
  "C-c",
  "C-s",
  "C-p",
  "C-e",
  "tab",
  "S-tab",
  "pageup",
  "pagedown",
  "C-u",
  "C-d",
  "C-t",
  "C-y",
  "C-l",
  "C-x",
  "C-r",
  "C-o",
  "C-g",
  "C-b",
  "M-1",
  "M-2",
  "M-3",
  "M-4",
  "M-5",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
];

function installScreenKeyOwnership(opts: TuiScreenBindingsOptions): void {
  // blessed text entry grabs keys while readInput() is active. ignoreLocked is
  // blessed's narrow escape hatch: these non-printing cockpit commands still
  // reach screen bindings first, while printable text continues to the entry.
  const screen = opts.screen as TuiScreenBindingsOptions["screen"] & {
    ignoreLocked?: string[];
  };
  const existing = Array.isArray(screen.ignoreLocked)
    ? screen.ignoreLocked
    : [];
  screen.ignoreLocked = [...new Set([...existing, ...SCREEN_OWNED_KEYS])];
}

function installLifecycleBindings(opts: TuiScreenBindingsOptions): void {
  const { screen, lifecycle } = opts;

  screen.key(["C-q"], () => lifecycle.exitCli());
  screen.key(["C-c"], () => lifecycle.handleSigint());
  // Bare q deliberately has no binding. Once pane traversal works, q is just
  // another keypress on non-text surfaces and is too easy to hit accidentally;
  // process exit stays on the explicit Ctrl-Q/Ctrl-C lifecycle paths.
}

export function installTuiScreenBindings(
  options: TuiScreenBindingsOptions,
): void {
  installScreenKeyOwnership(options);
  installLifecycleBindings(options);
  installFocusBindings(options);
  installDeckBindings(options);
  installScrollBindings(options);
  installActionBindings(options);
}
