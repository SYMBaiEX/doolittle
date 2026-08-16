// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RuntimeModelProvider,
  RuntimeReasoningEffort,
} from "../../shared/contracts";
import { RouteControlDialog } from "./RouteControlDialog";

const { desktopRequestMock, scenario } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
  scenario: {
    modelsError: "",
    modelsReload: vi.fn(),
    model: {
      model: "gpt-5.6-terra",
      provider: "codex",
      reasoningEffort: "xhigh",
    } as {
      model: string;
      provider: string;
      reasoningEffort?: RuntimeReasoningEffort;
    },
    providers: [
      {
        detail: "Configured models",
        discovery: "configured",
        id: "codex",
        label: "Codex",
        mode: "cloud",
        models: [
          {
            id: "gpt-5.6-terra",
            label: "GPT-5.6 Terra",
            reasoning: {
              default: "medium",
              options: [
                { id: "medium", label: "Medium" },
                { id: "xhigh", label: "XHigh" },
              ],
            },
            source: "configured",
          },
        ],
        ready: true,
      },
    ] as RuntimeModelProvider[],
  },
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return {
    ...actual,
    desktopRequest: desktopRequestMock,
    useApiResource: (path: string | null) => ({
      data:
        path === "/settings"
          ? { settings: { model: scenario.model } }
          : path === "/runtime/accounts"
            ? { accounts: {} }
            : path === "/runtime/models?refresh=false"
              ? {
                  activeModel: scenario.model.model,
                  activeProvider: scenario.model.provider,
                  capabilities: [],
                  providers: scenario.providers,
                  refreshedAt: "2026-08-15T00:00:00.000Z",
                }
              : null,
      error:
        path === "/runtime/models?refresh=false" ? scenario.modelsError : "",
      loading: false,
      reload:
        path === "/runtime/models?refresh=false"
          ? scenario.modelsReload
          : vi.fn(),
    }),
  };
});

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("RouteControlDialog reasoning effort", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    desktopRequestMock.mockResolvedValue({});
    scenario.modelsError = "";
    scenario.modelsReload.mockReset();
    scenario.model = {
      model: "gpt-5.6-terra",
      provider: "codex",
      reasoningEffort: "xhigh",
    };
    scenario.providers = [
      {
        detail: "Configured models",
        discovery: "configured",
        id: "codex",
        label: "Codex",
        mode: "cloud",
        models: [
          {
            id: "gpt-5.6-terra",
            label: "GPT-5.6 Terra",
            reasoning: {
              default: "medium",
              options: [
                { id: "medium", label: "Medium" },
                { id: "xhigh", label: "XHigh" },
              ],
            },
            source: "configured",
          },
        ],
        ready: true,
      },
    ];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderDialog = () =>
    act(() =>
      root.render(
        createElement(RouteControlDialog, {
          isOpen: true,
          onClose: vi.fn(),
          onOpenModelsPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: scenario.model.model,
            plugins: {},
            provider: scenario.model.provider,
            reasoningEffort: scenario.model.reasoningEffort,
          },
        }),
      ),
    );

  it("selects and atomically saves a supported reasoning effort", async () => {
    renderDialog();

    const close = container.querySelector<HTMLButtonElement>(
      '[aria-label="Close route controls"]',
    );
    const effort = container.querySelector<HTMLSelectElement>(
      '[aria-label="Reasoning effort"]',
    );
    expect(document.activeElement).toBe(close);
    expect(effort?.value).toBe("xhigh");

    await act(async () => {
      if (effort) {
        effort.value = "medium";
        effort.dispatchEvent(new Event("change", { bubbles: true }));
      }
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/settings",
      "POST",
      expect.objectContaining({
        changes: expect.arrayContaining([
          { path: "model.reasoningEffort", value: "medium" },
        ]),
      }),
    );
  });

  it("clears stale reasoning effort when the target model has no support", async () => {
    scenario.model = {
      model: "granite4.1:3b",
      provider: "ollama",
      reasoningEffort: "xhigh",
    };
    scenario.providers = [
      {
        detail: "Local models",
        discovery: "configured",
        id: "ollama",
        label: "Ollama",
        mode: "local",
        models: [
          {
            id: "granite4.1:3b",
            label: "Granite 4.1",
            source: "configured",
          },
        ],
        ready: true,
      },
    ];
    renderDialog();

    expect(
      container.querySelector('[aria-label="Reasoning effort"]'),
    ).toBeNull();
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/settings",
      "POST",
      expect.objectContaining({
        changes: expect.arrayContaining([
          { path: "model.reasoningEffort", value: null },
        ]),
      }),
    );
  });

  it("shows a retryable catalog error instead of remaining in a loading state", () => {
    scenario.modelsError = "Model catalog is unavailable";
    renderDialog();

    expect(container.textContent).toContain("Could not load this view.");
    expect(container.textContent).not.toContain("Loading route controls…");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry).toBeDefined();

    act(() => retry?.click());
    expect(scenario.modelsReload).toHaveBeenCalledOnce();
  });

  it("preserves supported effort for a whitespace-pasted model and saves its trimmed ID", async () => {
    renderDialog();

    const model = container.querySelector<HTMLInputElement>(
      'input[placeholder="granite4.1:3b"]',
    );
    await act(async () => {
      if (model) {
        model.value = "  gpt-5.6-terra  ";
        model.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await Promise.resolve();
    });

    const effort = container.querySelector<HTMLSelectElement>(
      '[aria-label="Reasoning effort"]',
    );
    expect(effort?.value).toBe("xhigh");

    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/settings",
      "POST",
      expect.objectContaining({
        changes: expect.arrayContaining([
          { path: "model.model", value: "gpt-5.6-terra" },
          { path: "model.reasoningEffort", value: "xhigh" },
        ]),
      }),
    );
  });
});
