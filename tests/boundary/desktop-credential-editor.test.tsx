// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { desktopRequest } from "../../apps/desktop/src/renderer/eliza-client";
import { KeysPage } from "../../apps/desktop/src/renderer/KeysPage";
import {
  apiResourceCacheKey,
  desktopQueryClient,
} from "../../apps/desktop/src/renderer/lib";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(),
}));

it("serializes credential edits and ignores a pending reveal after hiding", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  let resolveReveal: (value: { value: string }) => void = () => {};
  const pendingReveal = new Promise<{ value: string }>((resolve) => {
    resolveReveal = resolve;
  });
  desktopQueryClient.setQueryData([apiResourceCacheKey("/secrets", [true])], {
    keys: ["FIXTURE_KEY"],
  });
  vi.mocked(desktopRequest).mockReturnValue(pendingReveal);

  try {
    act(() => root.render(<KeysPage active />));
    const key = container.querySelector<HTMLInputElement>("#secret-key-name");
    const value =
      container.querySelector<HTMLInputElement>("#secret-key-value");
    const save = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(key?.value).toBe("FIXTURE_KEY");
    const reveal = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reveal value",
    );
    act(() => reveal?.click());
    expect(desktopRequest).toHaveBeenCalledWith("/secrets/get", "POST", {
      key: "FIXTURE_KEY",
    });
    expect(save?.disabled).toBe(true);
    expect(key?.disabled).toBe(true);

    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => resolveReveal({ value: "fixture-value" }));

    expect(value?.type).toBe("password");
    expect(value?.value).toBe("");
    expect(save?.disabled).toBe(false);
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    visibility.mockRestore();
    vi.mocked(desktopRequest).mockReset();
  }
});

it("opens a fresh key editor without carrying forward a revealed value", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const saved = { keys: ["FIXTURE_KEY", "OTHER_FIXTURE_KEY"] };
  desktopQueryClient.setQueryData(
    [apiResourceCacheKey("/secrets", [true])],
    saved,
  );
  vi.mocked(desktopRequest).mockImplementation(async (path) =>
    path === "/secrets/get" ? { value: "synthetic-test-value" } : saved,
  );
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (item) => item.textContent === label,
    );
  try {
    await act(async () => root.render(<KeysPage active />));
    await act(async () => button("Reveal value")?.click());
    const name = container.querySelector<HTMLInputElement>("#secret-key-name");
    const value =
      container.querySelector<HTMLInputElement>("#secret-key-value");
    expect(value?.value).toBe("synthetic-test-value");

    act(() => button("New key")?.click());
    expect(name?.value).toBe("");
    expect(document.activeElement).toBe(name);
    expect(value?.value).toBe("");
    expect(value?.type).toBe("password");
    expect(button("Save key")?.disabled).toBe(true);
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();

    act(() => button("OTHER_FIXTURE_KEY")?.click());
    expect(name?.value).toBe("OTHER_FIXTURE_KEY");
    expect(value?.value).toBe("");
    expect(
      vi
        .mocked(desktopRequest)
        .mock.calls.filter(([path]) => path === "/secrets/get"),
    ).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    visibility.mockRestore();
    vi.mocked(desktopRequest).mockReset();
  }
});

it("keeps a failed save inline with its draft and retries without retyping", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const guidance =
    "Secure storage is locked or unavailable. Unlock your system keychain, then save again.";
  let saveAttempts = 0;
  desktopQueryClient.setQueryData([apiResourceCacheKey("/secrets", [true])], {
    keys: [],
  });
  vi.mocked(desktopRequest).mockImplementation(async (path) => {
    if (path === "/secrets/set") {
      saveAttempts += 1;
      if (saveAttempts === 1) throw new Error(guidance);
      return { key: "FIXTURE_KEY", valueSet: true };
    }
    // The SDK can retain the name in memory even when durable mirroring fails.
    return { keys: saveAttempts >= 1 ? ["FIXTURE_KEY"] : [] };
  });
  try {
    await act(async () => root.render(<KeysPage active />));
    const name = container.querySelector<HTMLInputElement>("#secret-key-name");
    const value =
      container.querySelector<HTMLInputElement>("#secret-key-value");
    const save = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setValue?.call(name, "FIXTURE_KEY");
      name?.dispatchEvent(new Event("input", { bubbles: true }));
      setValue?.call(value, "synthetic-fixture-value");
      value?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => save?.click());

    const error = container.querySelector('[role="alert"]');
    expect(error?.textContent).toBe(guidance);
    expect(error?.closest("form")).toBe(save?.closest("form"));
    expect(save?.closest("form")?.getAttribute("aria-describedby")).toBe(
      error?.id,
    );
    expect(name?.value).toBe("FIXTURE_KEY");
    expect(value?.value).toBe("synthetic-fixture-value");
    expect(value?.type).toBe("password");
    expect(save?.disabled).toBe(false);
    expect(container.textContent).not.toContain("Stored FIXTURE_KEY");

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Refresh")
        ?.click();
    });
    await vi.waitFor(() => expect(container.textContent).toContain("1 key"));
    expect(container.textContent).not.toContain("1 stored");
    expect(
      container.querySelector('button[aria-pressed="true"]')?.textContent,
    ).toContain("Save failed");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      guidance,
    );

    await act(async () => save?.click());
    expect(saveAttempts).toBe(2);
    await vi.waitFor(() =>
      expect(
        container.querySelector('button[aria-pressed="true"]')?.textContent,
      ).toBe("FIXTURE_KEY"),
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("Save failed");
    expect(container.textContent).toContain("Stored FIXTURE_KEY.");
    expect(value?.value).toBe("");
    expect(value?.type).toBe("password");
  } finally {
    act(() => root.unmount());
    container.remove();
    desktopQueryClient.clear();
    visibility.mockRestore();
    vi.mocked(desktopRequest).mockReset();
  }
});
