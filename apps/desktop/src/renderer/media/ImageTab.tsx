import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";

interface GenerateResponse {
  generation?: UnknownRecord;
}

export function ImageTab({ active }: { active: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [style, setStyle] = useState("");
  const [focus, setFocus] = useState("");
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const runGenerate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Prompt is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await desktopRequest<GenerateResponse>(
        "/media/generate",
        "POST",
        {
          prompt: trimmed,
          name: name || undefined,
          size: size || undefined,
          style: style || undefined,
          focus: focus || undefined,
        },
      );
      setResult(payload.generation ?? {});
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="media-tab-image"
      className="media-tab-panel"
      hidden={!active}
      id="media-panel-image"
      role="tabpanel"
    >
      <form className="content-card media-form" onSubmit={runGenerate}>
        <div className="card-heading">
          <div>
            <h2>Generate an image from text</h2>
          </div>
        </div>
        <label>
          <span>Prompt</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Design a clean operator dashboard"
            rows={5}
            value={prompt}
          />
        </label>
        <details className="media-options">
          <summary>
            Image settings <span>{size || "Provider default"}</span>
          </summary>
          <div className="media-options-grid">
            <label>
              <span>Name</span>
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder="dashboard-art"
                value={name}
              />
            </label>
            <label>
              <span>Size</span>
              <input
                onChange={(event) => setSize(event.target.value)}
                placeholder="1024x1024"
                value={size}
              />
            </label>
            <label>
              <span>Style</span>
              <input
                onChange={(event) => setStyle(event.target.value)}
                placeholder="cinematic"
                value={style}
              />
            </label>
            <label>
              <span>Focus</span>
              <input
                onChange={(event) => setFocus(event.target.value)}
                placeholder="UI layout"
                value={focus}
              />
            </label>
          </div>
        </details>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <MediaResult
          eyebrow="Image result"
          result={result}
          title="Bounded output"
        />
      ) : null}
    </section>
  );
}
