import { blockedByTextEntry } from "./guards";
import type { FocusableTarget, TuiScreenBindingsOptions } from "./types";

export function installFocusBindings(opts: TuiScreenBindingsOptions): void {
  const {
    screen,
    inputBox,
    response,
    paletteInput,
    paletteList,
    focusables,
    getFocusIndex,
    setFocusIndex,
    activateTextEntry,
    deactivateTextEntry,
    isPaletteOpen,
    isComposerOpen,
    updateFooterHint,
    overlays,
  } = opts;

  const syncFocusIndexFromCurrentFocus = (): void => {
    const current = screen.focused
      ? focusables.indexOf(screen.focused as FocusableTarget)
      : -1;
    if (current >= 0) {
      setFocusIndex(current);
    }
  };

  const focusAt = (index: number): void => {
    syncFocusIndexFromCurrentFocus();
    const nextIndex = (index + focusables.length) % focusables.length;
    setFocusIndex(nextIndex);
    const nextTarget = focusables[nextIndex];
    if (nextTarget === inputBox) {
      activateTextEntry(inputBox);
    } else {
      nextTarget?.focus?.();
    }
    screen.render();
  };

  screen.key(["C-s"], () => {
    if (blockedByTextEntry(opts)) return;
    response.focus?.();
    screen.render();
  });

  screen.key(["C-p"], () => {
    if (blockedByTextEntry(opts)) return;
    overlays.openPalette(inputBox.getValue());
  });

  screen.key(["C-e"], () => {
    if (blockedByTextEntry(opts)) return;
    overlays.openComposer(inputBox.getValue());
  });

  screen.key(["tab"], () => {
    if (isComposerOpen()) return;
    if (screen.focused === inputBox) return;
    if (isPaletteOpen()) {
      deactivateTextEntry(paletteInput);
      paletteList.focus?.();
      updateFooterHint();
      screen.render();
      return;
    }
    focusAt(getFocusIndex() + 1);
  });

  screen.key(["S-tab"], () => {
    if (isComposerOpen()) return;
    if (screen.focused === inputBox) return;
    if (isPaletteOpen()) {
      activateTextEntry(paletteInput);
      updateFooterHint();
      screen.render();
      return;
    }
    focusAt(getFocusIndex() - 1);
  });

  screen.key(["escape"], () => {
    if (isComposerOpen()) {
      overlays.closeComposer();
      return;
    }
    if (isPaletteOpen()) {
      overlays.closePalette();
      return;
    }
    activateTextEntry(inputBox);
    updateFooterHint();
    screen.render();
  });
}
