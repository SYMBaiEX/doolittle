import { type KeyboardEvent, useRef, useState } from "react";
import { PageHeader } from "./lib";
import { ImageTab } from "./media/ImageTab";
import { InspectAnalyzeTab } from "./media/InspectAnalyzeTab";
import { SpeechTab } from "./media/SpeechTab";
import { TranscribeTab } from "./media/TranscribeTab";

const MEDIA_TABS = [
  { id: "inspect-analyze", label: "Inspect / Analyze" },
  { id: "transcribe", label: "Transcribe" },
  { id: "speech", label: "Speech" },
  { id: "image", label: "Image" },
] as const;

type MediaTabId = (typeof MEDIA_TABS)[number]["id"];

export function MediaPage({ active }: { active: boolean }) {
  const [activeTab, setActiveTab] = useState<MediaTabId>("inspect-analyze");
  const tabRefs = useRef<Record<MediaTabId, HTMLButtonElement | null>>({
    "inspect-analyze": null,
    transcribe: null,
    speech: null,
    image: null,
  });

  const moveTab = (direction: -1 | 1) => {
    const index = MEDIA_TABS.findIndex((entry) => entry.id === activeTab);
    const next =
      MEDIA_TABS[(index + direction + MEDIA_TABS.length) % MEDIA_TABS.length];
    setActiveTab(next.id);
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };

  return (
    <div className="page studio-page media-page">
      <PageHeader
        description="Inspect, transcribe, and generate with Eliza media services."
        eyebrow="Operator"
        title="Media"
      />

      <div aria-label="Media action tabs" className="media-tabs" role="tablist">
        {MEDIA_TABS.map((entry) => (
          <button
            aria-controls={`media-panel-${entry.id}`}
            aria-selected={entry.id === activeTab}
            className={`text-button ${entry.id === activeTab ? "selected" : ""}`}
            disabled={!active}
            id={`media-tab-${entry.id}`}
            key={entry.id}
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
            ref={(node) => {
              tabRefs.current[entry.id] = node;
            }}
            role="tab"
            tabIndex={entry.id === activeTab ? 0 : -1}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="media-panel">
        <InspectAnalyzeTab active={activeTab === "inspect-analyze"} />
        <TranscribeTab active={activeTab === "transcribe"} />
        <SpeechTab active={activeTab === "speech"} />
        <ImageTab active={activeTab === "image"} />
      </div>
    </div>
  );
}
