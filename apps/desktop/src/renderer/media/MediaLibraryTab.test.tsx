// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  useApiResource: useApiResourceMock,
}));

import { MediaLibraryTab } from "./MediaLibraryTab";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const image = {
  id: "image-1",
  name: "Workbench image",
  kind: "image",
  mimeType: "image/png",
  sizeBytes: 1024,
  createdAt: "2026-10-03T12:00:00Z",
  prompt: "Workbench",
  provider: "local",
  model: "image",
};
const audio = {
  ...image,
  id: "audio-1",
  name: "Voice recording",
  kind: "audio",
  mimeType: "audio/wav",
  model: "voice",
};
const resource = (data: unknown) => ({
  data,
  loading: false,
  error: "",
  reload: vi.fn(),
});

describe("MediaLibraryTab state continuity", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the matching asset and never renders another asset's payload after a type change", () => {
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/media/library"
        ? resource({ assets: [image, audio] })
        : resource({ asset: image, encoding: "base64", content: "aW1hZ2U=" }),
    );
    act(() => root.render(<MediaLibraryTab active revision={0} />));
    expect(container.querySelector("img")).not.toBeNull();
    const audioFilter = container.querySelector<HTMLButtonElement>(
      "fieldset button:nth-child(3)",
    );
    act(() => audioFilter?.click());
    expect(audioFilter?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("article h2")?.textContent).toBe(
      "Voice recording",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("audio")).toBeNull();
    expect(useApiResourceMock).toHaveBeenCalledWith("/media/library/audio-1", [
      "audio-1",
    ]);
  });

  it("clears filters from a no-results state and restores the selected output", () => {
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/media/library"
        ? resource({ assets: [image] })
        : resource(null),
    );
    act(() => root.render(<MediaLibraryTab active revision={0} />));
    const input = container.querySelector("input");
    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "missing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("article")).toBeNull();
    expect(container.textContent).toContain("No assets match these filters");
    const clear = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear filters",
    );
    act(() => clear?.click());
    expect(input?.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector("article h2")?.textContent).toBe(
      "Workbench image",
    );
  });

  it("offers retry for a failed library without speculative empty content", () => {
    const reload = vi.fn();
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/media/library"
        ? { ...resource(null), error: "Library unavailable", reload }
        : resource(null),
    );
    act(() => root.render(<MediaLibraryTab active revision={0} />));
    expect(container.textContent).not.toContain("No generated assets yet");
    expect(container.textContent).not.toContain("Generated work, in one place");
    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    );
    act(() => retry?.click());
    expect(reload).toHaveBeenCalledOnce();
  });

  it("selects the right-clicked asset and keeps its media element mounted while refreshing the menu", async () => {
    const reload = vi.fn();
    useApiResourceMock.mockImplementation((path: string | null) =>
      path === "/media/library"
        ? { ...resource({ assets: [image, audio] }), reload }
        : resource({
            asset: path?.endsWith("audio-1") ? audio : image,
            encoding: "base64",
            content: "aW1hZ2U=",
          }),
    );
    await act(async () => root.render(<MediaLibraryTab active revision={0} />));
    const target = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Voice recording"),
    );
    await act(async () =>
      target?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "View asset")
        ?.click(),
    );
    const media = container.querySelector("audio");
    expect(media).not.toBeNull();
    await act(async () =>
      target?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === "Refresh asset library")
        ?.click(),
    );
    expect(reload).toHaveBeenCalledOnce();
    expect(container.querySelector("audio")).toBe(media);
    await act(async () =>
      target?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () =>
      root.render(<MediaLibraryTab active={false} revision={0} />),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
