// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceComposerButton } from "./VoiceComposerButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class FakeMediaRecorder {
  static isTypeSupported = () => true;

  readonly mimeType: string;
  state: RecordingState = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("VoiceComposerButton cancellation", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: vi.fn() }],
        })),
      },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function beginPendingTranscription() {
    const result = deferred<{ transcriptText: string }>();
    const importAndTranscribe = vi.fn(
      async (
        _bytes: Uint8Array,
        _mimeType: string,
        _name: string,
        _signal: AbortSignal,
      ) => {
        await result.promise;
        return { transcriptText: "late transcript" };
      },
    );
    const onTranscript = vi.fn();

    await act(async () => {
      root.render(
        createElement(VoiceComposerButton, {
          importAndTranscribe,
          onTranscript,
        }),
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open voice dictation"]',
        )
        ?.click();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Start voice recording"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Stop voice recording and transcribe"]',
        )
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(importAndTranscribe).toHaveBeenCalledOnce();
    const signal = importAndTranscribe.mock.calls[0]?.[3];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    return { onTranscript, result, signal: signal as AbortSignal };
  }

  it("aborts an active transcription when the operator cancels", async () => {
    const pending = await beginPendingTranscription();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Cancel voice dictation"]',
        )
        ?.click();
    });

    expect(pending.signal.aborted).toBe(true);
    pending.result.resolve({ transcriptText: "late transcript" });
    await act(async () => Promise.resolve());
    expect(pending.onTranscript).not.toHaveBeenCalled();
  });

  it("aborts an active transcription on Escape", async () => {
    const pending = await beginPendingTranscription();

    await act(async () => {
      container
        .querySelector("fieldset")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
        );
    });

    expect(pending.signal.aborted).toBe(true);
  });

  it("aborts an active transcription when the composer unmounts", async () => {
    const pending = await beginPendingTranscription();

    await act(async () => root.unmount());

    expect(pending.signal.aborted).toBe(true);
    root = createRoot(container);
  });

  it("accepts transcription results after the StrictMode effect replay", async () => {
    const onTranscript = vi.fn();
    const importAndTranscribe = vi.fn(async () => ({
      transcriptText: "strict transcript",
    }));
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(VoiceComposerButton, {
            importAndTranscribe,
            onTranscript,
          }),
        ),
      );
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open voice dictation"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Start voice recording"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Stop voice recording and transcribe"]',
        )
        ?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(importAndTranscribe).toHaveBeenCalledOnce();
    expect(onTranscript).toHaveBeenCalledWith("strict transcript");
  });
});
