import type { TuiScreenBindingsOptions } from "./types";

type GuardOptions = Pick<
  TuiScreenBindingsOptions,
  "textEntryFocused" | "isPaletteOpen" | "isComposerOpen"
>;

export function blockedByTextEntry(opts: GuardOptions): boolean {
  return (
    opts.textEntryFocused() || opts.isPaletteOpen() || opts.isComposerOpen()
  );
}
