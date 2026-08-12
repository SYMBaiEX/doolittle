// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return { ...actual, useApiResource: useApiResourceMock };
});

import { MemoryPage } from "./MemoryPage";
import { ModelsPage } from "./ModelsPage";
import { RuntimePage } from "./RuntimePage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function resource(data: unknown) {
  return { data, error: "", loading: false, reload: vi.fn() };
}

describe("runtime-state route density", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => null,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockReset();
    useApiResourceMock.mockImplementation((path: string | null) => {
      if (path === "/settings") {
        return resource({
          settings: {
            model: {
              baseUrl: "http://localhost:11434/api",
              maxTokens: 1280,
              model: "granite4.1:3b",
              provider: "ollama",
              temperature: 0.4,
            },
          },
        });
      }
      if (path?.startsWith("/runtime/models")) {
        return resource({
          activeModel: "granite4.1:3b",
          activeProvider: "ollama",
          capabilities: [],
          providers: [
            {
              baseUrl: "http://localhost:11434/api",
              detail: "Local Ollama runtime",
              discovery: "configured",
              id: "ollama",
              label: "Ollama",
              mode: "local",
              models: [
                {
                  id: "granite4.1:3b",
                  label: "granite4.1:3b",
                  source: "configured",
                },
              ],
              ready: true,
            },
          ],
          refreshedAt: "2026-08-12T00:00:00.000Z",
        });
      }
      if (path === "/memory?target=memory") {
        return resource({
          snapshot: "",
          summary: { characters: 0, entries: 0, preview: [], target: "memory" },
        });
      }
      if (path === "/memory?target=user") {
        return resource({
          snapshot: "Saved operator context",
          summary: { characters: 22, entries: 1, preview: [], target: "user" },
        });
      }
      if (path === "/runtime/status") {
        return resource({
          model: "granite4.1:3b",
          plugins: {},
          provider: "ollama",
        });
      }
      if (path === "/runtime/account-pool") {
        return resource({ providers: {} });
      }
      if (path === "/autonomy/status") {
        return resource({
          data: { enabled: false, interval: 30_000, running: false },
        });
      }
      if (path === "/gateway/health") {
        return resource({
          deliveries: [],
          sessions: [],
          traces: [],
          transportControl: {},
        });
      }
      if (path === "/gateway/runtime") {
        return resource({
          messagingPlugins: [],
          transportControl: {},
          transportInventory: [],
        });
      }
      return resource(null);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps model choice primary and generation tuning collapsed", () => {
    act(() =>
      root.render(
        <ModelsPage
          active
          refreshRuntime={() => undefined}
          runtime={{ model: "granite4.1:3b", plugins: {}, provider: "ollama" }}
        />,
      ),
    );

    const tuning = container.querySelector<HTMLDetailsElement>(".model-tuning");
    expect(
      container.querySelectorAll(".form-card > .field-grid select"),
    ).toHaveLength(2);
    expect(tuning?.open).toBe(false);
    expect(tuning?.textContent).toContain("Generation controls");
    expect(container.querySelectorAll(".model-diagnostic")).toHaveLength(2);

    act(() => tuning?.querySelector("summary")?.click());

    expect(tuning?.open).toBe(true);
    expect(tuning?.querySelector('input[type="number"]')).not.toBeNull();
  });

  it("switches bounded memory targets without rendering tab descriptions", () => {
    act(() => root.render(<MemoryPage active />));

    const user = container.querySelector<HTMLButtonElement>(
      '[aria-label="User: Saved operator details for the current desktop user"]',
    );
    expect(container.textContent).toContain("No stored entries yet");
    expect(container.textContent).not.toContain(
      "Conversation knowledge available across the workspace",
    );

    act(() =>
      user?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      ),
    );

    expect(user?.dataset.state).toBe("active");
    expect(container.textContent).toContain("Saved operator context");
    expect(useApiResourceMock).toHaveBeenCalledWith("/memory?target=user", [
      true,
    ]);
  });

  it("loads only the selected compact runtime section", () => {
    act(() => root.render(<RuntimePage active />));

    expect(container.textContent).toContain("Account routing");
    expect(container.textContent).toContain("Autonomy loop");
    expect(container.textContent).not.toContain("Conversation model");
    expect(
      container.querySelectorAll(".runtime-overview-grid > section"),
    ).toHaveLength(2);
    expect(
      container.querySelector(".runtime-autonomy-controls"),
    ).not.toBeNull();
    const gateway = container.querySelector<HTMLButtonElement>(
      '[aria-label="Gateway: Transports and deliveries"]',
    );

    act(() =>
      gateway?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      ),
    );

    expect(gateway?.dataset.state).toBe("active");
    expect(useApiResourceMock).toHaveBeenCalledWith("/gateway/health", [true]);
    expect(useApiResourceMock).toHaveBeenCalledWith("/gateway/runtime", [true]);
    expect(container.textContent).toContain("Transport control");
  });
});
