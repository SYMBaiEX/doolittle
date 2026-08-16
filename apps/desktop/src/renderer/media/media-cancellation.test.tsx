// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopRequestMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return { ...actual, desktopRequest: desktopRequestMock };
});

import { ImageTab } from "./ImageTab";
import { InspectAnalyzeTab } from "./InspectAnalyzeTab";
import { SpeechTab } from "./SpeechTab";
import { TranscribeTab } from "./TranscribeTab";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setField(container: HTMLElement, selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  );
  if (!field) throw new Error(`Missing field: ${selector}`);
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickButton(container: HTMLElement, label: string) {
  const button = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((candidate) => candidate.textContent === label);
  button?.click();
}

describe("media request cancellation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it.each([
    {
      name: "image generation",
      component: ImageTab,
      field: "#media-image-prompt",
      value: "A skyline",
      action: "Generate",
      path: "/media/generate",
      cancel: "Cancel image generation",
    },
    {
      name: "speech generation",
      component: SpeechTab,
      field: "#media-speech-text",
      value: "Read this aloud",
      action: "Generate speech",
      path: "/media/speak",
      cancel: "Cancel speech generation",
    },
    {
      name: "transcription",
      component: TranscribeTab,
      field: "#media-transcribe-path",
      value: "/tmp/meeting.wav",
      action: "Transcribe",
      path: "/media/transcribe",
      cancel: "Cancel transcription",
    },
    {
      name: "inspection",
      component: InspectAnalyzeTab,
      field: "#media-inspect-path",
      value: "/tmp/meeting.wav",
      action: "Inspect",
      path: "/media/inspect?path=%2Ftmp%2Fmeeting.wav",
      cancel: "Cancel media inspection",
    },
    {
      name: "analysis",
      component: InspectAnalyzeTab,
      field: "#media-inspect-path",
      value: "/tmp/meeting.wav",
      action: "Analyze",
      path: "/media/analyze",
      cancel: "Cancel media analysis",
    },
  ])(
    "forwards an AbortSignal and exposes Cancel for $name",
    async (testCase) => {
      const pending = deferred<unknown>();
      desktopRequestMock.mockReturnValueOnce(pending.promise);

      await act(async () => {
        root.render(createElement(testCase.component, { active: true }));
      });
      await act(async () => {
        setField(container, testCase.field, testCase.value);
      });
      await act(async () => {
        clickButton(container, testCase.action);
        await Promise.resolve();
      });

      const requestCall = desktopRequestMock.mock.calls[0];
      expect(requestCall?.[0]).toBe(testCase.path);
      expect(requestCall?.[3]).toBeInstanceOf(AbortSignal);
      const signal = requestCall?.[3] as AbortSignal;
      expect(signal.aborted).toBe(false);
      expect(
        container.querySelector(`button[aria-label="${testCase.cancel}"]`),
      ).not.toBeNull();

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            `button[aria-label="${testCase.cancel}"]`,
          )
          ?.click();
      });
      expect(signal.aborted).toBe(true);
      expect(
        container.querySelector<HTMLButtonElement>(
          `button[aria-label="${testCase.cancel}"]`,
        ),
      ).toBeNull();
      expect(
        [...container.querySelectorAll<HTMLButtonElement>("button")].find(
          (candidate) => candidate.textContent === testCase.action,
        )?.disabled,
      ).toBe(false);
    },
  );

  it("suppresses a late cancelled completion and restores the form", async () => {
    const pending = deferred<{ generation: Record<string, unknown> }>();
    desktopRequestMock.mockReturnValueOnce(pending.promise);
    await act(async () => {
      root.render(createElement(ImageTab, { active: true }));
      await Promise.resolve();
    });
    await act(async () => {
      setField(container, "#media-image-prompt", "A skyline");
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click();
      await Promise.resolve();
    });
    const signal = desktopRequestMock.mock.calls[0]?.[3] as AbortSignal;

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Cancel image generation"]',
        )
        ?.click();
      pending.resolve({ generation: { path: "/tmp/late.png" } });
      await Promise.resolve();
    });

    expect(signal.aborted).toBe(true);
    expect(container.textContent).not.toContain("Image result");
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled,
    ).toBe(false);
  });

  it("aborts an active media request on unmount", async () => {
    const pending = deferred<unknown>();
    desktopRequestMock.mockReturnValueOnce(pending.promise);
    await act(async () => {
      root.render(createElement(ImageTab, { active: true }));
      await Promise.resolve();
    });
    await act(async () => {
      setField(container, "#media-image-prompt", "A skyline");
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click();
      await Promise.resolve();
    });
    const signal = desktopRequestMock.mock.calls[0]?.[3] as AbortSignal;

    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    root = createRoot(container);
  });

  it("aborts an active request when its tab is hidden", async () => {
    const pending = deferred<unknown>();
    desktopRequestMock.mockReturnValueOnce(pending.promise);
    await act(async () => {
      root.render(createElement(ImageTab, { active: true }));
      await Promise.resolve();
    });
    await act(async () => {
      setField(container, "#media-image-prompt", "A skyline");
      container
        .querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.click();
      await Promise.resolve();
    });
    const signal = desktopRequestMock.mock.calls[0]?.[3] as AbortSignal;

    await act(async () => {
      root.render(createElement(ImageTab, { active: false }));
      await Promise.resolve();
    });

    expect(signal.aborted).toBe(true);
  });
});
