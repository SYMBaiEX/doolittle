import blessed from "blessed";

// Blessed calculates explicit percentage widths from the parent's outer width
// and then positions children inside the parent's border and padding. Wizard
// prompt children use "100%-2" for full-width content, so with horizontal
// padding they can repaint over the modal's right border. The overlay keeps
// that padding for readability, normalizes full-width children to the padded
// content width, and layers a transparent sibling frame above the content so
// the border is continuous even during the first blessed invalidation pass.
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
        border: { fg: "#ffb000" },
        fg: "white",
        bg: "#151c24",
      },
    });
    const borderFrame = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "72%",
      height: "70%",
      border: "line",
      label: ` ${title} `,
      style: {
        border: { fg: "#ffb000" },
        transparent: true,
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
      borderFrame.destroy();
      overlay.destroy();
      onAfterClose();
      settle(value);
    });
    normalizeFullWidthOverlayChildren(overlay);
    screen.render();
  });
}
