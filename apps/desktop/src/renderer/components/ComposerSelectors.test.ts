// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RuntimeModelProvider,
  RuntimeStatus,
} from "../../shared/contracts";

const { desktopRequestMock, liveModelsReloadMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
  liveModelsReloadMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return {
    ...actual,
    desktopRequest: desktopRequestMock,
    useApiResource: (path: string | null) => ({
      data:
        path === "/runtime/models?refresh=false"
          ? {
              activeModel: "gpt-5.6-terra",
              activeProvider: "codex",
              activeReasoningEffort: "xhigh",
              capabilities: [],
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
              ],
              refreshedAt: "2026-08-15T00:00:00.000Z",
            }
          : path === "/runtime/account-pool"
            ? { providers: {} }
            : null,
      error: "",
      loading: false,
      reload:
        path === "/runtime/models?refresh=true"
          ? liveModelsReloadMock
          : vi.fn(),
    }),
  };
});

import {
  ComposerModelSelector,
  ComposerProjectSelector,
  filteredProviders,
} from "./ComposerSelectors";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const providers: RuntimeModelProvider[] = [
  {
    id: "ollama",
    label: "Ollama",
    mode: "local",
    ready: true,
    discovery: "live",
    detail: "Local models",
    models: [
      {
        id: "granite4.1:3b",
        label: "Granite 4.1",
        source: "discovered",
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    mode: "cloud",
    ready: true,
    discovery: "configured",
    detail: "Configured models",
    models: [
      {
        id: "claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        source: "configured",
      },
    ],
  },
];

describe("composer selectors", () => {
  it("keeps the selected reasoning effort visible outside the truncating model label", () => {
    const runtime: RuntimeStatus = {
      model: "gpt-5.6-terra",
      plugins: {},
      provider: "codex",
      reasoningEffort: "xhigh",
    };
    const markup = renderToStaticMarkup(
      createElement(ComposerModelSelector, {
        active: true,
        onOpenModelsPage: vi.fn(),
        onOpenProvidersPage: vi.fn(),
        refreshRuntime: vi.fn(),
        runtime,
      }),
    );

    expect(markup).toContain("composer-model-trigger");
    expect(markup).toContain("min-w-0 truncate");
    expect(markup).toContain("shrink-0 rounded-[4px]");
    expect(markup).toContain(">gpt-5.6-terra</span>");
    expect(markup).toContain(">xhigh</span>");
    expect(markup).not.toContain("gpt-5.6-terra · xhigh");
  });

  it("renders the active project as a tabbed composer control", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        activeProjectId: "project-1",
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [
          {
            id: "project-1",
            name: "Doolittle",
            color: "#ff6a00",
            primaryPath: "/workspace/doolittle",
          },
        ],
      }),
    );

    expect(markup).toContain("composer-project-trigger");
    expect(markup).toContain("Doolittle");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Conversation project");
  });

  it("keeps the general/no-repository state accessible", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [],
      }),
    );
    expect(markup).toContain("General");
    expect(markup).toContain("General conversation without project context");
    expect(markup).toContain("Choose project. Current project General.");
    expect(markup).toContain('aria-expanded="false"');
  });

  it("preserves project trigger keyboard/dialog affordances", () => {
    const markup = renderToStaticMarkup(
      createElement(ComposerProjectSelector, {
        activeProjectId: "project-1",
        onChooseRepository: vi.fn(),
        onManageProjects: vi.fn(),
        onSelectProject: vi.fn(),
        projects: [
          { id: "project-1", name: "Doolittle", color: "#ff6a00" },
          { id: "project-2", name: "Archive", color: "#00aacc" },
        ],
      }),
    );
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain("Choose project. Current project Doolittle.");
    expect(markup).not.toContain("No matching projects.");
  });

  it("filters models across provider names, display labels, and ids", () => {
    expect(filteredProviders(providers, "granite")).toEqual([
      {
        ...providers[0],
        models: providers[0]?.models,
      },
    ]);
    expect(filteredProviders(providers, "anthropic")).toEqual([providers[1]]);
    expect(filteredProviders(providers, "missing")).toEqual([]);
  });
});

describe("ComposerModelSelector loaded catalog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    desktopRequestMock.mockResolvedValue({});
    liveModelsReloadMock.mockReset();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as { scrollIntoView?: unknown })
      .scrollIntoView;
  });

  it("shows the loaded current effort and marks the actionable model button current", () => {
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
            reasoningEffort: "xhigh",
          },
        }),
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label^="Choose model. Current route"]',
        )
        ?.click(),
    );

    const model = container.querySelector<HTMLButtonElement>(
      '[title="gpt-5.6-terra"]',
    );
    const effort = container.querySelector<HTMLButtonElement>(
      '[aria-label="GPT-5.6 Terra reasoning effort"]',
    );

    expect(model?.getAttribute("aria-current")).toBe("true");
    expect(model?.parentElement?.getAttribute("aria-current")).toBeNull();
    expect(model?.className).toContain("aria-current:bg-");
    expect(effort?.textContent).toContain("XHigh");
    expect(effort?.tagName).toBe("BUTTON");
  });

  it("uses refreshed runtime effort when the cached catalog is stale", () => {
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
            // The mocked catalog remains at XHigh, matching a still-fresh
            // resource-cache entry after this successful settings save.
            reasoningEffort: "medium",
          },
        }),
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label^="Choose model. Current route"]',
        )
        ?.click(),
    );

    const effort = container.querySelector<HTMLButtonElement>(
      '[aria-label="GPT-5.6 Terra reasoning effort"]',
    );

    expect(effort?.textContent).toContain("Medium");
    expect(effort?.textContent).not.toContain("XHigh");
  });

  it("requests a live provider refresh from the model picker", () => {
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
          },
        }),
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label^="Choose model. Current route"]',
        )
        ?.click(),
    );
    const refresh = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Refresh models"),
    );

    act(() => refresh?.click());
    expect(liveModelsReloadMock).toHaveBeenCalledOnce();
  });

  it("closes the nested effort list before the model dialog on Escape", async () => {
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
            reasoningEffort: "xhigh",
          },
        }),
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label^="Choose model. Current route"]',
    );
    act(() => trigger?.click());
    const effort = container.querySelector<HTMLButtonElement>(
      '[aria-label="GPT-5.6 Terra reasoning effort"]',
    );

    await act(async () => {
      effort?.focus();
      effort?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      ),
    );
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      ),
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("applies an effort option and returns focus to the model trigger", async () => {
    const refreshRuntime = vi.fn().mockResolvedValue(undefined);
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime,
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
            reasoningEffort: "xhigh",
          },
        }),
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label^="Choose model. Current route"]',
    );
    act(() => trigger?.click());
    const effort = container.querySelector<HTMLButtonElement>(
      '[aria-label="GPT-5.6 Terra reasoning effort"]',
    );

    await act(async () => {
      effort?.focus();
      effort?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
      await Promise.resolve();
    });
    const effortOption = document.querySelector<HTMLElement>(
      '[role="option"][data-state="unchecked"]',
    );
    expect(effortOption).not.toBeNull();

    await act(async () => {
      effortOption?.click();
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/settings",
      "POST",
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({
            path: "model.reasoningEffort",
            value: "medium",
          }),
        ]),
      }),
    );
    expect(refreshRuntime).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("clears stale effort when applying a model without reasoning support", async () => {
    act(() =>
      root.render(
        createElement(ComposerModelSelector, {
          active: true,
          onOpenModelsPage: vi.fn(),
          onOpenProvidersPage: vi.fn(),
          refreshRuntime: vi.fn(),
          runtime: {
            model: "gpt-5.6-terra",
            plugins: {},
            provider: "codex",
            reasoningEffort: "xhigh",
          },
        }),
      ),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label^="Choose model. Current route"]',
        )
        ?.click(),
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[title="granite4.1:3b"]')
        ?.click();
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/settings",
      "POST",
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({
            path: "model.reasoningEffort",
            value: null,
          }),
        ]),
      }),
    );
  });
});
