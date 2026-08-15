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
  MEDIA_TAB_PANEL_CLASS,
} from "./media-layout";

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
      className={MEDIA_TAB_PANEL_CLASS}
      hidden={!active}
      id="media-panel-image"
      role="tabpanel"
    >
      <form className={MEDIA_FORM_CLASS} onSubmit={runGenerate}>
        <div className={MEDIA_HEADING_CLASS}>
          <div>
            <h2>Generate an image from text</h2>
          </div>
        </div>
        <label className={MEDIA_FIELD_WIDE_CLASS} htmlFor="media-image-prompt">
          <span>Prompt</span>
          <Textarea
            id="media-image-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Design a clean operator dashboard"
            rows={5}
            value={prompt}
          />
        </label>
        <MediaOptions label="Image settings" value={size || "Provider default"}>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-image-name">
            <span>Name</span>
            <Input
              id="media-image-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="dashboard-art"
              value={name}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-image-size">
            <span>Size</span>
            <Input
              id="media-image-size"
              onChange={(event) => setSize(event.target.value)}
              placeholder="1024x1024"
              value={size}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-image-style">
            <span>Style</span>
            <Input
              id="media-image-style"
              onChange={(event) => setStyle(event.target.value)}
              placeholder="cinematic"
              value={style}
            />
          </label>
          <label className={MEDIA_FIELD_CLASS} htmlFor="media-image-focus">
            <span>Focus</span>
            <Input
              id="media-image-focus"
              onChange={(event) => setFocus(event.target.value)}
              placeholder="UI layout"
              value={focus}
            />
          </label>
        </MediaOptions>
        <div className={MEDIA_ACTIONS_CLASS}>
          <Button disabled={busy} type="submit">
            {busy ? "Generating…" : "Generate"}
          </Button>
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
