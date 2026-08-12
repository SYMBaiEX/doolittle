import { type FormEvent, useState } from "react";
import { MediaResult } from "../components/MediaResult";
import {
  desktopRequest,
  errorMessage,
  Notice,
  type UnknownRecord,
} from "../lib";
import { chooseLocalMediaFile } from "./choose-local-media-file";

interface AnalyzeResponse {
  analysis?: UnknownRecord;
}

interface InspectResponse {
  media?: UnknownRecord;
}

export function InspectAnalyzeTab({ active }: { active: boolean }) {
  const [path, setPath] = useState("");
  const [focus, setFocus] = useState("");
  const [inspectResult, setInspectResult] = useState<UnknownRecord | null>(
    null,
  );
  const [analyzeResult, setAnalyzeResult] = useState<UnknownRecord | null>(
    null,
  );
  const [inspectBusy, setInspectBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [inspectError, setInspectError] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");

  const runInspect = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setInspectError("Path is required.");
      return;
    }
    setInspectBusy(true);
    setInspectError("");
    setInspectResult(null);
    try {
      const payload = await desktopRequest<InspectResponse>(
        `/media/inspect?path=${encodeURIComponent(trimmed)}`,
      );
      setInspectResult(payload.media ?? {});
    } catch (error) {
      setInspectError(errorMessage(error));
    } finally {
      setInspectBusy(false);
    }
  };

  const runAnalyze = async () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setAnalyzeError("Path is required.");
      return;
    }
    setAnalyzeBusy(true);
    setAnalyzeError("");
    setAnalyzeResult(null);
    try {
      const payload = await desktopRequest<AnalyzeResponse>(
        "/media/analyze",
        "POST",
        { path: trimmed, focus: focus || undefined },
      );
      setAnalyzeResult(payload.analysis ?? {});
    } catch (error) {
      setAnalyzeError(errorMessage(error));
    } finally {
      setAnalyzeBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="media-tab-inspect-analyze"
      className="media-tab-panel"
      hidden={!active}
      id="media-panel-inspect-analyze"
      role="tabpanel"
    >
      <form className="content-card media-form" onSubmit={runInspect}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Local media</span>
            <h2>Inspect or analyze a file</h2>
          </div>
        </div>
        <label>
          <span>File</span>
          <input
            aria-label="Media path for inspection"
            onChange={(event) => setPath(event.target.value)}
            placeholder="/tmp/example.wav"
            value={path}
          />
        </label>
        <details className="media-options">
          <summary>
            Analysis settings <span>{focus || "Auto"}</span>
          </summary>
          <div className="media-options-grid">
            <label>
              <span>Focus</span>
              <select
                onChange={(event) => setFocus(event.target.value)}
                value={focus}
              >
                <option value="">auto</option>
                <option value="voice">voice</option>
                <option value="vision">vision</option>
                <option value="research">research</option>
              </select>
            </label>
          </div>
        </details>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setInspectError)}
            type="button"
          >
            Browse…
          </button>
          <button
            className="secondary-button"
            disabled={analyzeBusy}
            onClick={() => void runAnalyze()}
            type="button"
          >
            {analyzeBusy ? "Analyzing…" : "Analyze"}
          </button>
          <button
            className="primary-button"
            disabled={inspectBusy}
            type="submit"
          >
            {inspectBusy ? "Inspecting…" : "Inspect"}
          </button>
        </div>
      </form>

      {inspectError || analyzeError || inspectResult || analyzeResult ? (
        <div className="media-result-stack">
          {inspectError ? <Notice tone="bad">{inspectError}</Notice> : null}
          {analyzeError ? <Notice tone="bad">{analyzeError}</Notice> : null}
          {inspectResult ? (
            <MediaResult
              eyebrow="Inspect result"
              result={inspectResult}
              title="Metadata"
            />
          ) : null}
          {analyzeResult ? (
            <MediaResult
              eyebrow="Analysis result"
              result={analyzeResult}
              title="Model output"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
