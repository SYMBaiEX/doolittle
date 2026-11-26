import type blessed from "blessed";
import type { TuiWidgetSet } from "./tui-widget-factory/index";

export type TuiLayoutWidgets = TuiWidgetSet;

interface ApplyTuiLayoutOptions {
  opsCollapsed?: boolean;
}

interface RowShareSpec {
  /** Rows the panel keeps even at the minimum supported geometry. */
  min: number;
  /** Proportional share of the rows left after every minimum is met. */
  weight: number;
}

/**
 * Partition `total` rows across panels so the sum of the shares is exactly
 * `total`. Every panel first receives its minimum; the remaining rows are
 * distributed by weight with the largest-remainder method, so the result is
 * deterministic and no row is ever left unassigned or double-assigned.
 *
 * Blessed percentages cannot express this: each percentage string is floored
 * independently before additive adjustments, so independently computed boxes
 * overlap or leak a dead strip, and small terminals drive `x%-2` heights to
 * zero or negative. Absolute arithmetic is safe here because the layout is
 * re-applied on every resize event.
 */
export function distributeRowShares(
  total: number,
  specs: readonly RowShareSpec[],
): number[] {
  if (specs.length === 0) return [];
  if (total <= 0) return specs.map(() => 0);
  const minSum = specs.reduce((sum, spec) => sum + spec.min, 0);
  if (total < minSum) {
    // Below the supported minimum geometry the screen-events guard normally
    // refuses to re-layout, so this is only a defensive path: shrink shares
    // proportionally rather than letting panels overflow into fixed chrome.
    const scale = total / minSum;
    const scaled = specs.map((spec) =>
      Math.max(1, Math.floor(spec.min * scale)),
    );
    let overflow = scaled.reduce((sum, share) => sum + share, 0) - total;
    for (let index = scaled.length - 1; index >= 0 && overflow > 0; index--) {
      const reduction = Math.min(scaled[index] - 1, overflow);
      scaled[index] -= reduction;
      overflow -= reduction;
    }
    return scaled;
  }
  const shares = specs.map((spec) => spec.min);
  const remaining = total - minSum;
  if (remaining > 0) {
    const weightSum = specs.reduce((sum, spec) => sum + spec.weight, 0);
    const exact = specs.map((spec) =>
      weightSum > 0 ? (remaining * spec.weight) / weightSum : 0,
    );
    const floors = exact.map((value) => Math.floor(value));
    let leftover = remaining - floors.reduce((sum, value) => sum + value, 0);
    const order = specs
      .map((_, index) => index)
      .sort((a, b) => exact[b] - floors[b] - (exact[a] - floors[a]) || a - b);
    for (const index of order) {
      if (leftover <= 0) break;
      floors[index] += 1;
      leftover -= 1;
    }
    for (let index = 0; index < shares.length; index++) {
      shares[index] += floors[index];
    }
  }
  return shares;
}

interface StackedPanel {
  box: blessed.Widgets.BoxElement | blessed.Widgets.Log;
  share: number;
}

/** Stack panels adjacently from `top`; by construction no two share a row. */
function stackPanels(
  panels: readonly StackedPanel[],
  top: number,
  left: number,
  width: number,
): void {
  let nextTop = top;
  for (const panel of panels) {
    panel.box.top = nextTop;
    panel.box.left = left;
    panel.box.width = width;
    panel.box.height = panel.share;
    nextTop += panel.share;
  }
}

export function applyTuiLayout(
  screen: blessed.Widgets.Screen,
  layout: TuiLayoutWidgets,
  options?: ApplyTuiLayoutOptions,
): void {
  const width = screen.width as number;
  const height = screen.height as number;
  const narrow = width < 110;
  const opsCollapsed = options?.opsCollapsed ?? true;

  // Fixed chrome: header rows 0-2, footer row height-1, input rows
  // height-4..height-2 (blessed computes top = rows - height - bottom for
  // bottom-anchored boxes). Panels therefore own rows 3..height-5 inclusive,
  // which is height-7 rows — the same at every width.
  const PANELS_TOP = 3;
  const panelRows = Math.max(0, height - 7);

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
    // Single column: every panel spans the full width and the four panels
    // exactly partition the rows between header and input. Minimums are
    // sized so the 80x24 minimum geometry (panelRows = 17) still renders
    // every panel with inner rows: 5+3+4+4 = 16 <= 17 collapsed, and
    // 5+4+4+4 = 17 <= 17 expanded.
    const [responseShare, activityShare, sidebarShare, assistShare] =
      distributeRowShares(panelRows, [
        { min: 5, weight: opsCollapsed ? 4 : 2 },
        { min: opsCollapsed ? 3 : 4, weight: opsCollapsed ? 1 : 3 },
        { min: 4, weight: 1 },
        { min: 4, weight: 1 },
      ]);
    stackPanels(
      [
        { box: layout.response, share: responseShare },
        { box: layout.activity, share: activityShare },
        { box: layout.sidebar, share: sidebarShare },
        { box: layout.assistBox, share: assistShare },
      ],
      PANELS_TOP,
      0,
      width,
    );
  } else {
    // Two columns. The right rail width is the complement of the floored
    // left-pane width, so the columns always cover every column exactly —
    // independently floored percentages leak a dead one-column strip at the
    // right edge whenever floor(86%) + floor(14%) < width.
    const leftWidth = Math.floor(width * 0.86);
    const railWidth = width - leftWidth;

    const [responseShare, activityShare] = distributeRowShares(panelRows, [
      { min: 5, weight: opsCollapsed ? 4 : 2 },
      { min: opsCollapsed ? 3 : 5, weight: opsCollapsed ? 1 : 3 },
    ]);
    stackPanels(
      [
        { box: layout.response, share: responseShare },
        { box: layout.activity, share: activityShare },
      ],
      PANELS_TOP,
      0,
      leftWidth,
    );

    // The right rail is an explicit non-overlapping partition of the same
    // rows: Status owns the top share, Commands owns the rest down to the
    // input chrome. Neither can collide with the other or with Input.
    const [sidebarShare, assistShare] = distributeRowShares(panelRows, [
      { min: 5, weight: 1 },
      { min: 5, weight: 1 },
    ]);
    stackPanels(
      [
        { box: layout.sidebar, share: sidebarShare },
        { box: layout.assistBox, share: assistShare },
      ],
      PANELS_TOP,
      leftWidth,
      railWidth,
    );
  }

  layout.paletteOverlay.width = narrow ? "94%" : width < 140 ? "82%" : "72%";
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

  layout.composerOverlay.width = narrow ? "96%" : width < 140 ? "88%" : "78%";
  layout.composerOverlay.height = narrow ? "82%" : "72%";
  layout.composerOverlay.top = "center";
  layout.composerOverlay.left = "center";
  layout.composer.width = "100%-2";
  layout.composer.height = "100%-4";
  layout.composer.top = 0;
  layout.composer.left = 0;
}
