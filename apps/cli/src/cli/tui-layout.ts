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

const TWO_COLUMN_MIN_WIDTH = 110;
const RAIL_MIN_WIDTH = 30;
const RAIL_MAX_WIDTH = 42;
const RAIL_WIDTH_RATIO = 0.24;
const PANEL_CHROME_WIDTH = 4;
const NARROW_COMPACT_OPS_MAX_PANEL_ROWS = 19;

/**
 * Right-rail outer width in two-column geometry. The old proportional-only
 * calculation bottomed out at 16 cells at the 110-column breakpoint, below
 * the width needed for even one scanable status or command row. Clamp the
 * rail instead: 30 columns leaves an 80-column conversation at the breakpoint,
 * while 42 columns is enough for command context without crowding wide shells.
 */
export function resolveCockpitRailWidth(screenWidth: number): number {
  const proportional = Math.floor(screenWidth * RAIL_WIDTH_RATIO);
  return Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, proportional));
}

/** Content columns inside a bordered, horizontally padded rail panel. */
export function resolveCockpitRailContentWidth(screenWidth: number): number {
  const outerWidth =
    screenWidth < TWO_COLUMN_MIN_WIDTH
      ? screenWidth
      : resolveCockpitRailWidth(screenWidth);
  return Math.max(1, outerWidth - PANEL_CHROME_WIDTH);
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

function setPanelHidden(
  panel: blessed.Widgets.BoxElement | blessed.Widgets.Log,
  hidden: boolean,
): void {
  if (panel.hidden === hidden) return;
  if (hidden) {
    panel.hide();
  } else {
    panel.show();
  }
}

export function applyTuiLayout(
  screen: blessed.Widgets.Screen,
  layout: TuiLayoutWidgets,
  options?: ApplyTuiLayoutOptions,
): void {
  const width = screen.width as number;
  const height = screen.height as number;
  const narrow = width < TWO_COLUMN_MIN_WIDTH;
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
    // Single column. Four simultaneously visible panels cannot be scanable at
    // the 80x24 minimum: borders and padding would consume most of their rows.
    // Use the existing Ctrl-O disclosure as the progressive layer instead —
    // collapsed ops yields its rows to Conversation, Status and Controls at
    // very short geometry, while expanded ops becomes the prioritized panel.
    const compactOps =
      opsCollapsed && panelRows <= NARROW_COMPACT_OPS_MAX_PANEL_ROWS;
    setPanelHidden(layout.activity, compactOps);

    if (compactOps) {
      layout.activity.top = PANELS_TOP;
      layout.activity.left = 0;
      layout.activity.width = width;
      layout.activity.height = 0;
      const [responseShare, sidebarShare, assistShare] = distributeRowShares(
        panelRows,
        [
          { min: 7, weight: 5 },
          { min: 4, weight: 1 },
          { min: 6, weight: 2 },
        ],
      );
      stackPanels(
        [
          { box: layout.response, share: responseShare },
          { box: layout.sidebar, share: sidebarShare },
          { box: layout.assistBox, share: assistShare },
        ],
        PANELS_TOP,
        0,
        width,
      );
    } else {
      const [responseShare, activityShare, sidebarShare, assistShare] =
        distributeRowShares(panelRows, [
          { min: opsCollapsed ? 6 : 5, weight: opsCollapsed ? 4 : 2 },
          { min: opsCollapsed ? 3 : 5, weight: opsCollapsed ? 1 : 3 },
          { min: opsCollapsed ? 4 : 3, weight: 1 },
          { min: opsCollapsed ? 5 : 4, weight: opsCollapsed ? 2 : 1 },
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
    }
  } else {
    // Two columns. The rail uses a clamped operator-facing width rather than
    // an unbounded percentage remainder; the left pane takes the complement so
    // the columns still cover every terminal column exactly.
    setPanelHidden(layout.activity, false);
    const railWidth = resolveCockpitRailWidth(width);
    const leftWidth = width - railWidth;

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
