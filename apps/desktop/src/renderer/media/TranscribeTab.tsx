import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";
import { chooseLocalMediaFile } from "./choose-local-media-file";

interface TranscribeResponse {
  transcription?: UnknownRecord;
}

export function TranscribeTab({ active }: { active: boolean }) {
  const [path, setPath] = useState("");
  const [language, setLanguage] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const runTranscribe = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setError("Path is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<TranscribeResponse>(
        "/media/transcribe",
        "POST",
        {
          path: trimmed,
          language: language || undefined,
          name: name || undefined,
          prompt: prompt || undefined,
        },
      );
      setResult(payload.transcription ?? {});
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="media-tab-transcribe"
      className="media-tab-panel"
      hidden={!active}
      id="media-panel-transcribe"
      role="tabpanel"
    >
      <form className="content-card media-form" onSubmit={runTranscribe}>
        <div className="card-heading">
          <div>
            <h2>Convert local media to text</h2>
          </div>
        </div>
        <div className="media-file-field">
          <label>
            <span>Audio or video file</span>
            <input
              onChange={(event) => setPath(event.target.value)}
              placeholder="/tmp/meeting.webm"
              value={path}
            />
          </label>
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setError)}
            type="button"
          >
            Browse…
          </button>
        </div>
        <details className="media-options">
          <summary>
            Transcription settings <span>{language || "Automatic"}</span>
          </summary>
          <div className="media-options-grid">
            <label>
              <span>Language</span>
              <input
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="en-US"
                value={language}
              />
            </label>
            <label>
              <span>Source name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="meeting"
                value={name}
              />
            </label>
            <label className="media-options-wide">
              <span>Prompt</span>
              <input
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Emphasize action items"
                value={prompt}
              />
            </label>
          </div>
        </details>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Transcribing…" : "Transcribe"}
          </button>
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
