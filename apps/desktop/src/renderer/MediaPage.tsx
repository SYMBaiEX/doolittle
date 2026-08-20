import { Button } from "@elizaos/ui/components/ui/button";
import { type KeyboardEvent, useRef, useState } from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
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
    <div className="page gap-3.5">
      <PageHeader
        description="Inspect, transcribe, and generate with Eliza media services."
        eyebrow="Operator"
        title="Media"
      />

      {!active ? (
        <OfflineRouteState>
          Media operations are unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : (
        <>
          <div
            aria-label="Media action tabs"
            className="flex w-full gap-4 overflow-x-auto border-0 border-b border-[var(--border)] bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {MEDIA_TABS.map((entry) => (
              <Button
                aria-controls={`media-panel-${entry.id}`}
                aria-selected={entry.id === activeTab}
                className={`relative min-h-[34px] flex-none rounded-none border-0 border-b-2 bg-transparent px-0 pt-1.5 pb-2 font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold tracking-[0.055em] whitespace-nowrap uppercase shadow-none hover:bg-transparent ${
                  entry.id === activeTab
                    ? "border-[var(--accent)] text-[var(--text)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--text-soft)]"
                }`}
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
                size="sm"
                tabIndex={entry.id === activeTab ? 0 : -1}
                type="button"
                variant="ghost"
              >
                {entry.label}
              </Button>
            ))}
          </div>

          <div className="min-h-0 min-w-0">
            <InspectAnalyzeTab active={activeTab === "inspect-analyze"} />
            <TranscribeTab active={activeTab === "transcribe"} />
            <SpeechTab active={activeTab === "speech"} />
            <ImageTab active={activeTab === "image"} />
          </div>
        </>
      )}
    </div>
  );
}
