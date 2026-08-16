import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { Textarea } from "@elizaos/ui/components/ui/textarea";
import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";
import { MediaOptions } from "./MediaOptions";
import {
  MEDIA_ACTIONS_CLASS,
  MEDIA_FIELD_CLASS,
  MEDIA_FIELD_WIDE_CLASS,
  MEDIA_FORM_CLASS,
  MEDIA_HEADING_CLASS,
  MEDIA_SELECT_CLASS,
  MEDIA_TAB_PANEL_CLASS,
} from "./media-layout";
import { useAbortableMediaRequest } from "./use-abortable-media-request";

interface SpeakResponse {
  speech?: UnknownRecord;
}

export function SpeechTab({ active }: { active: boolean }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("");
  const [format, setFormat] = useState("mp3");
  const [speed, setSpeed] = useState("1");
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const { busy, cancel, run } = useAbortableMediaRequest(active);
  const [error, setError] = useState("");

  const runSpeak = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Text is required.");
      return;
    }
    setError("");
    setResult(null);
    try {
      const payload = await run((signal) =>
        desktopRequest<SpeakResponse>(
          "/media/speak",
          "POST",
          {
            text: trimmed,
            name: name || undefined,
            voice: voice || undefined,
            format: format || "mp3",
            speed: Number.parseFloat(speed) || 1,
          },
          signal,
        ),
      );
      if (payload) setResult(payload.speech ?? {});
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section
      aria-labelledby="media-tab-speech"
      className={MEDIA_TAB_PANEL_CLASS}
      hidden={!active}
      id="media-panel-speech"
      role="tabpanel"
    >
      <form className={MEDIA_FORM_CLASS} onSubmit={runSpeak}>
        <div className={MEDIA_HEADING_CLASS}>
          <div>
            <h2>Text to speech</h2>
          </div>
        </div>
        <label className={MEDIA_FIELD_WIDE_CLASS} htmlFor="media-speech-text">
          <span>Text</span>
          <Textarea
            id="media-speech-text"
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your summary…"
            rows={5}
            value={text}
          />
        </label>
        <MediaOptions label="Voice and output" value={voice || "Default"}>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-speech-name">
            <span>Output name</span>
            <Input
              id="media-speech-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="summary-audio"
              value={name}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-speech-voice">
            <span>Voice</span>
            <Input
              id="media-speech-voice"
              onChange={(event) => setVoice(event.target.value)}
              placeholder="default"
              value={voice}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS}>
            <span>Format</span>
            <select
              className={MEDIA_SELECT_CLASS}
              onChange={(event) => setFormat(event.target.value)}
              value={format}
            >
              <option value="mp3">mp3</option>
              <option value="svg">svg</option>
            </select>
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-speech-speed">
            <span>Speed</span>
            <Input
              id="media-speech-speed"
              max="3"
              min="0.5"
              onChange={(event) => setSpeed(event.target.value)}
              step="0.1"
              type="number"
              value={speed}
            />
          </label>
        </MediaOptions>
        <div className={MEDIA_ACTIONS_CLASS}>
          <Button disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate speech"}
          </Button>
          {busy ? (
            <Button
              aria-label="Cancel speech generation"
              onClick={cancel}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <MediaResult
          eyebrow="Speech result"
          result={result}
          title="Bounded output"
        />
      ) : null}
    </section>
  );
}
