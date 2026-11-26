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

  const focusBy = (delta: number): void => {
    syncFocusIndexFromCurrentFocus();
    const nextIndex =
      (getFocusIndex() + delta + focusables.length) % focusables.length;
    setFocusIndex(nextIndex);
    const nextTarget = focusables[nextIndex];
    if (nextTarget === inputBox) {
      activateTextEntry(inputBox);
    } else {
      if (screen.focused === inputBox) {
        deactivateTextEntry(inputBox);
      }
      nextTarget?.focus?.();
    }
    updateFooterHint();
    screen.render();
  };

  const blockedByOverlay = () => isPaletteOpen() || isComposerOpen();

  screen.key(["C-s"], () => {
    if (blockedByOverlay()) return;
    if (screen.focused === inputBox) {
      deactivateTextEntry(inputBox);
    }
    response.focus?.();
    updateFooterHint();
    screen.render();
  });

  screen.key(["C-p"], () => {
    if (blockedByOverlay()) return;
    overlays.openPalette(inputBox.getValue());
  });

  screen.key(["C-e"], () => {
    if (blockedByOverlay()) return;
    overlays.openComposer(inputBox.getValue());
  });

  screen.key(["tab"], () => {
    if (isComposerOpen()) return;
    if (isPaletteOpen()) {
      deactivateTextEntry(paletteInput);
      paletteList.focus?.();
      updateFooterHint();
      screen.render();
      return;
    }
    focusBy(1);
  });

  screen.key(["S-tab"], () => {
    if (isComposerOpen()) return;
    if (isPaletteOpen()) {
      activateTextEntry(paletteInput);
      updateFooterHint();
      screen.render();
      return;
    }
    focusBy(-1);
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
