// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MediaLibraryTab } from "../../apps/desktop/src/renderer/media/MediaLibraryTab";

vi.mock("../../apps/desktop/src/renderer/lib", async (original) => ({
  ...(await original<object>()),
  useApiResource: (path: string | null) => {
    const audioAsset = {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "asset-audio",
      kind: "audio",
      mimeType: "audio/mpeg",
      model: "tts-model",
      name: "morning narration",
      prompt: "Read the release notes",
      provider: "openai",
      sizeBytes: 2048,
    };
    const videoAsset = {
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "asset-video",
      kind: "video",
      mimeType: "video/mp4",
      model: "offline",
      name: "launch teaser",
      prompt: "Show the launch sequence",
      provider: "offline",
      sizeBytes: 4096,
    };
    const payloadAsset =
      path === "/media/library/asset-video"
        ? videoAsset
        : path === "/media/library/asset-audio"
          ? audioAsset
          : null;
    return {
      data: payloadAsset
        ? { asset: payloadAsset, content: "", encoding: "base64" }
        : path === "/media/library"
          ? { assets: [audioAsset, videoAsset] }
          : null,
      error: "",
      loading: false,
      reload: () => {},
    };
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("names audio and video previews with the asset identity", () => {
  act(() => root.render(<MediaLibraryTab active />));

  expect(container.querySelector("audio")?.getAttribute("aria-label")).toBe(
    "Generated audio asset morning narration",
  );
  expect(container.querySelector("article")?.textContent).toContain(
    "openai · tts-model · 2.0 KB",
  );

  const videoChoice = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.includes("launch teaser"));
  expect(videoChoice).toBeTruthy();
  act(() => videoChoice?.click());

  expect(container.querySelector("video")?.getAttribute("aria-label")).toBe(
    "Generated video asset launch teaser",
  );
  expect(container.querySelector("article")?.textContent).toContain(
    "offline · 4.0 KB",
  );
  expect(container.querySelector("article")?.textContent).not.toContain(
    "offline · offline",
  );
});
