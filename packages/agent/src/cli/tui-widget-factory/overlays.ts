import type { TuiWidgetFactoryContext } from "./context";
import type { TuiWidgetSet } from "./types";

type TuiOverlayWidgets = Pick<
  TuiWidgetSet,
  | "paletteOverlay"
  | "paletteInput"
  | "paletteList"
  | "composerOverlay"
  | "composer"
>;

interface OverlayContainerOptions {
  width: string;
  height: string;
  label: string;
  accent: string;
}

function createOverlayContainer(
  { ui, screen, theme }: TuiWidgetFactoryContext,
  options: OverlayContainerOptions,
): TuiWidgetSet["paletteOverlay"] {
  return ui.box({
    parent: screen,
    top: "center",
    left: "center",
    width: options.width,
    height: options.height,
    hidden: true,
    tags: true,
    border: "line",
    label: options.label,
    style: {
      fg: theme.baseFg,
      bg: theme.baseBg,
      border: { fg: options.accent },
      label: { fg: options.accent, bold: true },
    },
  });
}

function createPaletteWidgets({
  ui,
  screen,
  theme,
}: TuiWidgetFactoryContext): Pick<
  TuiWidgetSet,
  "paletteOverlay" | "paletteInput" | "paletteList"
> {
  const paletteOverlay = createOverlayContainer(
    { ui, screen, theme },
    {
      width: "72%",
      height: "68%",
      label: " Command Deck ",
      accent: theme.magentaGlow,
    },
  );

  const paletteInput = ui.textbox({
    parent: paletteOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: 3,
    inputOnFocus: false,
    border: "line",
    label: " Search ",
    style: {
      border: { fg: theme.amberGlow },
      label: { fg: theme.amberGlow, bold: true },
      focus: {
        border: { fg: theme.primary },
      },
    },
  });

  const paletteList = ui.list({
    parent: paletteOverlay,
    top: 3,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    border: "line",
    label: " Matches ",
    keys: true,
    mouse: false,
    vi: true,
    tags: true,
    style: {
      border: { fg: theme.cyanGlow },
      selected: {
        bg: theme.primary,
        fg: theme.baseFg,
      },
      item: {
        fg: theme.baseFg,
      },
    },
    items: [],
  });

  return {
    paletteOverlay,
    paletteInput,
    paletteList,
  };
}

function createComposerWidgets({
  ui,
  screen,
  theme,
}: TuiWidgetFactoryContext): Pick<
  TuiWidgetSet,
  "composerOverlay" | "composer"
> {
  const composerOverlay = createOverlayContainer(
    { ui, screen, theme },
    {
      width: "78%",
      height: "72%",
      label: " Longform Composer ",
      accent: theme.greenGlow,
    },
  );

  const composer = ui.textarea({
    parent: composerOverlay,
    top: 0,
    left: 0,
    width: "100%-2",
    height: "100%-4",
    inputOnFocus: false,
    keys: true,
    mouse: false,
    vi: true,
    border: "line",
    label: " Compose (Ctrl-S submit, Esc close) ",
    style: {
      border: { fg: theme.greenGlow },
      label: { fg: theme.greenGlow, bold: true },
      focus: {
        border: { fg: theme.primary },
      },
    },
  });

  ui.box({
    parent: composerOverlay,
    bottom: 0,
    left: 1,
    width: "100%-4",
    height: 1,
    tags: true,
    content:
      "{gray-fg}Use this for long prompts, multiline shell commands, and batched research requests.{/}",
  });

  return {
    composerOverlay,
    composer,
  };
}

export function createOverlayWidgets(
  context: TuiWidgetFactoryContext,
): TuiOverlayWidgets {
  return {
    ...createPaletteWidgets(context),
    ...createComposerWidgets(context),
  };
}
