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
      document.body
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Start voice recording"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      document.body
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
    return {
      importAndTranscribe,
      onTranscript,
      result,
      signal: signal as AbortSignal,
    };
  }

  it("aborts an active transcription when the operator cancels", async () => {
    const pending = await beginPendingTranscription();

    await act(async () => {
      document.body
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
      document.body
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

  it("portals controls without requesting microphone access on disclosure", async () => {
    await act(async () => {
      root.render(
        createElement(VoiceComposerButton, {
          importAndTranscribe: vi.fn(),
          onTranscript: vi.fn(),
        }),
      );
    });
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open voice dictation"]',
    );
    await act(async () => trigger?.click());

    const controls = document.body.querySelector("fieldset");
    expect(controls).not.toBeNull();
    expect(container.contains(controls)).toBe(false);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Start voice recording",
    );

    await act(async () => {
      controls?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(document.body.querySelector("fieldset")).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("hides inactive controls without aborting their owner transcription or stealing focus", async () => {
    const pending = await beginPendingTranscription();
    const nextComposer = document.createElement("textarea");
    container.append(nextComposer);

    await act(async () => {
      root.render(
        createElement(VoiceComposerButton, {
          importAndTranscribe: pending.importAndTranscribe,
          onTranscript: pending.onTranscript,
          presentationActive: false,
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.querySelector("fieldset")).toBeNull();
    expect(document.activeElement).not.toBe(
      container.querySelector('button[aria-label="Open voice dictation"]'),
    );
    expect(pending.signal.aborted).toBe(false);
    nextComposer.focus();

    pending.result.resolve({ transcriptText: "late transcript" });
    await act(async () => Promise.resolve());
    expect(pending.onTranscript).toHaveBeenCalledWith("late transcript");
    expect(document.activeElement).toBe(nextComposer);

    await act(async () => {
      root.render(
        createElement(VoiceComposerButton, {
          importAndTranscribe: pending.importAndTranscribe,
          onTranscript: pending.onTranscript,
          presentationActive: true,
        }),
      );
    });
    expect(document.body.querySelector("fieldset")).toBeNull();
  });

  it("removes portaled controls when the surrounding tools disclosure closes", async () => {
    await act(async () => {
      root.render(
        createElement(
          "details",
          { open: true },
          createElement("summary", null, "More composer tools"),
          createElement(VoiceComposerButton, {
            importAndTranscribe: vi.fn(),
            onTranscript: vi.fn(),
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
    });
    expect(document.body.querySelector("fieldset")).not.toBeNull();
    await act(async () => {
      const tools = container.querySelector("details");
      if (tools) {
        tools.open = false;
        tools.dispatchEvent(new Event("toggle"));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.querySelector("fieldset")).toBeNull();
    expect(document.activeElement).not.toBe(
      container.querySelector('button[aria-label="Open voice dictation"]'),
    );
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("outside focus dismisses only the disclosure and reopens the existing transcription", async () => {
    const pending = await beginPendingTranscription();
    const nextComposer = document.createElement("textarea");
    container.append(nextComposer);
    await act(async () => nextComposer.focus());

    expect(document.body.querySelector("fieldset")).toBeNull();
    expect(pending.signal.aborted).toBe(false);
    expect(document.activeElement).toBe(nextComposer);

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Open voice dictation"]',
        )
        ?.click();
    });
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
      "Transcribing locally managed audio…",
    );
    expect(
      document.body.querySelector<HTMLButtonElement>(
        'button[aria-label="Start voice recording"]',
      )?.disabled,
    ).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    pending.result.resolve({ transcriptText: "late transcript" });
    await act(async () => Promise.resolve());
    expect(pending.onTranscript).toHaveBeenCalledWith("late transcript");
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
      document.body
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Start voice recording"]',
        )
        ?.click();
      await Promise.resolve();
    });
    await act(async () => {
      document.body
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
