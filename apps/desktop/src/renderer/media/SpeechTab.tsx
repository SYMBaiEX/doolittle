import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const runSpeak = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Text is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<SpeakResponse>(
        "/media/speak",
        "POST",
        {
          text: trimmed,
          name: name || undefined,
          voice: voice || undefined,
          format: format || "mp3",
          speed: Number.parseFloat(speed) || 1,
        },
      );
      setResult(payload.speech ?? {});
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="media-tab-speech"
      className="media-tab-panel"
      hidden={!active}
      id="media-panel-speech"
      role="tabpanel"
    >
      <form className="content-card media-form" onSubmit={runSpeak}>
        <div className="card-heading">
          <div>
            <h2>Generate text-to-speech output</h2>
          </div>
        </div>
        <label>
          <span>Text</span>
          <textarea
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your summary…"
            rows={5}
            value={text}
          />
        </label>
        <details className="media-options">
          <summary>
            Voice and output <span>{voice || "Default"}</span>
          </summary>
          <div className="media-options-grid">
            <label>
              <span>Output name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="summary-audio"
                value={name}
              />
            </label>
            <label>
              <span>Voice</span>
              <input
                onChange={(event) => setVoice(event.target.value)}
                placeholder="default"
                value={voice}
              />
            </label>
            <label>
              <span>Format</span>
              <select
                onChange={(event) => setFormat(event.target.value)}
                value={format}
              >
                <option value="mp3">mp3</option>
                <option value="svg">svg</option>
              </select>
            </label>
            <label>
              <span>Speed</span>
              <input
                max="3"
                min="0.5"
                onChange={(event) => setSpeed(event.target.value)}
                step="0.1"
                type="number"
                value={speed}
              />
            </label>
          </div>
        </details>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate speech"}
          </button>
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
