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
  ): Promise<string> => {
    const chrome = deps.getChromeTheme();
    return showOverlay<string>(
      "Input",
      `${prompt}\n{${chrome.muted}-fg}${buildTextPromptSubtitle(defaultValue, options?.secret)}{/${chrome.muted}-fg}`,
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
            border: { fg: chrome.cyanGlow },
            fg: chrome.baseFg,
            bg: chrome.panelBg,
            focus: { border: { fg: chrome.primary } },
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
          content: `{${chrome.muted}-fg}Enter save · Esc keep current{/${chrome.muted}-fg}`,
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
        // Escape stays the cancel/keep-current path. Ctrl-C is deliberately
        // not captured here: the footer advertises "Control-C exits" and the
        // screen-level abort handler must win, exactly like in every other
        // overlay.
        inputBox.key(["escape"], () => inputBox.cancel());
        inputBox.focus();
        deps.render();
        inputBox.readInput();
        // blessed's readInput() sets screen.grabKeys = true while editing,
        // which suppresses every screen-level key dispatch — including the
        // global Ctrl-C abort — for as long as the input is active. The only
        // screen-level key in the wizard is that abort, so releasing the grab
        // restores the advertised exit without disturbing text entry.
        inputBox.screen.grabKeys = false;
      },
    );
  };
}
