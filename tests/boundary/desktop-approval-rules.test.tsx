// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import {
  apiResourceCacheKey,
  desktopQueryClient,
} from "../../apps/desktop/src/renderer/lib";
import { SettingsApprovalRulesPanel } from "../../apps/desktop/src/renderer/settings/SettingsApprovalRulesPanel";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

const RULES_PATH = "/execution/approval-rules";
const cleanups: Array<() => void> = [];

const existingRule = {
  id: "rule-1",
  patternType: "exact",
  pattern: "git status",
  platform: "cli",
  userId: "user-1",
  roomId: "room-1",
  sessionKey: "room-1",
  botId: "bot-1",
  sessionId: "session-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  enabled: true,
};

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
});

function seedRules(rules: unknown[]) {
  desktopQueryClient.setQueryData([apiResourceCacheKey(RULES_PATH, [true])], {
    rules,
  });
}

function renderPanel() {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<SettingsApprovalRulesPanel active />));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function buttons(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].filter(
    (button) => normalizedText(button) === label,
  );
}

function button(container: HTMLElement, label: string) {
  const found = buttons(container, label)[0];
  if (!found) throw new Error(`Button was not rendered: ${label}`);
  return found;
}

function controlByLabel(container: HTMLElement, label: string) {
  const span = [...container.querySelectorAll("label > span")].find(
    (element) => normalizedText(element) === label,
  );
  const control = span
    ?.closest("label")
    ?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
  if (!control) throw new Error(`Control was not rendered: ${label}`);
  return control;
}

function setControlValue(
  control: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(
    control,
    value,
  );
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

it("creates a scoped prefix rule only after the backend accepts it", async () => {
  seedRules([]);
  const createdRule = {
    id: "rule-created",
    patternType: "prefix",
    pattern: "git commit",
    userId: "user-1",
    roomId: "room-1",
    createdAt: "2026-01-02T00:00:00.000Z",
    enabled: true,
  };
  vi.mocked(desktopRequest).mockImplementation(async (path, method, body) => {
    if (path === RULES_PATH && method === "POST") {
      return {
        rule: {
          ...createdRule,
          ...(typeof body === "object" && body ? body : {}),
        },
      };
    }
    if (path === RULES_PATH && method === "GET")
      return { rules: [createdRule] };
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const container = renderPanel();

  expect(container.textContent).toContain("No approval rules");
  await act(async () => button(container, "Create the first rule").click());
  const pattern = controlByLabel(container, "Command pattern");
  await vi.waitFor(() => expect(document.activeElement).toBe(pattern));

  act(() => {
    setControlValue(pattern, "  git commit  ");
    setControlValue(controlByLabel(container, "Match type"), "prefix");
    setControlValue(controlByLabel(container, "User ID"), " user-1 ");
    setControlValue(controlByLabel(container, "Room ID"), " room-1 ");
  });
  await act(async () => button(container, "Create rule").click());

  const postCall = vi
    .mocked(desktopRequest)
    .mock.calls.find(
      ([path, method]) => path === RULES_PATH && method === "POST",
    );
  expect(postCall?.[2]).toEqual({
    patternType: "prefix",
    pattern: "git commit",
    enabled: true,
    userId: "user-1",
    roomId: "room-1",
  });
  expect(container.textContent).toContain("Approval rule created.");
  expect(container.textContent).not.toContain("No approval rules");
  await vi.waitFor(() => expect(container.textContent).toContain("git commit"));
});

it("edits a rule with explicit nulls for cleared scopes", async () => {
  seedRules([existingRule]);
  const updatedRule = {
    ...existingRule,
    pattern: "git status --short",
    enabled: false,
    platform: undefined,
    userId: undefined,
  };
  vi.mocked(desktopRequest).mockImplementation(async (path, method) => {
    if (path === `${RULES_PATH}/rule-1` && method === "PATCH") {
      return { rule: updatedRule };
    }
    if (path === RULES_PATH && method === "GET")
      return { rules: [updatedRule] };
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const container = renderPanel();

  const row = container.querySelector<HTMLButtonElement>(".approval-rule-row");
  if (!row) throw new Error("Approval rule row was not rendered.");
  expect(row.textContent).toContain("Exact command");
  expect(row.textContent).toContain("platform cli");
  expect(row.textContent).toContain("Enabled");
  await act(async () => row.click());
  expect(row.getAttribute("aria-current")).toBe("true");

  act(() => {
    setControlValue(
      controlByLabel(container, "Command pattern"),
      "git status --short",
    );
    setControlValue(controlByLabel(container, "Platform"), "");
    setControlValue(controlByLabel(container, "User ID"), "");
  });
  const enabled = controlByLabel(container, "Enabled");
  if (!(enabled instanceof HTMLInputElement))
    throw new Error("Enabled switch was not rendered.");
  act(() => enabled.click());
  await act(async () => button(container, "Save rule").click());

  const patchCall = vi
    .mocked(desktopRequest)
    .mock.calls.find(
      ([path, method]) => path === `${RULES_PATH}/rule-1` && method === "PATCH",
    );
  expect(patchCall?.[2]).toEqual({
    patternType: "exact",
    pattern: "git status --short",
    enabled: false,
    expiresAt: null,
    platform: null,
    userId: null,
    roomId: "room-1",
    sessionKey: "room-1",
    botId: "bot-1",
    sessionId: "session-1",
  });
  expect(container.textContent).toContain("Approval rule saved.");
});

it("surfaces backend validation errors without discarding the draft", async () => {
  seedRules([]);
  vi.mocked(desktopRequest).mockImplementation(async (path, method) => {
    if (path === RULES_PATH && method === "POST") {
      throw new Error("pattern must be 1 to 1000 characters");
    }
    if (path === RULES_PATH && method === "GET") return { rules: [] };
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const container = renderPanel();

  await act(async () => button(container, "Create the first rule").click());
  const pattern = controlByLabel(container, "Command pattern");
  act(() => setControlValue(pattern, "git commit"));
  await act(async () => button(container, "Create rule").click());

  const error = container.querySelector('[role="alert"]');
  expect(error?.textContent).toBe("pattern must be 1 to 1000 characters");
  expect((pattern as HTMLInputElement).value).toBe("git commit");
  expect(container.textContent).not.toContain("Approval rule created.");
});

it("confirms before deleting and restores focus to rule creation", async () => {
  seedRules([existingRule]);
  vi.mocked(desktopRequest).mockImplementation(async (path, method) => {
    if (path === `${RULES_PATH}/rule-1` && method === "DELETE") {
      return { deleted: true };
    }
    if (path === RULES_PATH && method === "GET") return { rules: [] };
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  const container = renderPanel();

  const row = container.querySelector<HTMLButtonElement>(".approval-rule-row");
  if (!row) throw new Error("Approval rule row was not rendered.");
  await act(async () => row.click());
  await act(async () => button(container, "Delete rule").click());

  const confirmation = container.querySelector('[role="alertdialog"]');
  expect(confirmation?.textContent).toContain("Delete approval rule?");
  expect(confirmation?.textContent).toContain("git status");
  expect(normalizedText(document.activeElement as Element)).toBe("Cancel");

  const confirmButton = buttons(container, "Delete rule").at(-1);
  if (!confirmButton) throw new Error("Delete confirmation was not rendered.");
  await act(async () => confirmButton.click());

  const deleteCall = vi
    .mocked(desktopRequest)
    .mock.calls.find(
      ([path, method]) =>
        path === `${RULES_PATH}/rule-1` && method === "DELETE",
    );
  expect(deleteCall).toBeDefined();
  expect(container.textContent).toContain("Approval rule deleted.");
  await vi.waitFor(() =>
    expect(container.textContent).toContain("No approval rules"),
  );
  expect(normalizedText(document.activeElement as Element)).toBe("New rule");
});

it("distinguishes an unavailable rules API from an empty inventory", async () => {
  vi.mocked(desktopRequest).mockRejectedValue(
    new Error(
      "Backend path is not available from desktop: /execution/approval-rules",
    ),
  );
  const container = renderPanel();

  await vi.waitFor(() =>
    expect(container.textContent).toContain("Couldn't load approval rules."),
  );
  expect(container.textContent).toContain(
    "Backend path is not available from desktop: /execution/approval-rules",
  );
  expect(container.textContent).not.toContain("No approval rules");
});
