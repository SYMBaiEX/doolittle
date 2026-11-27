import blessed from "blessed";
import {
  buildSelectNumericKeyLabels,
  buildSelectOneFooter,
  clampIndex,
} from "../prompts";
import { wizardSelectionStyle } from "../render";
import type { WizardPromptOverlayDependencies } from "./shared";

export function createSelectOneHandler(deps: WizardPromptOverlayDependencies) {
  const showOverlay = <T>(
    title: string,
    body: string,
    mount: (
      overlay: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ): Promise<T> => deps.showOverlay(title, body, mount);

  return async <T extends string>(
    prompt: string,
    optionsList: Array<{ value: T; label: string; detail?: string }>,
    defaultValue: T,
    options?: { onHighlight?: (value: T) => void },
  ): Promise<T> =>
    showOverlay<T>(
      "Choose One",
      `${prompt}\n{gray-fg}↑/↓ move · Enter confirm · Esc keep current{/gray-fg}`,
      (overlay, resolve) => {
        const detailBox = blessed.box({
          parent: overlay,
          top: 4,
          left: "60%",
          width: "40%-2",
          height: "100%-8",
          border: "line",
          label: " Detail ",
          padding: { left: 1, right: 1 },
          style: { border: { fg: "#4fd17d" }, fg: "white" },
        });
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "60%",
          height: "100%-8",
          border: "line",
          // keys stays off: blessed's internal up/down handlers would move
          // the selection in addition to this overlay's own index handling,
          // double-stepping the highlight. The overlay binds every key
          // itself (which is also what makes the element keyable).
          keys: false,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            selected: wizardSelectionStyle(deps.getChromeTheme()),
            item: { fg: "white" },
          },
          items: optionsList.map((item) => item.label),
        });
        let selectedIndex = Math.max(
          0,
          optionsList.findIndex((item) => item.value === defaultValue),
        );
        let settled = false;
        const finish = (index: number) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(optionsList[index]?.value ?? defaultValue);
        };
        // list.select() emits "select item" synchronously; the guard keeps
        // programmatic repaints from re-entering the highlight update while
        // genuine mouse/wheel selection still converges on one source of
        // truth.
        let syncing = false;
        const updateDetail = () => {
          selectedIndex = clampIndex(selectedIndex, optionsList.length);
          const current = optionsList[selectedIndex];
          if (current) {
            options?.onHighlight?.(current.value);
          }
          detailBox.setContent(
            `${current?.label || ""}\n\n${current?.detail || "No extra detail."}`,
          );
          // Derived at paint time: the theme picker live-previews through
          // onHighlight above, so a style captured at overlay creation would
          // paint rows in the previous theme's primary.
          list.style.selected = wizardSelectionStyle(deps.getChromeTheme());
          syncing = true;
          try {
            list.select(selectedIndex);
          } finally {
            syncing = false;
          }
          deps.render();
        };
        list.focus();
        deps.render();
        updateDetail();
        deps.setFooter(buildSelectOneFooter());
        list.on("select item", (_item, index) => {
          // Mouse and wheel selection move blessed's highlight directly; the
          // semantic index (and the detail pane) must follow or Enter would
          // confirm a different value than the one visibly selected.
          if (syncing) {
            return;
          }
          selectedIndex = clampIndex(index, optionsList.length);
          updateDetail();
        });
        list.key(["up", "left", "k"], () => {
          selectedIndex = clampIndex(selectedIndex - 1, optionsList.length);
          updateDetail();
        });
        list.key(["down", "right", "j"], () => {
          selectedIndex = clampIndex(selectedIndex + 1, optionsList.length);
          updateDetail();
        });
        list.key(
          buildSelectNumericKeyLabels(optionsList.length),
          (_ch, key) => {
            const numeric = Number(key.full);
            if (
              Number.isInteger(numeric) &&
              numeric >= 1 &&
              numeric <= optionsList.length
            ) {
              selectedIndex = numeric - 1;
              updateDetail();
            }
          },
        );
        list.key(["enter", "space"], () => finish(selectedIndex));
        list.key("escape", () => {
          if (settled) {
            return;
          }
          // Esc keeps the current value: resolve the original default, not
          // the highlight. Live preview side effects (theme chrome) roll
          // back through the same highlight callback that applied them.
          options?.onHighlight?.(defaultValue);
          settled = true;
          resolve(defaultValue);
        });
        list.key("C-c", () =>
          finish(clampIndex(selectedIndex, optionsList.length)),
        );
      },
    );
}
