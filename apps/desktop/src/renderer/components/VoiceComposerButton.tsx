import { Button } from "@elizaos/ui/components/ui/button";
import { Mic } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from "react";
import { UiIcon } from "./UiIcon";

export const VOICE_RECORDING_MAX_BYTES = 20 * 1024 * 1024;
export const VOICE_RECORDING_MAX_DURATION_MS = 2 * 60 * 1_000;

export const RECORDER_MIME_CANDIDATES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
] as const;

export type VoiceRecorderMime = (typeof RECORDER_MIME_CANDIDATES)[number];

export type VoiceComposerPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "transcribing"
  | "complete"
  | "permission-denied"
  | "unsupported"
  | "error";

export type VoiceComposerEvent =
  | "request"
  | "record"
  | "stop"
  | "transcribe"
  | "complete"
  | "deny"
  | "unsupported"
  | "fail"
  | "reset";

export interface VoiceComposerButtonProps {
  importAndTranscribe: (
    bytes: Uint8Array,
    mimeType: VoiceRecorderMime,
    name: string,
    signal: AbortSignal,
  ) => Promise<{ transcriptText: string }>;
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

interface RecorderChunkResult {
  accepted: boolean;
  totalBytes: number;
}

const PHASE_TRANSITIONS: Readonly<
  Record<
    VoiceComposerPhase,
    Partial<Record<VoiceComposerEvent, VoiceComposerPhase>>
  >
> = {
  idle: { request: "requesting", reset: "idle" },
  requesting: {
    record: "recording",
    deny: "permission-denied",
    unsupported: "unsupported",
    fail: "error",
    reset: "idle",
  },
  recording: { stop: "stopping", fail: "error", reset: "idle" },
  stopping: { transcribe: "transcribing", fail: "error", reset: "idle" },
  transcribing: { complete: "complete", fail: "error", reset: "idle" },
  complete: { request: "requesting", reset: "idle" },
  "permission-denied": { request: "requesting", reset: "idle" },
  unsupported: { reset: "idle" },
  error: { request: "requesting", reset: "idle" },
};

export function transitionVoiceComposerPhase(
  phase: VoiceComposerPhase,
  event: VoiceComposerEvent,
): VoiceComposerPhase {
  return PHASE_TRANSITIONS[phase][event] ?? phase;
}

export function selectSupportedRecorderMime(
  isTypeSupported: (mimeType: string) => boolean,
): VoiceRecorderMime | null {
  return (
    RECORDER_MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType)) ??
    null
  );
}

export function appendRecorderChunkSize(
  currentBytes: number,
  nextBytes: number,
  maxBytes = VOICE_RECORDING_MAX_BYTES,
): RecorderChunkResult {
  if (
    !Number.isSafeInteger(currentBytes) ||
    currentBytes < 0 ||
    !Number.isSafeInteger(nextBytes) ||
    nextBytes < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1
  ) {
    return { accepted: false, totalBytes: currentBytes };
  }
  const totalBytes = currentBytes + nextBytes;
  return totalBytes <= maxBytes
    ? { accepted: true, totalBytes }
    : { accepted: false, totalBytes: currentBytes };
}

export function formatVoiceDuration(milliseconds: number): string {
  const safeMilliseconds =
    Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  const seconds = Math.floor(safeMilliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function statusText(phase: VoiceComposerPhase, elapsedMs: number): string {
  switch (phase) {
    case "idle":
      return "Ready to record. Audio stays local until you stop.";
    case "requesting":
      return "Waiting for microphone permission…";
    case "recording":
      return `Recording ${formatVoiceDuration(elapsedMs)} · 2:00 maximum`;
    case "stopping":
      return "Finishing recording…";
    case "transcribing":
      return "Transcribing locally managed audio…";
    case "complete":
      return "Transcript added. Review or edit it before sending.";
    case "permission-denied":
      return "Microphone access was denied. Allow it in system settings and try again.";
    case "unsupported":
      return "Audio recording is not supported by this desktop runtime.";
    case "error":
      return "The recording could not be transcribed.";
  }
}

function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "SecurityError")
  );
}

export function VoiceComposerButton({
  importAndTranscribe,
  onTranscript,
  disabled = false,
}: VoiceComposerButtonProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [phase, dispatch] = useReducer(transitionVoiceComposerPhase, "idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorDetail, setErrorDetail] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBytesRef = useRef(0);
  const durationTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const operationRef = useRef(0);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const terminalErrorRef = useRef("");

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current !== null) {
      window.clearTimeout(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const releaseCapture = useCallback(
    (stopRecorder: boolean) => {
      clearTimers();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && stopRecorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      chunksRef.current = [];
      recordedBytesRef.current = 0;
      setElapsedMs(0);
    },
    [clearTimers],
  );

  const cancel = useCallback(() => {
    operationRef.current += 1;
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;
    releaseCapture(true);
    terminalErrorRef.current = "";
    setErrorDetail("");
    dispatch("reset");
    setOpen(false);
  }, [releaseCapture]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }
      stopStream(streamRef.current);
      recorderRef.current = null;
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, [clearTimers]);

  useEffect(() => {
    if (disabled && open) cancel();
  }, [cancel, disabled, open]);

  const beginTranscription = useCallback(
    async (chunks: Blob[], mimeType: VoiceRecorderMime, operation: number) => {
      dispatch("transcribe");
      let transcriptionController: AbortController | null = null;
      try {
        const buffer = await new Blob(chunks, { type: mimeType }).arrayBuffer();
        chunks.length = 0;
        if (
          !mountedRef.current ||
          operationRef.current !== operation ||
          buffer.byteLength === 0 ||
          buffer.byteLength > VOICE_RECORDING_MAX_BYTES
        ) {
          if (
            mountedRef.current &&
            operationRef.current === operation &&
            buffer.byteLength === 0
          ) {
            setErrorDetail("No audio was captured. Try recording again.");
            dispatch("fail");
          } else if (
            mountedRef.current &&
            operationRef.current === operation &&
            buffer.byteLength > VOICE_RECORDING_MAX_BYTES
          ) {
            setErrorDetail("Recording reached the 20 MB safety limit.");
            dispatch("fail");
          }
          return;
        }
        const controller = new AbortController();
        transcriptionController = controller;
        transcriptionControllerRef.current?.abort();
        transcriptionControllerRef.current = controller;
        const result = await importAndTranscribe(
          new Uint8Array(buffer),
          mimeType,
          `dictation-${new Date().toISOString().replaceAll(":", "-")}`,
          controller.signal,
        );
        if (!mountedRef.current || operationRef.current !== operation) return;
        const transcript = result.transcriptText.trim();
        if (!transcript) {
          setErrorDetail("No speech was detected in that recording.");
          dispatch("fail");
          return;
        }
        onTranscript(transcript);
        dispatch("complete");
      } catch (error) {
        if (!mountedRef.current || operationRef.current !== operation) return;
        setErrorDetail(
          error instanceof Error && error.message
            ? error.message
            : "Transcription failed. Try again.",
        );
        dispatch("fail");
      } finally {
        if (
          transcriptionController &&
          transcriptionControllerRef.current === transcriptionController
        ) {
          transcriptionControllerRef.current = null;
        }
      }
    },
    [importAndTranscribe, onTranscript],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    dispatch("stop");
    clearTimers();
    recorder.stop();
    stopStream(streamRef.current);
    streamRef.current = null;
  }, [clearTimers]);

  const startRecording = useCallback(async () => {
    if (disabled || phase === "requesting" || phase === "recording") return;
    setErrorDetail("");
    terminalErrorRef.current = "";
    setElapsedMs(0);
    chunksRef.current = [];
    recordedBytesRef.current = 0;

    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      dispatch("request");
      dispatch("unsupported");
      return;
    }
    const mimeType = selectSupportedRecorderMime(
      MediaRecorder.isTypeSupported.bind(MediaRecorder),
    );
    if (!mimeType) {
      dispatch("request");
      dispatch("unsupported");
      return;
    }

    const operation = operationRef.current + 1;
    operationRef.current = operation;
    dispatch("request");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (!mountedRef.current || operationRef.current !== operation) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size || operationRef.current !== operation) return;
        const next = appendRecorderChunkSize(
          recordedBytesRef.current,
          event.data.size,
        );
        if (!next.accepted) {
          setErrorDetail("Recording reached the 20 MB safety limit.");
          terminalErrorRef.current =
            "Recording reached the 20 MB safety limit.";
          chunksRef.current = [];
          recordedBytesRef.current = 0;
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        recordedBytesRef.current = next.totalBytes;
        chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current || operationRef.current !== operation) return;
        terminalErrorRef.current = "The microphone stopped unexpectedly.";
        releaseCapture(true);
        setErrorDetail("The microphone stopped unexpectedly.");
        dispatch("fail");
      };
      recorder.onstop = () => {
        clearTimers();
        recorderRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        recordedBytesRef.current = 0;
        if (!mountedRef.current || operationRef.current !== operation) return;
        if (terminalErrorRef.current) {
          dispatch("fail");
          return;
        }
        void beginTranscription(chunks, mimeType, operation);
      };
      recorder.start(1_000);
      dispatch("record");
      const startedAt = Date.now();
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAt);
      }, 250);
      durationTimerRef.current = window.setTimeout(
        stopRecording,
        VOICE_RECORDING_MAX_DURATION_MS,
      );
    } catch (error) {
      releaseCapture(false);
      if (isPermissionError(error)) {
        dispatch("deny");
      } else {
        setErrorDetail(
          error instanceof Error && error.message
            ? error.message
            : "The microphone could not be started.",
        );
        dispatch("fail");
      }
    }
  }, [
    beginTranscription,
    disabled,
    phase,
    releaseCapture,
    stopRecording,
    clearTimers,
  ]);

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    cancel();
  };

  const busy =
    phase === "requesting" ||
    phase === "recording" ||
    phase === "stopping" ||
    phase === "transcribing";

  return (
    <div className="relative inline-flex shrink-0">
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="Open voice dictation"
        className="voice-composer-trigger grid size-8 rounded-[5px] border border-transparent bg-transparent p-0 text-[var(--text-soft)] shadow-none hover:border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] aria-expanded:border-[color-mix(in_srgb,var(--accent)_32%,var(--border))] aria-expanded:bg-[var(--accent-soft)] aria-expanded:text-[var(--accent)] max-[480px]:size-10 [&_svg]:size-4 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.7] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]"
        disabled={disabled}
        onClick={() => {
          if (open) {
            cancel();
            return;
          }
          setOpen(true);
          setErrorDetail("");
          terminalErrorRef.current = "";
          dispatch("reset");
        }}
        size="icon"
        title="Voice dictation"
        type="button"
        variant="ghost"
      >
        <UiIcon icon={Mic} size="md" />
      </Button>

      {open ? (
        <fieldset
          aria-label="Voice dictation controls"
          className="absolute right-0 bottom-[calc(100%+9px)] z-80 m-0 grid w-[min(292px,calc(100vw-32px))] min-w-0 gap-[11px] rounded-[5px] border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-raised)_97%,transparent)] p-[13px] shadow-[0_18px_46px_var(--shadow)] transition-[opacity,transform] duration-200 starting:translate-y-1 starting:scale-[0.995] starting:opacity-0 motion-reduce:transition-none"
          id={panelId}
          onKeyDown={handlePanelKeyDown}
        >
          <span
            aria-hidden="true"
            className="absolute right-[11px] -bottom-[5px] size-2 rotate-45 border-r border-b border-[var(--border-strong)] bg-[var(--surface-raised)]"
          />
          <div className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-[7px] rounded-full ${
                phase === "recording"
                  ? "animate-pulse bg-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)] motion-reduce:animate-none"
                  : "bg-[var(--faint)]"
              }`}
            />
            <strong className="min-w-0 text-xs tracking-[0.01em]">
              Voice dictation
            </strong>
            <small className="font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.035em] text-[var(--faint)] uppercase">
              Review before sending
            </small>
          </div>

          <p
            aria-live="polite"
            className="m-0 min-h-[34px] text-[11px] leading-normal text-[var(--text-soft)]"
            role="status"
          >
            {errorDetail || statusText(phase, elapsedMs)}
          </p>

          <div className="flex items-center gap-[7px]">
            {phase === "recording" ? (
              <Button
                aria-label="Stop voice recording and transcribe"
                className="min-h-[29px] rounded-[3px] px-[11px] text-[11px] font-semibold"
                onClick={stopRecording}
                size="sm"
                type="button"
                variant="surfaceDestructive"
              >
                Stop
              </Button>
            ) : (
              <Button
                aria-label={
                  phase === "complete"
                    ? "Start another voice recording"
                    : "Start voice recording"
                }
                className="min-h-[29px] rounded-[3px] px-[11px] text-[11px] font-semibold"
                disabled={busy || phase === "unsupported"}
                onClick={() => void startRecording()}
                size="sm"
                type="button"
              >
                {phase === "complete" ? "Record again" : "Start"}
              </Button>
            )}
            <Button
              aria-label="Cancel voice dictation"
              className="min-h-[29px] rounded-[3px] px-[11px] text-[11px] font-semibold"
              onClick={cancel}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
