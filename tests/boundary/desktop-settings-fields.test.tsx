// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import {
  type FlatSetting,
  SettingControl,
} from "../../apps/desktop/src/renderer/settings/SettingsFields";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.mocked(desktopRequest).mockReset();
});

function renderSettingControl(field: FlatSetting) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<SettingControl field={field} onSaved={() => {}} />));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function saveButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label^="Save "]',
  );
  if (!button) throw new Error("Save button was not rendered.");
  return button;
}

it("rejects an out-of-range numeric draft before any settings write", () => {
  const container = renderSettingControl({
    path: "execution.sshPort",
    category: "execution",
    value: 22,
  });
  const input = container.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error("Numeric input was not rendered.");
  expect(input.min).toBe("1");
  expect(input.max).toBe("65535");
  expect(input.step).toBe("1");

  act(() => setInputValue(input, "99999"));
  act(() => saveButton(container).click());

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "execution.sshPort must be an integer from 1 to 65535.",
  );
  expect(desktopRequest).not.toHaveBeenCalled();
});

it("rejects a blank numeric draft instead of coercing it to zero", () => {
  const container = renderSettingControl({
    path: "model.temperature",
    category: "model",
    value: 0.4,
  });
  const input = container.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error("Numeric input was not rendered.");

  act(() => setInputValue(input, ""));
  act(() => saveButton(container).click());

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Enter a valid number before saving.",
  );
  expect(desktopRequest).not.toHaveBeenCalled();
});

it("rejects a malformed URL draft before any settings write", () => {
  const container = renderSettingControl({
    path: "model.baseUrl",
    category: "model",
    value: "",
  });
  const input = container.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error("URL input was not rendered.");
  expect(input.type).toBe("url");

  act(() => setInputValue(input, "not a url"));
  act(() => saveButton(container).click());

  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "model.baseUrl must be empty or a valid HTTP or HTTPS URL.",
  );
  expect(desktopRequest).not.toHaveBeenCalled();
});

it("submits a valid URL draft", async () => {
  vi.mocked(desktopRequest).mockResolvedValue({ settings: {} });
  const container = renderSettingControl({
    path: "model.baseUrl",
    category: "model",
    value: "",
  });
  const input = container.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error("URL input was not rendered.");

  act(() => setInputValue(input, "https://example.com/v1"));
  await act(async () => saveButton(container).click());

  expect(desktopRequest).toHaveBeenCalledWith("/settings", "POST", {
    path: "model.baseUrl",
    value: "https://example.com/v1",
  });
});

it("offers canonical execution and autonomy enum values", () => {
  const backend = renderSettingControl({
    path: "execution.backend",
    category: "execution",
    value: "local",
  });
  expect(
    [
      ...(backend.querySelector<HTMLSelectElement>("select")?.options ?? []),
    ].map((option) => option.value),
  ).toEqual([
    "local",
    "docker",
    "podman",
    "ssh",
    "singularity",
    "daytona",
    "modal",
  ]);

  const runDepth = renderSettingControl({
    path: "agent.runDepth",
    category: "agent",
    value: "standard",
  });
  expect(
    [
      ...(runDepth.querySelector<HTMLSelectElement>("select")?.options ?? []),
    ].map((option) => option.value),
  ).toEqual(["quick", "standard", "deep", "explore"]);
});
