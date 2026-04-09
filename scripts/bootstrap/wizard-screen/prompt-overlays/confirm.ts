import blessed from "blessed";
import { buildYesNoFooter, buildYesNoItems, clampIndex } from "../prompts";
import type { WizardPromptOverlayDependencies } from "./shared";

export function createPromptYesNoHandler(
  deps: WizardPromptOverlayDependencies,
) {
  const showOverlay = <T>(
    title: string,
    body: string,
    mount: (
      overlay: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ): Promise<T> => deps.showOverlay(title, body, mount);

  return async (prompt: string, defaultValue: boolean): Promise<boolean> =>
    showOverlay<boolean>(
      "Confirm",
      `${prompt}\n{gray-fg}Enter confirms · Esc keeps default{/gray-fg}`,
      (overlay, resolve) => {
        const list = blessed.list({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: 6,
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
          items: buildYesNoItems(defaultValue),
        });
        let settled = false;
        let selectedIndex = defaultValue ? 0 : 1;
        const finish = (value: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        };
        const applySelection = (index: number) => {
          selectedIndex = clampIndex(index, 2);
          list.select(selectedIndex);
          deps.render();
        };
        list.focus();
        applySelection(selectedIndex);
        deps.setFooter(buildYesNoFooter());
        list.key(["up", "left"], () => applySelection(selectedIndex - 1));
        list.key(["down", "right"], () => applySelection(selectedIndex + 1));
        list.key(["1", "2"], (_ch, key) => {
          const raw = Number(key.full);
          if (Number.isInteger(raw) && raw >= 1 && raw <= 2) {
            applySelection(raw - 1);
          }
        });
        list.key(["enter", "space"], () => finish(selectedIndex === 0));
        list.key("escape", () => finish(defaultValue));
        list.key("C-c", () => finish(defaultValue));
      },
    );
}
