// @vitest-environment jsdom
import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RuntimeModelsResponse,
  RuntimeStatus,
} from "../../shared/contracts";
import { type ApiResource, desktopRequest, useApiResource } from "../lib";
import { BotCreationConversation } from "./BotCreationConversation";
import { botCharacterDraft } from "./bot-character-draft";

vi.mock("../lib", () => ({
  desktopRequest: vi.fn(),
  useApiResource: vi.fn(),
  errorMessage: () => "Could not save this bot.",
}));

describe("conversational bot creation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let raf: ReturnType<typeof vi.spyOn>;
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const reloadModels = vi.fn();
  const catalog: RuntimeModelsResponse = {
    activeProvider: "offline",
    activeModel: "test",
    refreshedAt: "2026-10-12T00:00:00.000Z",
    capabilities: [],
    providers: [
      {
        id: "offline",
        label: "Local fixture",
        mode: "local",
        ready: true,
        discovery: "configured",
        detail: "Configured fixture route",
        models: [{ id: "test", label: "Test model", source: "configured" }],
      },
      {
        id: "openai",
        label: "Connected provider",
        mode: "cloud",
        ready: true,
        discovery: "configured",
        detail: "Host is ready; bot grants remain separate",
        models: [
          { id: "writer", label: "Writer", source: "configured" },
          { id: "fast", label: "Fast", source: "discovered" },
        ],
      },
    ],
  };
  let modelResource: ApiResource<RuntimeModelsResponse>;
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.clearAllMocks();
    modelResource = {
      data: catalog,
      error: "",
      loading: false,
      reload: reloadModels,
    };
    vi.mocked(useApiResource).mockImplementation(() => modelResource);
    vi.mocked(desktopRequest).mockResolvedValue({
      providers: {
        offline: {
          accounts: [
            { accountId: "local", label: "Local test", enabled: true },
          ],
        },
      },
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    await act(async () =>
      root.render(
        <BotCreationConversation
          onClose={onClose}
          onCreated={onCreated}
          runtime={{ provider: "offline", model: "test" } as RuntimeStatus}
        />,
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    raf.mockRestore();
  });
  const button = (text: string) =>
    [...host.querySelectorAll("button")].find(
      (entry) => entry.textContent?.trim() === text,
    );
  const change = async (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    value: string,
  ) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : input instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(
        new Event(input instanceof HTMLSelectElement ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
  };
  const interview = async () => {
    await act(async () => button("Research and writing")?.click());
    await act(async () =>
      button(
        "Clear and direct. Explain decisions and verify results.",
      )?.click(),
    );
    const answer = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Your answer"]',
    );
    if (!answer) throw new Error("Missing interview answer");
    await change(answer, "Ada");
    await act(async () =>
      host
        .querySelector<HTMLFormElement>("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
  };
  const review = async () => {
    await interview();
    await act(async () => button("Review model and access")?.click());
  };
  const select = (label: string) => {
    const control = [...host.querySelectorAll("label")]
      .find((entry) => entry.firstChild?.textContent === label)
      ?.querySelector("select");
    if (!control) throw new Error(`Missing ${label} selection`);
    return control;
  };
  const rerender = async (runtime: RuntimeStatus | null, key?: string) => {
    await act(async () =>
      root.render(
        <BotCreationConversation
          key={key}
          onClose={onClose}
          onCreated={onCreated}
          runtime={runtime}
        />,
      ),
    );
  };

  it("starts inside the conversation, focuses the answer and validates empty replies", async () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    await act(async () =>
      host
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Type an answer",
    );
    expect(desktopRequest).toHaveBeenCalledTimes(1);
  });

  it("gathers answers and previews native character fields without pretending to generate a model answer", async () => {
    await interview();
    expect(host.textContent).toContain("Meet Ada");
    expect(host.textContent).toContain("This draft comes from your answers");
    expect(host.textContent).toContain(
      "native Eliza system, bio and style fields",
    );
    expect(desktopRequest).toHaveBeenCalledTimes(1);
  });

  it("creates a native sheet without an implicit workspace or account grant", async () => {
    await review();
    const saved = { id: "ada", name: "Ada", state: "stopped" } as BotSummary;
    vi.mocked(desktopRequest).mockResolvedValueOnce(saved);
    expect(
      [
        ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].every((entry) => !entry.checked),
    ).toBe(true);
    await act(async () => button("Create Ada")?.click());
    expect(desktopRequest).toHaveBeenLastCalledWith("/bots", "POST", {
      name: "Ada",
      character: botCharacterDraft(
        "Research and writing",
        "Clear and direct. Explain decisions and verify results.",
      ),
      model: { provider: "offline", model: "test" },
      permissions: {
        connectionIds: [],
        toolIds: [],
        allowMutation: false,
        allowDelegation: false,
      },
    });
    expect(host.textContent).not.toContain("Workspace path");
    expect(onCreated).toHaveBeenCalledWith(saved);
  });

  it("keeps the draft and provides an actionable error when save fails", async () => {
    await review();
    vi.mocked(desktopRequest).mockRejectedValueOnce(
      new Error("private detail"),
    );
    await act(async () => button("Create Ada")?.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not save this bot.",
    );
    expect(host.textContent).toContain("Ada");
    expect(button("Create Ada")?.disabled).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("prevents duplicate same-render submissions and cancellation during save", async () => {
    await review();
    let resolveSave!: (bot: BotSummary) => void;
    vi.mocked(desktopRequest).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    await act(async () => {
      button("Create Ada")?.click();
      button("Create Ada")?.click();
    });
    expect(
      vi
        .mocked(desktopRequest)
        .mock.calls.filter((entry) => entry[0] === "/bots"),
    ).toHaveLength(1);
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Cancel bot creation"]',
      )?.disabled,
    ).toBe(true);
    await act(async () =>
      resolveSave({ id: "ada", name: "Ada" } as BotSummary),
    );
  });

  it("can revise the previous answer without granting access", async () => {
    await interview();
    await act(async () => button("Previous answer")?.click());
    expect(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Your answer"]',
      )?.value,
    ).toBe("Ada");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("uses configured catalog selections without treating host readiness as a bot grant", async () => {
    await review();
    expect(useApiResource).toHaveBeenCalledWith(
      "/runtime/models?refresh=false",
      [false],
    );
    expect(
      [...select("Provider").options].map((option) => option.text),
    ).toEqual(["Local fixture", "Connected provider"]);
    expect(select("Model").value).toBe("test");
    await change(select("Provider"), "openai");
    expect(select("Model").value).toBe("writer");
    expect([...select("Model").options].map((option) => option.value)).toEqual([
      "writer",
      "fast",
    ]);
    expect(
      [
        ...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
      ].every((input) => !input.checked),
    ).toBe(true);
    await change(select("Model"), "fast");
    vi.mocked(desktopRequest).mockResolvedValueOnce({ id: "ada", name: "Ada" });
    await act(async () => button("Create Ada")?.click());
    const input = vi.mocked(desktopRequest).mock.calls.at(-1)?.[2];
    expect(input).toMatchObject({
      model: { provider: "openai", model: "fast" },
      permissions: {
        connectionIds: [],
        allowMutation: false,
        allowDelegation: false,
      },
    });
  });

  it("retains the initial current route explicitly when discovery is empty and ambient runtime changes", async () => {
    modelResource.data = { ...catalog, providers: [] };
    await rerender({ provider: "openai", model: "fast" } as RuntimeStatus);
    await review();
    expect(select("Provider").value).toBe("offline");
    expect(select("Provider").selectedOptions[0]?.text).toContain(
      "Current route",
    );
    expect(select("Model").value).toBe("test");
    expect(host.textContent).toContain("availability has not been verified");
    expect(button("Create Ada")?.disabled).toBe(false);
    vi.mocked(desktopRequest).mockResolvedValueOnce({ id: "ada", name: "Ada" });
    await act(async () => button("Create Ada")?.click());
    expect(vi.mocked(desktopRequest).mock.calls.at(-1)?.[2]).toMatchObject({
      model: { provider: "offline", model: "test" },
    });
    expect(vi.mocked(desktopRequest).mock.calls.at(-1)?.[2]).not.toHaveProperty(
      "workspacePath",
    );
    expect(vi.mocked(desktopRequest).mock.calls.at(-1)?.[2]).not.toHaveProperty(
      "projectId",
    );
  });

  it("retains a current model absent from the catalog without creating an API catalog entry", async () => {
    modelResource.data = {
      ...catalog,
      providers: catalog.providers
        .filter((provider) => provider.id === "offline")
        .map((provider) => ({ ...provider, models: [] })),
    };
    await rerender({ provider: "offline", model: "test" } as RuntimeStatus);
    await review();
    expect(select("Model").selectedOptions[0]?.text).toBe(
      "test · Current route",
    );
    expect(modelResource.data.providers[0]?.models).toEqual([]);
  });

  it("disables creation while loading with no current route and offers no fabricated options", async () => {
    modelResource.data = null;
    modelResource.loading = true;
    await rerender(null, "without-current-route");
    await review();
    expect(host.textContent).toContain("Loading model catalog");
    expect(select("Provider").disabled).toBe(true);
    expect(select("Model").disabled).toBe(true);
    expect(button("Create Ada")?.disabled).toBe(true);
    expect(button("Refresh models")?.disabled).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("exposes discovery failure and retries without authorizing a fallback route", async () => {
    modelResource.data = null;
    modelResource.error = "Catalog discovery failed";
    await rerender(null, "without-current-route");
    await review();
    expect(host.textContent).toContain("Model catalog unavailable");
    expect(button("Create Ada")?.disabled).toBe(true);
    await act(async () => button("Retry models")?.click());
    expect(useApiResource).toHaveBeenLastCalledWith(
      "/runtime/models?refresh=true",
      [true],
    );
    await act(async () => button("Retry models")?.click());
    expect(reloadModels).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(desktopRequest).mock.calls.some(([path]) => path === "/bots"),
    ).toBe(false);
  });

  it("reports an empty catalog and requires an actual provider/model pair", async () => {
    modelResource.data = { ...catalog, providers: [] };
    await rerender(null, "without-current-route");
    await review();
    expect(host.textContent).toContain("No model routes available");
    expect(button("Create Ada")?.disabled).toBe(true);
    modelResource.data = catalog;
    await rerender(null, "without-current-route");
    expect(button("Create Ada")?.disabled).toBe(true);
    await change(select("Provider"), "openai");
    expect(select("Model").value).toBe("writer");
    expect(button("Create Ada")?.disabled).toBe(false);
  });

  it("blocks a selected non-current model removed by catalog refresh", async () => {
    await review();
    await change(select("Provider"), "openai");
    await change(select("Model"), "fast");
    modelResource.data = {
      ...catalog,
      providers: catalog.providers
        .filter((provider) => provider.id === "openai")
        .map((provider) => ({ ...provider, models: [] })),
    };
    await rerender({ provider: "offline", model: "test" } as RuntimeStatus);
    expect(select("Model").value).toBe("");
    expect(button("Create Ada")?.disabled).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("reports unsaved answers to the host without sharing their contents", async () => {
    const onDirtyChange = vi.fn();
    await act(async () =>
      root.render(
        <BotCreationConversation
          onClose={onClose}
          onCreated={onCreated}
          onDirtyChange={onDirtyChange}
          runtime={null}
        />,
      ),
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await act(async () => button("Research and writing")?.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(
      onDirtyChange.mock.calls.every(
        (entry) => entry.length === 1 && typeof entry[0] === "boolean",
      ),
    ).toBe(true);
  });
});
