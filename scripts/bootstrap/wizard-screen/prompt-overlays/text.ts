import blessed from "blessed";
import { buildTextPromptFooter, buildTextPromptSubtitle } from "../prompts";
import type { WizardPromptOverlayDependencies } from "./shared";

export function createPromptTextHandler(deps: WizardPromptOverlayDependencies) {
  const showOverlay = <T>(
    title: string,
    body: string,
    mount: (
      overlay: blessed.Widgets.BoxElement,
      resolve: (value: T) => void,
    ) => void,
  ): Promise<T> => deps.showOverlay(title, body, mount);

  return async (
    prompt: string,
    defaultValue = "",
    options?: { secret?: boolean },
  ): Promise<string> =>
    showOverlay<string>(
      "Input",
      `${prompt}\n{gray-fg}${buildTextPromptSubtitle(defaultValue, options?.secret)}{/gray-fg}`,
      (overlay, resolve) => {
        const inputBox = blessed.textbox({
          parent: overlay,
          top: 4,
          left: 0,
          width: "100%-2",
          height: 3,
          border: "line",
          inputOnFocus: true,
          censor: options?.secret ?? false,
          keys: true,
          vi: true,
          mouse: true,
          style: {
            border: { fg: "#55d6ff" },
            fg: "white",
            bg: "#202833",
          },
          value: defaultValue,
        });
        blessed.box({
          parent: overlay,
          bottom: 0,
          left: 0,
          width: "100%-2",
          height: 1,
          tags: true,
          content: "{gray-fg}Enter save · Esc keep current{/gray-fg}",
        });
        deps.setFooter(buildTextPromptFooter(deps.formatKeyLabel));
        let settled = false;
        const finish = (value: string) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve((String(value || "").trim() || defaultValue).trim());
        };
        inputBox.setValue(defaultValue);
        inputBox.on("submit", (value) => {
          finish(String(value ?? inputBox.getValue()));
        });
        inputBox.once("cancel", () => finish(defaultValue));
        inputBox.key(["enter", "return"], () => inputBox.submit());
        inputBox.key(["escape", "C-c"], () => inputBox.cancel());
        inputBox.focus();
        deps.render();
        inputBox.readInput();
      },
    );
}
