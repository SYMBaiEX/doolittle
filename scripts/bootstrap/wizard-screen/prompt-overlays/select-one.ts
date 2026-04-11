import blessed from "blessed";
import {
  buildSelectNumericKeyLabels,
  buildSelectOneFooter,
  clampIndex,
} from "../prompts";
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
        const updateDetail = () => {
          selectedIndex = clampIndex(selectedIndex, optionsList.length);
          const current = optionsList[selectedIndex];
          if (current) {
            options?.onHighlight?.(current.value);
          }
          detailBox.setContent(
            `${current?.label || ""}\n\n${current?.detail || "No extra detail."}`,
          );
          list.select(selectedIndex);
          deps.render();
        };
        list.focus();
        deps.render();
        updateDetail();
        deps.setFooter(buildSelectOneFooter());
        list.key(["up", "left"], () => {
          selectedIndex = clampIndex(selectedIndex - 1, optionsList.length);
          updateDetail();
        });
        list.key(["down", "right"], () => {
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
        list.key("escape", () =>
          finish(clampIndex(selectedIndex, optionsList.length)),
        );
        list.key("C-c", () =>
          finish(clampIndex(selectedIndex, optionsList.length)),
        );
      },
    );
}
