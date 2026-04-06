import type blessed from "blessed";
import type { TuiWidgetSet } from "@/cli/tui-widget-factory";

export type TuiLayoutWidgets = TuiWidgetSet;

interface ApplyTuiLayoutOptions {
  opsCollapsed?: boolean;
}

export function applyTuiLayout(
  screen: blessed.Widgets.Screen,
  layout: TuiLayoutWidgets,
  options?: ApplyTuiLayoutOptions,
): void {
  const width = screen.width as number;
  const height = screen.height as number;
  const compact = width < 140;
  const narrow = width < 110;
  const short = height < 34;
  const opsCollapsed = options?.opsCollapsed ?? true;

  layout.header.top = 0;
  layout.header.left = 0;
  layout.header.width = "100%";
  layout.header.height = 3;

  layout.inputBox.left = 0;
  layout.inputBox.width = "100%";
  layout.inputBox.bottom = 1;
  layout.inputBox.height = 3;

  layout.footer.left = 0;
  layout.footer.width = "100%";
  layout.footer.bottom = 0;
  layout.footer.height = 1;

  if (narrow) {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "100%";
    layout.response.height = opsCollapsed
      ? short
        ? "66%-1"
        : "68%-1"
      : short
        ? "58%-1"
        : "60%-1";

    layout.activity.top = opsCollapsed
      ? short
        ? "66%+2"
        : "68%+2"
      : short
        ? "58%+2"
        : "60%+2";
    layout.activity.left = 0;
    layout.activity.width = "100%";
    layout.activity.height = opsCollapsed
      ? short
        ? "6%-2"
        : "8%-2"
      : short
        ? "10%-2"
        : "12%-2";

    layout.sidebar.top = opsCollapsed
      ? short
        ? "72%+2"
        : "76%+2"
      : short
        ? "68%+2"
        : "72%+2";
    layout.sidebar.left = 0;
    layout.sidebar.width = "100%";
    layout.sidebar.height = short ? "12%-2" : "14%-2";

    layout.transportBox.top = "100%";
    layout.transportBox.left = "100%";
    layout.transportBox.width = "0%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = "100%";
    layout.executionBox.left = "100%";
    layout.executionBox.width = "0%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = opsCollapsed
      ? short
        ? "84%+2"
        : "88%+2"
      : short
        ? "80%+2"
        : "84%+2";
    layout.assistBox.left = 0;
    layout.assistBox.width = "100%";
    layout.assistBox.height = short ? "10%-2" : "12%-2";
  } else if (compact) {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "86%";
    layout.response.height = opsCollapsed
      ? short
        ? "68%-1"
        : "70%-1"
      : short
        ? "61%-1"
        : "64%-1";

    layout.activity.top = opsCollapsed
      ? short
        ? "68%+2"
        : "70%+2"
      : short
        ? "61%+2"
        : "64%+2";
    layout.activity.left = 0;
    layout.activity.width = "86%";
    layout.activity.height = opsCollapsed
      ? short
        ? "14%-2"
        : "16%-2"
      : short
        ? "21%-2"
        : "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "86%";
    layout.sidebar.width = "14%";
    layout.sidebar.height = short ? "28%" : "30%";

    layout.transportBox.top = short ? "22%+3" : "24%+3";
    layout.transportBox.left = "86%";
    layout.transportBox.width = "14%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = short ? "40%+3" : "42%+3";
    layout.executionBox.left = "86%";
    layout.executionBox.width = "14%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = short ? "48%+3" : "50%+3";
    layout.assistBox.left = "86%";
    layout.assistBox.width = "14%";
    layout.assistBox.height = short ? "39%-1" : "38%-1";
  } else {
    layout.response.top = 3;
    layout.response.left = 0;
    layout.response.width = "86%";
    layout.response.height = opsCollapsed ? "70%-1" : "64%-1";

    layout.activity.top = opsCollapsed ? "70%+2" : "64%+2";
    layout.activity.left = 0;
    layout.activity.width = "86%";
    layout.activity.height = opsCollapsed ? "16%-2" : "24%-2";

    layout.sidebar.top = 3;
    layout.sidebar.left = "86%";
    layout.sidebar.width = "14%";
    layout.sidebar.height = "84%-2";

    layout.transportBox.top = "3";
    layout.transportBox.left = "86%";
    layout.transportBox.width = "14%";
    layout.transportBox.height = "0%";

    layout.executionBox.top = "32%+2";
    layout.executionBox.left = "86%";
    layout.executionBox.width = "14%";
    layout.executionBox.height = "0%";

    layout.assistBox.top = "46%+3";
    layout.assistBox.left = "86%";
    layout.assistBox.width = "14%";
    layout.assistBox.height = short ? "38%-1" : "40%-1";
  }

  layout.paletteOverlay.width = narrow ? "94%" : compact ? "82%" : "72%";
  layout.paletteOverlay.height = narrow ? "76%" : "68%";
  layout.paletteOverlay.top = "center";
  layout.paletteOverlay.left = "center";
  layout.paletteInput.top = 0;
  layout.paletteInput.left = 0;
  layout.paletteInput.width = "100%-2";
  layout.paletteInput.height = 3;
  layout.paletteList.top = 3;
  layout.paletteList.left = 0;
  layout.paletteList.width = "100%-2";
  layout.paletteList.height = "100%-4";

  layout.composerOverlay.width = narrow ? "96%" : compact ? "88%" : "78%";
  layout.composerOverlay.height = narrow ? "82%" : "72%";
  layout.composerOverlay.top = "center";
  layout.composerOverlay.left = "center";
  layout.composer.width = "100%-2";
  layout.composer.height = "100%-4";
  layout.composer.top = 0;
  layout.composer.left = 0;
}
