import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  appendRecorderChunkSize,
  formatVoiceDuration,
  RECORDER_MIME_CANDIDATES,
  selectSupportedRecorderMime,
  transitionVoiceComposerPhase,
  VOICE_RECORDING_MAX_BYTES,
  VOICE_RECORDING_MAX_DURATION_MS,
  VoiceComposerButton,
} from "./VoiceComposerButton";

describe("VoiceComposerButton", () => {
  it("renders a disabled, screen-reader-labeled dictation trigger", () => {
    const markup = renderToStaticMarkup(
      createElement(VoiceComposerButton, {
        disabled: true,
        importAndTranscribe: vi.fn(),
        onTranscript: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Open voice dictation"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("voice-composer-trigger");
    expect(markup).toContain("max-[480px]:size-10");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Voice dictation controls");
  });
});

describe("selectSupportedRecorderMime", () => {
  it("selects the first supported MIME in the strict preference order", () => {
    const isSupported = vi.fn(
      (mimeType: string) =>
        mimeType === "audio/mp4" || mimeType === "audio/ogg",
    );

    expect(selectSupportedRecorderMime(isSupported)).toBe("audio/mp4");
    expect(isSupported.mock.calls.map(([mimeType]) => mimeType)).toEqual([
      "audio/webm",
      "audio/mp4",
    ]);
    expect(RECORDER_MIME_CANDIDATES).toEqual([
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "audio/wav",
      "audio/mpeg",
    ]);
  });

  it("returns null when the runtime supports no approved audio MIME", () => {
    expect(selectSupportedRecorderMime(() => false)).toBeNull();
  });
});

describe("transitionVoiceComposerPhase", () => {
  it("follows the explicit record, stop, transcribe, and completion flow", () => {
    let phase = transitionVoiceComposerPhase("idle", "request");
    phase = transitionVoiceComposerPhase(phase, "record");
    expect(phase).toBe("recording");
    phase = transitionVoiceComposerPhase(phase, "stop");
    expect(phase).toBe("stopping");
    phase = transitionVoiceComposerPhase(phase, "transcribe");
    expect(phase).toBe("transcribing");
    phase = transitionVoiceComposerPhase(phase, "complete");
    expect(phase).toBe("complete");
    expect(transitionVoiceComposerPhase(phase, "reset")).toBe("idle");
  });

  it("keeps invalid events from skipping required phases", () => {
    expect(transitionVoiceComposerPhase("idle", "complete")).toBe("idle");
    expect(transitionVoiceComposerPhase("recording", "transcribe")).toBe(
      "recording",
    );
    expect(transitionVoiceComposerPhase("requesting", "deny")).toBe(
      "permission-denied",
    );
  });
});

describe("recording safety helpers", () => {
  it("accepts the exact byte cap and rejects the first byte beyond it", () => {
    expect(appendRecorderChunkSize(VOICE_RECORDING_MAX_BYTES - 1, 1)).toEqual({
      accepted: true,
      totalBytes: VOICE_RECORDING_MAX_BYTES,
    });
    expect(appendRecorderChunkSize(VOICE_RECORDING_MAX_BYTES, 1)).toEqual({
      accepted: false,
      totalBytes: VOICE_RECORDING_MAX_BYTES,
    });
    expect(appendRecorderChunkSize(-1, 10)).toEqual({
      accepted: false,
      totalBytes: -1,
    });
  });

  it("exposes a two-minute cap and formats elapsed time accessibly", () => {
    expect(VOICE_RECORDING_MAX_DURATION_MS).toBe(120_000);
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(65_900)).toBe("1:05");
    expect(formatVoiceDuration(Number.NaN)).toBe("0:00");
  });
});
