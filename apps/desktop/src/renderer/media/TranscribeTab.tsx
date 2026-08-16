import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";
import { chooseLocalMediaFile } from "./choose-local-media-file";
import { MediaOptions } from "./MediaOptions";
import {
  MEDIA_ACTIONS_CLASS,
  MEDIA_FIELD_CLASS,
  MEDIA_FIELD_WIDE_CLASS,
  MEDIA_FILE_FIELD_CLASS,
  MEDIA_FORM_CLASS,
  MEDIA_HEADING_CLASS,
  MEDIA_TAB_PANEL_CLASS,
} from "./media-layout";
import { useAbortableMediaRequest } from "./use-abortable-media-request";

interface TranscribeResponse {
  transcription?: UnknownRecord;
}

export function TranscribeTab({ active }: { active: boolean }) {
  const [path, setPath] = useState("");
  const [language, setLanguage] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const { busy, cancel, run } = useAbortableMediaRequest(active);
  const [error, setError] = useState("");

  const runTranscribe = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setError("Path is required.");
      return;
    }
    setError("");
    setResult(null);
    try {
      const payload = await run((signal) =>
        desktopRequest<TranscribeResponse>(
          "/media/transcribe",
          "POST",
          {
            path: trimmed,
            language: language || undefined,
            name: name || undefined,
            prompt: prompt || undefined,
          },
          signal,
        ),
      );
      if (payload) setResult(payload.transcription ?? {});
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section
      aria-labelledby="media-tab-transcribe"
      className={MEDIA_TAB_PANEL_CLASS}
      hidden={!active}
      id="media-panel-transcribe"
      role="tabpanel"
    >
      <form className={MEDIA_FORM_CLASS} onSubmit={runTranscribe}>
        <div className={MEDIA_HEADING_CLASS}>
          <div>
            <h2>Transcribe media</h2>
          </div>
        </div>
        <div className={MEDIA_FILE_FIELD_CLASS}>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-transcribe-path">
            <span>Audio or video file</span>
            <Input
              id="media-transcribe-path"
              onChange={(event) => setPath(event.target.value)}
              placeholder="/tmp/meeting.webm"
              value={path}
            />
          </label>
          <Button
            onClick={() => void chooseLocalMediaFile(setPath, setError)}
            type="button"
            variant="secondary"
          >
            Browse…
          </Button>
        </div>
        <MediaOptions
          label="Transcription settings"
          value={language || "Automatic"}
        >
          <label
            className={MEDIA_FIELD_CLASS}
            htmlFor="media-transcribe-language"
          >
            <span>Language</span>
            <Input
              id="media-transcribe-language"
              onChange={(event) => setLanguage(event.target.value)}
              placeholder="en-US"
              value={language}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-transcribe-name">
            <span>Source name</span>
            <Input
              id="media-transcribe-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="meeting"
              value={name}
            />
          </label>
          <label
            className={MEDIA_FIELD_WIDE_CLASS}
            htmlFor="media-transcribe-prompt"
          >
            <span>Prompt</span>
            <Input
              id="media-transcribe-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Emphasize action items"
              value={prompt}
            />
          </label>
        </MediaOptions>
        <div className={MEDIA_ACTIONS_CLASS}>
          <Button disabled={busy} type="submit">
            {busy ? "Transcribing…" : "Transcribe"}
          </Button>
          {busy ? (
            <Button
              aria-label="Cancel transcription"
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
          eyebrow="Transcribe result"
          result={result}
          title="Bounded output"
        />
      ) : null}
    </section>
  );
}
