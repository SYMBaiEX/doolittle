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
          // keys stays off: blessed's internal up/down handlers would move
          // the selection in addition to this overlay's own index handling,
          // double-stepping the highlight. The overlay binds every key
          // itself (which is also what makes the element keyable).
          keys: false,
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
        // list.select() emits "select item" synchronously; the guard keeps
        // programmatic repaints from re-entering while genuine mouse/wheel
        // selection still converges on one source of truth.
        let syncing = false;
        const applySelection = (index: number) => {
          selectedIndex = clampIndex(index, 2);
          syncing = true;
          try {
            list.select(selectedIndex);
          } finally {
            syncing = false;
          }
          deps.render();
        };
        list.focus();
        applySelection(selectedIndex);
        deps.setFooter(buildYesNoFooter());
        list.on("select item", (_item, index) => {
          // Mouse selection moves blessed's highlight directly; the semantic
          // index must follow or Enter would confirm the pre-click answer.
          if (syncing) {
            return;
          }
          applySelection(index);
        });
        list.key(["up", "left", "k"], () => applySelection(selectedIndex - 1));
        list.key(["down", "right", "j"], () =>
          applySelection(selectedIndex + 1),
        );
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
