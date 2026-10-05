// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopRequestMock, useApiResourceMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
  useApiResourceMock: vi.fn(),
}));

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return {
    ...actual,
    desktopRequest: desktopRequestMock,
    useApiResource: useApiResourceMock,
  };
});

import {
  announceAppearanceApplied,
  announceDensity,
  applyDesktopAppearance,
} from "./desktop-theme";
import { KeysPage } from "./KeysPage";
import { SettingsPage } from "./SettingsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function resource(data: unknown) {
  return { data, error: "", loading: false, reload: vi.fn() };
}

describe("configuration route density", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    desktopRequestMock.mockResolvedValue({});
    useApiResourceMock.mockReset();
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        getLifecycleState: vi.fn(async () => ({
          keepRunningInBackground: false,
        })),
        getUpdateState: vi.fn(async () => ({
          phase: "up_to_date",
          message: "Up to date",
        })),
        onUpdateState: vi.fn(() => () => undefined),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  function openAdvanced() {
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[data-settings-section="system"]',
        )
        ?.click(),
    );
    act(() =>
      [...container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')]
        .find((button) => button.textContent === "Advanced")
        ?.click(),
    );
  }

  it("keeps appearance compact and exposes every runtime field through static Advanced navigation", async () => {
    useApiResourceMock.mockImplementation((path: string | null) => {
      if (path === "/settings") {
        return resource({
          settings: {
            agent: { maxIterations: 12, runDepth: "standard" },
          },
        });
      }
      if (path === "/theme") {
        return resource({
          active: "orange",
          themes: [
            {
              label: "Neon Dune",
              name: "orange",
              primary: "#ff6a00",
              secondary: "#ffb000",
              tagline: "Warm operator signal",
            },
          ],
        });
      }
      return resource(null);
    });

    await act(async () => root.render(<SettingsPage active />));

    expect(container.querySelector(".settings-search")).toBeNull();
    expect(
      container.querySelector('button[aria-label="Light: Light surfaces"]'),
    ).not.toBeNull();
    const theme = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Neon Dune: Warm operator signal"]',
    );
    expect(theme?.title).toBe("Warm operator signal");
    expect(theme?.querySelector("small")).toBeNull();

    expect(
      container.querySelector('button[data-settings-section="system"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'button[aria-label="Agent: Runtime preferences"]',
      ),
    ).toBeNull();
    openAdvanced();

    expect(
      container
        .querySelector<HTMLInputElement>(".settings-search input")
        ?.getAttribute("placeholder"),
    ).toBe("Search advanced");
    expect(container.textContent).toContain("Complete configuration");
    await act(async () => {
      [...container.querySelectorAll<HTMLElement>("summary")]
        .find((summary) => summary.textContent?.includes("Agent"))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Max Iterations");
    expect(container.textContent).toContain("Run Depth");
  });

  it("uses a balanced first-key editor without weakening reveal warnings", () => {
    useApiResourceMock.mockReturnValue(resource({ keys: [] }));

    act(() => root.render(<KeysPage active />));

    expect(
      container.querySelector('[data-inventory-empty="true"]'),
    ).not.toBeNull();
    expect(container.querySelector(".keys-editor-form")).not.toBeNull();
    expect(container.textContent).toContain(
      "No stored keys. Save the first credential here.",
    );
    expect(container.textContent).toContain(
      "Revealing a key copies its current value into the desktop renderer.",
    );
    expect(container.textContent).not.toContain("No stored keys yet");
  });

  it("keeps the settings rail and local appearance controls available during runtime loading", async () => {
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/settings"
        ? { ...resource(null), loading: true }
        : resource(null),
    );
    await act(async () => root.render(<SettingsPage active />));
    expect(
      container.querySelector('aside[aria-label="Settings categories"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Light: Light surfaces"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain(
      "Loading runtime configuration…",
    );
    openAdvanced();
    expect(container.textContent).toContain("Loading runtime configuration…");
    expect(container.querySelector(".settings-group-heading")).toBeNull();
    expect(
      container.querySelector('aside[aria-label="Settings categories"]'),
    ).not.toBeNull();
  });

  it("allows leaving a failed runtime settings category without losing navigation", async () => {
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/settings"
        ? { ...resource(null), error: "Runtime settings unavailable" }
        : resource(null),
    );
    await act(async () =>
      root.render(<SettingsPage active section="advanced" />),
    );
    expect(container.textContent).toContain("Runtime settings unavailable");
    const appearance = container.querySelector<HTMLButtonElement>(
      'button[data-settings-section="general"]',
    );
    await act(async () => appearance?.click());
    expect(container.textContent).not.toContain("Runtime settings unavailable");
    expect(
      container.querySelector('button[aria-label="Light: Light surfaces"]'),
    ).not.toBeNull();
  });

  it("synchronizes mounted appearance controls with the shell toggle and preserves System preference", async () => {
    useApiResourceMock.mockReturnValue(resource(null));
    await act(async () => root.render(<SettingsPage active />));
    const choice = (label: string) =>
      container.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
    expect(choice("Dark: Dark surfaces")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    act(() => {
      applyDesktopAppearance("light", false);
      announceAppearanceApplied("light");
    });
    expect(document.documentElement.dataset.appearance).toBe("light");
    expect(choice("Light: Light surfaces")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(choice("Dark: Dark surfaces")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(
      choice("Light: Light surfaces")?.classList.contains("selected"),
    ).toBe(true);
    act(() => {
      applyDesktopAppearance("system", true);
      announceAppearanceApplied("dark");
    });
    expect(
      choice("System: Match this device")?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(choice("Dark: Dark surfaces")?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    act(() => announceDensity("compact"));
    const compact = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Compact",
    );
    expect(compact?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps stored values concealed until an explicit reveal", async () => {
    useApiResourceMock.mockReturnValue(resource({ keys: ["OPENAI_API_KEY"] }));
    desktopRequestMock.mockResolvedValue({ value: "local-secret" });

    await act(async () => root.render(<KeysPage active />));
    const reveal = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Reveal value",
    );
    await act(async () => reveal?.click());

    expect(desktopRequestMock).toHaveBeenCalledWith("/secrets/get", "POST", {
      key: "OPENAI_API_KEY",
    });
    expect(
      container.querySelector<HTMLInputElement>('input[value="local-secret"]')
        ?.type,
    ).toBe("text");
    expect(container.textContent).toContain("Clear from renderer");
  });
});
