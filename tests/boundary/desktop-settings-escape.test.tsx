// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import {
  type FlatSetting,
  SettingControl,
} from "../../apps/desktop/src/renderer/settings/SettingsFields";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

function renderControl(
  field: FlatSetting,
  drafts = new Map<string, string | boolean>(),
) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      createElement(SettingControl, {
        field,
        onSaved: () => {},
        drafts,
      }),
    ),
  );
  return { container, root, drafts };
}

function unmountControl(
  root: ReturnType<typeof createRoot>,
  container: HTMLElement,
) {
  act(() => root.unmount());
  container.remove();
}

function setControlValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  next: string,
) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(control, next);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEscape(control: HTMLElement) {
  control.focus();
  control.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
}

it("Escape restores a dirty text draft to its confirmed value", () => {
  const drafts = new Map<string, string | boolean>();
  const { container, root } = renderControl(
    { path: "model.model", category: "model", value: "confirmed-model" },
    drafts,
  );
  try {
    const input = container.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Text input was not rendered.");
    act(() => setControlValue(input, "edited-model"));
    expect(input.value).toBe("edited-model");
    expect(drafts.get("model.model")).toBe("edited-model");

    act(() => pressEscape(input));

    expect(input.value).toBe("confirmed-model");
    expect(drafts.has("model.model")).toBe(false);
    expect(container.textContent).not.toContain("Unsaved change");
  } finally {
    unmountControl(root, container);
  }
});

it("Escape restores a newer draft to the latest confirmed save", async () => {
  vi.mocked(desktopRequest).mockResolvedValue({});
  const drafts = new Map<string, string | boolean>();
  const { container, root } = renderControl(
    { path: "model.model", category: "model", value: "initial-model" },
    drafts,
  );
  try {
    const input = container.querySelector<HTMLInputElement>("input");
    const save = container.querySelector<HTMLButtonElement>(
      'button[aria-label^="Save"]',
    );
    if (!input || !save) throw new Error("Setting controls were not rendered.");
    act(() => setControlValue(input, "first-save"));
    await act(async () => {
      save.click();
      await Promise.resolve();
    });
    expect(desktopRequest).toHaveBeenCalledWith("/settings", "POST", {
      path: "model.model",
      value: "first-save",
    });

    act(() => setControlValue(input, "second-draft"));
    act(() => pressEscape(input));

    expect(input.value).toBe("first-save");
    expect(drafts.has("model.model")).toBe(false);
  } finally {
    unmountControl(root, container);
    vi.mocked(desktopRequest).mockReset();
  }
});

it("Escape restores a dirty multiline array draft", () => {
  const drafts = new Map<string, string | boolean>();
  const { container, root } = renderControl(
    {
      path: "execution.envPassthrough",
      category: "execution",
      value: ["ONE", "TWO"],
    },
    drafts,
  );
  try {
    const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) throw new Error("Textarea was not rendered.");
    act(() => setControlValue(textarea, "EDITED"));

    act(() => pressEscape(textarea));

    expect(textarea.value).toBe("ONE\nTWO");
    expect(drafts.has("execution.envPassthrough")).toBe(false);
  } finally {
    unmountControl(root, container);
  }
});

it("Escape restores a dirty enum selection", () => {
  const drafts = new Map<string, string | boolean>();
  const { container, root } = renderControl(
    { path: "execution.backend", category: "execution", value: "local" },
    drafts,
  );
  try {
    const select = container.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Select was not rendered.");
    act(() => {
      select.value = "docker";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(select.value).toBe("docker");

    act(() => pressEscape(select));

    expect(select.value).toBe("local");
    expect(drafts.has("execution.backend")).toBe(false);
  } finally {
    unmountControl(root, container);
  }
});

it("Escape restores a dirty boolean setting", () => {
  const drafts = new Map<string, string | boolean>();
  const { container, root } = renderControl(
    {
      path: "execution.containerReadOnlyRoot",
      category: "execution",
      value: false,
    },
    drafts,
  );
  try {
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!checkbox) throw new Error("Checkbox was not rendered.");
    act(() => checkbox.click());
    expect(checkbox.checked).toBe(true);

    act(() => pressEscape(checkbox));

    expect(checkbox.checked).toBe(false);
    expect(drafts.has("execution.containerReadOnlyRoot")).toBe(false);
  } finally {
    unmountControl(root, container);
  }
});
