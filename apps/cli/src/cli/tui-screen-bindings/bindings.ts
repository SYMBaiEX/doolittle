import { installActionBindings } from "./actions";
import { installDeckBindings } from "./deck";
import { installFocusBindings } from "./focus";
import { blockedByTextEntry } from "./guards";
import { installScrollBindings } from "./scroll";
import type { TuiScreenBindingsOptions } from "./types";

export type {
  FocusableTarget,
  ScreenBindingTarget,
  TuiScreenBindingsOptions,
} from "./types";

function installLifecycleBindings(opts: TuiScreenBindingsOptions): void {
  const { screen, lifecycle } = opts;

  screen.key(["C-q"], () => lifecycle.exitCli());
  screen.key(["C-c"], () => lifecycle.handleSigint());
  screen.key(["q"], () => {
    if (blockedByTextEntry(opts)) return;
    lifecycle.exitCli();
  });
}

export function installTuiScreenBindings(
  options: TuiScreenBindingsOptions,
): void {
  installLifecycleBindings(options);
  installFocusBindings(options);
  installDeckBindings(options);
  installScrollBindings(options);
  installActionBindings(options);
}
