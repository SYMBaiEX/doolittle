import blessed from "blessed";
import {
  buildSelectManyFooter,
  buildSelectNumericKeyLabels,
  clampIndex,
  toggleSelection,
} from "../prompts";
import type { WizardPromptOverlayDependencies } from "./shared";

export function createSelectManyHandler(deps: WizardPromptOverlayDependencies) {
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
    optionsList: Array<{ value: T; label: string }>,
    defaults: T[],
  ): Promise<T[]> =>
    showOverlay<T[]>(
      "Choose Many",
      `${prompt}\n{gray-fg}↑/↓ move · Space toggle · Enter confirm{/gray-fg}`,
      (overlay, resolve) => {
        let active = new Set(defaults);
        let cursorIndex = 0;
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: "100%-8",
          border: "line",
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            selected: {
              bg: deps.widgets.header.style.bg,
              fg: "black",
            },
            item: { fg: "white" },
          },
          items: [],
        });
        let settled = false;
        const finish = (value: T[]) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        };
        const refresh = () => {
          cursorIndex = clampIndex(cursorIndex, optionsList.length);
          list.setItems(
            optionsList.map(
              (item) => `${active.has(item.value) ? "●" : "○"} ${item.label}`,
            ),
          );
          list.select(cursorIndex);
          deps.render();
        };
        const moveCursor = (delta: number) => {
          cursorIndex = clampIndex(cursorIndex + delta, optionsList.length);
          refresh();
        };
        list.focus();
        refresh();
        deps.setFooter(buildSelectManyFooter());
        list.on("select item", (_item, index) => {
          cursorIndex = clampIndex(index, optionsList.length);
          refresh();
        });
        list.key(["up", "left"], () => moveCursor(-1));
        list.key(["down", "right"], () => moveCursor(1));
        list.key(
          buildSelectNumericKeyLabels(optionsList.length),
          (_ch, key) => {
            const numeric = Number(key.full);
            if (
              Number.isInteger(numeric) &&
              numeric >= 1 &&
              numeric <= optionsList.length
            ) {
              cursorIndex = numeric - 1;
              const current = optionsList[cursorIndex];
              if (current) {
                active = toggleSelection(active, current.value);
              }
              refresh();
            }
          },
        );
        list.key("space", () => {
          const current = optionsList[cursorIndex];
          if (!current) {
            return;
          }
          active = toggleSelection(active, current.value);
          refresh();
        });
        list.key("enter", () =>
          finish(
            optionsList
              .filter((item) => active.has(item.value))
              .map((item) => item.value),
          ),
        );
        list.key("escape", () => finish(defaults));
        list.key("C-c", () => finish(defaults));
      },
    );
}
