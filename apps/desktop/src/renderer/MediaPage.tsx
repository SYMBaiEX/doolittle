import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import {
  desktopRequest,
  errorMessage,
  formatBoundedPreview,
  Notice,
  PageHeader,
  type UnknownRecord,
} from "./lib";

const BOUNDS = {
  memorySnapshotChars: 1_400,
  mediaResultChars: 2_400,
  memoryPreviewItems: 5,
  agentCardChars: 1_000,
};

interface AnalyzeResponse {
  analysis?: UnknownRecord;
}

interface InspectResponse {
  media?: UnknownRecord;
}

interface TranscribeResponse {
  transcription?: UnknownRecord;
}

interface SpeakResponse {
  speech?: UnknownRecord;
}

interface GenerateResponse {
  generation?: UnknownRecord;
}

async function chooseLocalMediaFile(
  onSelect: (path: string) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    const selection = await window.doolittle.pickFiles();
    const selected = selection.paths[0];
    if (!selection.canceled && selected) onSelect(selected);
  } catch (error) {
    onError(errorMessage(error));
  }
}

function InspectAnalyzeTab({
  path,
  setPath,
  inspectBusy,
  setInspectBusy,
  inspectError,
  setInspectError,
  analyzeBusy,
  setAnalyzeBusy,
  analyzeError,
  setAnalyzeError,
  analyzeFocus,
  setAnalyzeFocus,
  inspectResult,
  setInspectResult,
  analyzeResult,
  setAnalyzeResult,
}: {
  path: string;
  setPath: (next: string) => void;
  inspectBusy: boolean;
  setInspectBusy: (value: boolean) => void;
  inspectError: string;
  setInspectError: (value: string) => void;
  analyzeBusy: boolean;
  setAnalyzeBusy: (value: boolean) => void;
  analyzeError: string;
  setAnalyzeError: (value: string) => void;
  analyzeFocus: string;
  setAnalyzeFocus: (next: string) => void;
  inspectResult: UnknownRecord | null;
  setInspectResult: (value: UnknownRecord | null) => void;
  analyzeResult: UnknownRecord | null;
  setAnalyzeResult: (value: UnknownRecord | null) => void;
}) {
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
      setInspectResult((payload.media as UnknownRecord) ?? {});
    } catch (error) {
      setInspectError(errorMessage(error));
    } finally {
      setInspectBusy(false);
    }
  };

  const runAnalyze = async (event: FormEvent) => {
    event.preventDefault();
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
        {
          path: trimmed,
          focus: analyzeFocus || undefined,
        },
      );
      setAnalyzeResult((payload.analysis as UnknownRecord) ?? {});
    } catch (error) {
      setAnalyzeError(errorMessage(error));
    } finally {
      setAnalyzeBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Inspect and analyze media">
      <form className="content-card media-form" onSubmit={runInspect}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Inspect</span>
            <h2>Read metadata from a local file</h2>
          </div>
        </div>
        <label>
          <span>Local file path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/tmp/example.wav"
            aria-label="Media path for inspection"
          />
          <small>Returned paths are not auto-opened.</small>
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setInspectError)}
            type="button"
          >
            Browse…
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

      {inspectError ? <Notice tone="bad">{inspectError}</Notice> : null}
      {inspectResult ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Inspect result</span>
              <h2>Bounded metadata</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {formatBoundedPreview(inspectResult, BOUNDS.mediaResultChars)}
          </pre>
        </div>
      ) : null}

      <form className="content-card media-form" onSubmit={runAnalyze}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Analyze</span>
            <h2>Run model analysis</h2>
          </div>
        </div>
        <label>
          <span>Focus</span>
          <select
            value={analyzeFocus}
            onChange={(event) => setAnalyzeFocus(event.target.value)}
          >
            <option value="">auto</option>
            <option value="voice">voice</option>
            <option value="vision">vision</option>
            <option value="research">research</option>
          </select>
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            disabled={analyzeBusy}
            type="submit"
          >
            {analyzeBusy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </form>

      {analyzeError ? <Notice tone="bad">{analyzeError}</Notice> : null}
      {analyzeResult ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Analysis result</span>
              <h2>Bounded JSON/text</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {formatBoundedPreview(analyzeResult, BOUNDS.mediaResultChars)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function TranscribeTab({
  path,
  setPath,
  busy,
  setBusy,
  error,
  setError,
  language,
  setLanguage,
  name,
  setName,
  prompt,
  setPrompt,
  result,
  setResult,
}: {
  path: string;
  setPath: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  language: string;
  setLanguage: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  prompt: string;
  setPrompt: (next: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
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
      setResult((payload.transcription as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Transcribe media">
      <form className="content-card media-form" onSubmit={runTranscribe}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Transcribe</span>
            <h2>Convert local media to text</h2>
          </div>
        </div>
        <label>
          <span>Audio/video file path</span>
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/tmp/meeting.webm"
          />
        </label>
        <label>
          <span>Language</span>
          <input
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="en-US"
          />
        </label>
        <label>
          <span>Source name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="meeting"
          />
        </label>
        <label>
          <span>Prompt</span>
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Emphasize action items"
          />
        </label>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={() => void chooseLocalMediaFile(setPath, setError)}
            type="button"
          >
            Browse…
          </button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Transcribing…" : "Transcribe"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Transcribe result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {formatBoundedPreview(result, BOUNDS.mediaResultChars)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function SpeechTab({
  text,
  setText,
  name,
  setName,
  voice,
  setVoice,
  format,
  setFormat,
  speed,
  setSpeed,
  busy,
  setBusy,
  error,
  setError,
  result,
  setResult,
}: {
  text: string;
  setText: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  voice: string;
  setVoice: (next: string) => void;
  format: string;
  setFormat: (next: string) => void;
  speed: string;
  setSpeed: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
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
      setResult((payload.speech as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Generate speech">
      <form className="content-card media-form" onSubmit={runSpeak}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Speech</span>
            <h2>Generate text-to-speech output</h2>
          </div>
        </div>
        <label>
          <span>Text</span>
          <textarea
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your summary…"
          />
        </label>
        <label>
          <span>Output name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="summary-audio"
          />
        </label>
        <label>
          <span>Voice</span>
          <input
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            placeholder="default"
          />
        </label>
        <label>
          <span>Format</span>
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="mp3">mp3</option>
            <option value="svg">svg</option>
          </select>
        </label>
        <label>
          <span>Speed</span>
          <input
            value={speed}
            onChange={(event) => setSpeed(event.target.value)}
            type="number"
            min="0.5"
            max="3"
            step="0.1"
          />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate speech"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Speech result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {formatBoundedPreview(result, BOUNDS.mediaResultChars)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function ImageTab({
  prompt,
  setPrompt,
  name,
  setName,
  size,
  setSize,
  style,
  setStyle,
  focus,
  setFocus,
  busy,
  setBusy,
  error,
  setError,
  result,
  setResult,
}: {
  prompt: string;
  setPrompt: (next: string) => void;
  name: string;
  setName: (next: string) => void;
  size: string;
  setSize: (next: string) => void;
  style: string;
  setStyle: (next: string) => void;
  focus: string;
  setFocus: (next: string) => void;
  busy: boolean;
  setBusy: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
  result: UnknownRecord | null;
  setResult: (value: UnknownRecord | null) => void;
}) {
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
      setResult((payload.generation as UnknownRecord) ?? {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="media-tab-panel" aria-label="Generate image">
      <form className="content-card media-form" onSubmit={runGenerate}>
        <div className="card-heading">
          <div>
            <span className="eyebrow">Image</span>
            <h2>Generate an image from text</h2>
          </div>
        </div>
        <label>
          <span>Prompt</span>
          <textarea
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Design a clean operator dashboard"
          />
        </label>
        <label>
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="dashboard-art"
          />
        </label>
        <label>
          <span>Size</span>
          <input
            value={size}
            onChange={(event) => setSize(event.target.value)}
            placeholder="1024x1024"
          />
        </label>
        <label>
          <span>Style</span>
          <input
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            placeholder="cinematic"
          />
        </label>
        <label>
          <span>Focus</span>
          <input
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="UI layout"
          />
        </label>
        <div className="form-actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      {error ? <Notice tone="bad">{error}</Notice> : null}
      {result ? (
        <div className="content-card media-result">
          <div className="card-heading">
            <div>
              <span className="eyebrow">Image result</span>
              <h2>Bounded output</h2>
            </div>
          </div>
          <pre className="json-preview" aria-live="polite">
            {formatBoundedPreview(result, BOUNDS.mediaResultChars)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

export function MediaPage({ active }: { active: boolean }) {
  const tabs = [
    { id: "inspect-analyze", label: "Inspect / Analyze" },
    { id: "transcribe", label: "Transcribe" },
    { id: "speech", label: "Speech" },
    { id: "image", label: "Image" },
  ] as const;

  const [activeTab, setActiveTab] =
    useState<(typeof tabs)[number]["id"]>("inspect-analyze");
  const tabRefs = useRef<
    Record<(typeof tabs)[number]["id"], HTMLButtonElement | null>
  >({
    "inspect-analyze": null,
    transcribe: null,
    speech: null,
    image: null,
  });

  const [inspectAnalyzePath, setInspectAnalyzePath] = useState("");
  const [analyzeFocus, setAnalyzeFocus] = useState("");
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

  const [transcribePath, setTranscribePath] = useState("");
  const [transcribeLanguage, setTranscribeLanguage] = useState("");
  const [transcribeName, setTranscribeName] = useState("");
  const [transcribePrompt, setTranscribePrompt] = useState("");
  const [transcribeResult, setTranscribeResult] =
    useState<UnknownRecord | null>(null);
  const [transcribeBusy, setTranscribeBusy] = useState(false);
  const [transcribeError, setTranscribeError] = useState("");

  const [speechText, setSpeechText] = useState("");
  const [speechName, setSpeechName] = useState("");
  const [speechVoice, setSpeechVoice] = useState("");
  const [speechFormat, setSpeechFormat] = useState("mp3");
  const [speechSpeed, setSpeechSpeed] = useState("1");
  const [speechResult, setSpeechResult] = useState<UnknownRecord | null>(null);
  const [speechBusy, setSpeechBusy] = useState(false);
  const [speechError, setSpeechError] = useState("");

  const [imagePrompt, setImagePrompt] = useState("");
  const [imageName, setImageName] = useState("");
  const [imageSize, setImageSize] = useState("");
  const [imageStyle, setImageStyle] = useState("");
  const [imageFocus, setImageFocus] = useState("");
  const [imageResult, setImageResult] = useState<UnknownRecord | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");

  const moveTab = (direction: -1 | 1) => {
    const index = tabs.findIndex((entry) => entry.id === activeTab);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    setActiveTab(next.id);
    requestAnimationFrame(() => {
      tabRefs.current[next.id]?.focus();
    });
  };

  return (
    <div className="page studio-page media-page">
      <PageHeader
        eyebrow="Operator"
        title="Media"
        description="Inspect media files, analyze content, transcribe, synthesize speech, and generate images."
      />

      <div aria-label="Media action tabs" className="media-tabs" role="tablist">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            ref={(node) => {
              tabRefs.current[entry.id] = node;
            }}
            id={`media-tab-${entry.id}`}
            role="tab"
            aria-selected={entry.id === activeTab}
            aria-controls={`media-panel-${entry.id}`}
            className={`text-button ${entry.id === activeTab ? "selected" : ""}`}
            type="button"
            disabled={!active}
            onClick={() => setActiveTab(entry.id)}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveTab(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveTab(1);
              }
            }}
            tabIndex={entry.id === activeTab ? 0 : -1}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <section
        id={`media-panel-${activeTab}`}
        className="media-panel"
        aria-live="polite"
      >
        {activeTab === "inspect-analyze" ? (
          <InspectAnalyzeTab
            path={inspectAnalyzePath}
            setPath={setInspectAnalyzePath}
            inspectBusy={inspectBusy}
            setInspectBusy={setInspectBusy}
            inspectError={inspectError}
            setInspectError={setInspectError}
            analyzeBusy={analyzeBusy}
            setAnalyzeBusy={setAnalyzeBusy}
            analyzeError={analyzeError}
            setAnalyzeError={setAnalyzeError}
            analyzeFocus={analyzeFocus}
            setAnalyzeFocus={setAnalyzeFocus}
            inspectResult={inspectResult}
            setInspectResult={setInspectResult}
            analyzeResult={analyzeResult}
            setAnalyzeResult={setAnalyzeResult}
          />
        ) : activeTab === "transcribe" ? (
          <TranscribeTab
            path={transcribePath}
            setPath={setTranscribePath}
            busy={transcribeBusy}
            setBusy={setTranscribeBusy}
            error={transcribeError}
            setError={setTranscribeError}
            language={transcribeLanguage}
            setLanguage={setTranscribeLanguage}
            name={transcribeName}
            setName={setTranscribeName}
            prompt={transcribePrompt}
            setPrompt={setTranscribePrompt}
            result={transcribeResult}
            setResult={setTranscribeResult}
          />
        ) : activeTab === "speech" ? (
          <SpeechTab
            text={speechText}
            setText={setSpeechText}
            name={speechName}
            setName={setSpeechName}
            voice={speechVoice}
            setVoice={setSpeechVoice}
            format={speechFormat}
            setFormat={setSpeechFormat}
            speed={speechSpeed}
            setSpeed={setSpeechSpeed}
            busy={speechBusy}
            setBusy={setSpeechBusy}
            error={speechError}
            setError={setSpeechError}
            result={speechResult}
            setResult={setSpeechResult}
          />
        ) : (
          <ImageTab
            prompt={imagePrompt}
            setPrompt={setImagePrompt}
            name={imageName}
            setName={setImageName}
            size={imageSize}
            setSize={setImageSize}
            style={imageStyle}
            setStyle={setImageStyle}
            focus={imageFocus}
            setFocus={setImageFocus}
            busy={imageBusy}
            setBusy={setImageBusy}
            error={imageError}
            setError={setImageError}
            result={imageResult}
            setResult={setImageResult}
          />
        )}
      </section>
    </div>
  );
}
