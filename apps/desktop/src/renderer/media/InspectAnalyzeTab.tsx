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
  MEDIA_FILE_FIELD_CLASS,
  MEDIA_FORM_CLASS,
  MEDIA_HEADING_CLASS,
  MEDIA_SELECT_CLASS,
  MEDIA_TAB_PANEL_CLASS,
} from "./media-layout";
import { useAbortableMediaRequest } from "./use-abortable-media-request";

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
  const inspectRequest = useAbortableMediaRequest(active);
  const analyzeRequest = useAbortableMediaRequest(active);
  const [inspectError, setInspectError] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");

  const runInspect = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) {
      setInspectError("Path is required.");
      return;
    }
    setInspectError("");
    setInspectResult(null);
    try {
      const payload = await inspectRequest.run((signal) =>
        desktopRequest<InspectResponse>(
          `/media/inspect?path=${encodeURIComponent(trimmed)}`,
          "GET",
          undefined,
          signal,
        ),
      );
      if (payload) setInspectResult(payload.media ?? {});
    } catch (error) {
      setInspectError(errorMessage(error));
    }
  };

  const runAnalyze = async () => {
    const trimmed = path.trim();
    if (!trimmed) {
      setAnalyzeError("Path is required.");
      return;
    }
    setAnalyzeError("");
    setAnalyzeResult(null);
    try {
      const payload = await analyzeRequest.run((signal) =>
        desktopRequest<AnalyzeResponse>(
          "/media/analyze",
          "POST",
          { path: trimmed, focus: focus || undefined },
          signal,
        ),
      );
      if (payload) setAnalyzeResult(payload.analysis ?? {});
    } catch (error) {
      setAnalyzeError(errorMessage(error));
    }
  };

  return (
    <section
      aria-labelledby="media-tab-inspect-analyze"
      className={MEDIA_TAB_PANEL_CLASS}
      hidden={!active}
      id="media-panel-inspect-analyze"
      role="tabpanel"
    >
      <form className={MEDIA_FORM_CLASS} onSubmit={runInspect}>
        <div className={MEDIA_HEADING_CLASS}>
          <div>
            <h2>Inspect file</h2>
          </div>
        </div>
        <div className={MEDIA_FILE_FIELD_CLASS}>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-inspect-path">
            <span>File</span>
            <Input
              aria-label="Media path for inspection"
              id="media-inspect-path"
              onChange={(event) => setPath(event.target.value)}
              placeholder="/tmp/example.wav"
              value={path}
            />
          </label>
          <Button
            onClick={() => void chooseLocalMediaFile(setPath, setInspectError)}
            type="button"
            variant="secondary"
          >
            Browse…
          </Button>
        </div>
        <MediaOptions label="Analysis settings" value={focus || "Auto"}>
          <label className={MEDIA_FIELD_CLASS}>
            <span>Focus</span>
            <select
              className={MEDIA_SELECT_CLASS}
              onChange={(event) => setFocus(event.target.value)}
              value={focus}
            >
              <option value="">auto</option>
              <option value="voice">voice</option>
              <option value="vision">vision</option>
              <option value="research">research</option>
            </select>
          </label>
        </MediaOptions>
        <div className={MEDIA_ACTIONS_CLASS}>
          <Button
            disabled={analyzeRequest.busy}
            onClick={() => void runAnalyze()}
            type="button"
            variant="secondary"
          >
            {analyzeRequest.busy ? "Analyzing…" : "Analyze"}
          </Button>
          {analyzeRequest.busy ? (
            <Button
              aria-label="Cancel media analysis"
              onClick={analyzeRequest.cancel}
              type="button"
              variant="secondary"
            >
              Cancel analysis
            </Button>
          ) : null}
          <Button disabled={inspectRequest.busy} type="submit">
            {inspectRequest.busy ? "Inspecting…" : "Inspect"}
          </Button>
          {inspectRequest.busy ? (
            <Button
              aria-label="Cancel media inspection"
              onClick={inspectRequest.cancel}
              type="button"
              variant="secondary"
            >
              Cancel inspection
            </Button>
          ) : null}
        </div>
      </form>

      {inspectError || analyzeError || inspectResult || analyzeResult ? (
        <div className="grid min-w-0 gap-2.5">
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
