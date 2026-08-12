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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("keeps appearance compact and reveals search only for field categories", () => {
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

    act(() => root.render(<SettingsPage active />));

    expect(container.querySelector(".settings-search")).toBeNull();
    expect(
      container.querySelector('button[aria-label="Light: Light surfaces"]'),
    ).not.toBeNull();
    const theme = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Neon Dune: Warm operator signal"]',
    );
    expect(theme?.title).toBe("Warm operator signal");
    expect(theme?.querySelector("small")).toBeNull();

    const agentCategory = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Agent: Runtime preferences"]',
    );
    act(() => agentCategory?.click());

    expect(
      container
        .querySelector<HTMLInputElement>(".settings-search input")
        ?.getAttribute("placeholder"),
    ).toBe("Search agent");
    expect(container.textContent).toContain("Max Iterations");
    expect(container.textContent).toContain("Run Depth");
  });

  it("uses a balanced first-key editor without weakening reveal warnings", () => {
    useApiResourceMock.mockReturnValue(resource({ keys: [] }));

    act(() => root.render(<KeysPage active />));

    expect(container.querySelector(".split-workspace.is-empty")).not.toBeNull();
    expect(container.querySelector(".keys-editor-form")).not.toBeNull();
    expect(container.textContent).toContain(
      "No stored keys. Save the first credential here.",
    );
    expect(container.textContent).toContain(
      "Revealing a key copies its current value into the desktop renderer.",
    );
    expect(container.textContent).not.toContain("No stored keys yet");
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
