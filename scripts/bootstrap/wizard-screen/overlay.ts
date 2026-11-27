import blessed from "blessed";
import type { WizardChromeTheme } from "./render";

// Blessed calculates explicit percentage widths from the parent's outer width
// and then positions children inside the parent's border and padding. Wizard
// prompt children use "100%-2" for full-width content, so with horizontal
// padding they can repaint over the modal's right border. The overlay keeps
// that padding for readability and normalizes full-width children to the
// padded content width. A transparent sibling frame used to layer above the
// content to protect the border, but blessed blends every cell under a
// transparent element toward the frame's default attr, washing every overlay
// color toward gray — a worse defect than the one it solved, and the width
// normalization below already keeps children off the border.
const OVERLAY_CONTENT_WIDTH = "100%-4";
const LEGACY_FULL_WIDTH = "100%-2";

function normalizeFullWidthOverlayChildren(
  overlay: blessed.Widgets.BoxElement,
): void {
  for (const child of overlay.children) {
    const childElement = child as unknown as {
      position?: { width?: number | string };
      width: number | string;
    };
    if (childElement.position?.width === LEGACY_FULL_WIDTH) {
      childElement.width = OVERLAY_CONTENT_WIDTH;
    }
  }
}
export function createWizardOverlay<T>(
  screen: blessed.Widgets.Screen,
  title: string,
  body: string,
  onMount: (
    overlay: blessed.Widgets.BoxElement,
    settle: (value: T) => void,
  ) => void,
  onAfterClose: () => void,
  theme: WizardChromeTheme,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const overlay = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "72%",
      height: "70%",
      border: "line",
      label: ` ${title} `,
      tags: true,
      padding: { top: 1, left: 1, right: 1, bottom: 1 },
      style: {
        border: { fg: theme.magentaGlow },
        label: { fg: theme.magentaGlow, bold: true },
        fg: theme.baseFg,
        bg: theme.panelBg,
      },
    });
    blessed.box({
      parent: overlay,
      top: 0,
      left: 0,
      width: OVERLAY_CONTENT_WIDTH,
      height: 3,
      tags: true,
      content: body,
    });
    onMount(overlay, (value) => {
      overlay.destroy();
      onAfterClose();
      settle(value);
    });
    normalizeFullWidthOverlayChildren(overlay);
    screen.render();
  });
}
