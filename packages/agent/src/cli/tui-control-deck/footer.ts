import type {
  FooterUpdateOptions,
  TuiControlDeckOptions,
  TuiControlDeckState,
} from "./types";

export function currentBusyFrame(
  getBusyFrames: TuiControlDeckOptions["getBusyFrames"],
  busyFrameIndex: number,
): string {
  const frames = getBusyFrames();
  if (frames.length === 0) {
    return "•";
  }
  return frames[busyFrameIndex % frames.length] ?? "•";
}

export function resolveFooterHint(
  options: Pick<
    TuiControlDeckOptions,
    | "screen"
    | "responsePane"
    | "activityPane"
    | "sidebarPane"
    | "assistBox"
    | "inputBox"
    | "paletteList"
    | "getCurrentMode"
    | "isPaletteOpen"
    | "isComposerOpen"
    | "formatKeyLabel"
  >,
): string {
  const {
    screen,
    responsePane,
    activityPane,
    sidebarPane,
    assistBox,
    inputBox,
    paletteList,
    getCurrentMode,
    isPaletteOpen,
    isComposerOpen,
    formatKeyLabel,
  } = options;

  if (isComposerOpen()) {
    return formatKeyLabel("Ctrl-S submit draft");
  }
  if (isPaletteOpen()) {
    return screen.focused === paletteList
      ? "Enter run selected"
      : "Enter search top match";
  }
  if (screen.focused === inputBox) {
    return "Enter send  ↑/↓ history";
  }
  if (screen.focused === responsePane) {
    return formatKeyLabel("PgUp/PgDn scroll conversation");
  }
  if (screen.focused === activityPane) {
    return formatKeyLabel("PgUp/PgDn scroll ops log");
  }
  if (screen.focused === sidebarPane) {
    return "Enter sessions";
  }
  if (screen.focused === assistBox) {
    return getCurrentMode() === "assist"
      ? "Enter top suggestion"
      : getCurrentMode() === "gateway"
        ? "Enter gateway supervision"
        : getCurrentMode() === "ecosystem"
          ? "Enter runtime ecosystem"
          : getCurrentMode() === "jobs"
            ? "Enter background jobs"
            : "Enter responses list";
  }
  return "Esc input";
}

export function renderFooterContent(
  options: Pick<TuiControlDeckOptions, "buildFooterContent" | "getBusyFrames">,
  state: Pick<TuiControlDeckState, "footerHint" | "busyFrameIndex">,
): string {
  return options.buildFooterContent(
    state.footerHint,
    currentBusyFrame(options.getBusyFrames, state.busyFrameIndex),
  );
}

export function updateFooterHint(
  options: Pick<
    TuiControlDeckOptions,
    | "screen"
    | "responsePane"
    | "activityPane"
    | "sidebarPane"
    | "assistBox"
    | "footer"
    | "inputBox"
    | "paletteList"
    | "getCurrentMode"
    | "isPaletteOpen"
    | "isComposerOpen"
    | "formatKeyLabel"
    | "flushDeferredForeignActivity"
    | "buildFooterContent"
    | "getBusyFrames"
  >,
  state: TuiControlDeckState,
  updateOptions?: FooterUpdateOptions,
): void {
  if (updateOptions?.flushForeign !== false) {
    options.flushDeferredForeignActivity();
  }
  state.footerHint = resolveFooterHint(options);
  options.footer.setContent(renderFooterContent(options, state));
  if (updateOptions?.render !== false) {
    options.screen.render();
  }
}

export function setFooterHint(
  options: Pick<
    TuiControlDeckOptions,
    "screen" | "footer" | "buildFooterContent" | "getBusyFrames"
  >,
  state: TuiControlDeckState,
  hint: string,
  setOptions?: { render?: boolean },
): void {
  state.footerHint = hint;
  if (setOptions?.render === false) {
    return;
  }
  options.footer.setContent(renderFooterContent(options, state));
  options.screen.render();
}
