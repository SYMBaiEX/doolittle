import { Button } from "@elizaos/ui/components/ui/button";
import { type KeyboardEvent, useRef, useState } from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { PageHeader } from "./lib";
import { ImageTab } from "./media/ImageTab";
import { InspectAnalyzeTab } from "./media/InspectAnalyzeTab";
import { MediaLibraryTab } from "./media/MediaLibraryTab";
import { SpeechTab } from "./media/SpeechTab";
import { TranscribeTab } from "./media/TranscribeTab";

const MEDIA_TABS = [
  { id: "library", label: "Library" },
  { id: "tools", label: "Tools" },
] as const;

const MEDIA_TOOLS = [
  { id: "inspect-analyze", label: "Inspect / Analyze" },
  { id: "transcribe", label: "Transcribe" },
  { id: "speech", label: "Speech" },
  { id: "image", label: "Image" },
] as const;

type MediaTabId = (typeof MEDIA_TABS)[number]["id"];
type MediaToolId = (typeof MEDIA_TOOLS)[number]["id"];

export function MediaPage({
  active,
  embedded = false,
}: {
  active: boolean;
  embedded?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<MediaTabId>("library");
  const [activeTool, setActiveTool] = useState<MediaToolId>("image");
  const [libraryRevision, setLibraryRevision] = useState(0);
  const tabRefs = useRef<Record<MediaTabId, HTMLButtonElement | null>>({
    library: null,
    tools: null,
  });

  const moveTab = (direction: -1 | 1) => {
    const index = MEDIA_TABS.findIndex((entry) => entry.id === activeTab);
    const next =
      MEDIA_TABS[(index + direction + MEDIA_TABS.length) % MEDIA_TABS.length];
    setActiveTab(next.id);
    requestAnimationFrame(() => tabRefs.current[next.id]?.focus());
  };

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "page h-full min-h-0 gap-0 overflow-hidden p-0"
      }
    >
      {embedded ? null : (
        <PageHeader
          description="Every generated image, recording, and video—indexed automatically."
          eyebrow="Workspace"
          title="Assets"
        />
      )}

      {!active ? (
        <OfflineRouteState>
          Media operations are unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : (
        <>
          <div
            aria-label="Asset workspace"
            className="flex min-h-10 shrink-0 items-end gap-4 border-0 border-b border-[var(--border)] bg-[var(--surface)] px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {MEDIA_TABS.map((entry) => (
              <Button
                aria-controls={`media-panel-${entry.id}`}
                aria-selected={entry.id === activeTab}
                className={`relative min-h-9 flex-none rounded-none border-0 border-b-2 bg-transparent px-0 pt-1.5 pb-2 font-[var(--font-mono)] text-[length:var(--text-meta)] font-bold tracking-[0.055em] whitespace-nowrap uppercase shadow-none hover:bg-transparent ${
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

          <MediaLibraryTab
            active={activeTab === "library"}
            revision={libraryRevision}
          />
          <section
            aria-labelledby="media-tab-tools"
            className="min-h-0 min-w-0 flex-1 overflow-auto px-3 pb-3"
            hidden={activeTab !== "tools"}
            id="media-panel-tools"
            role="tabpanel"
          >
            <div
              aria-label="Media tools"
              className="flex gap-1.5 border-b border-[var(--border)] py-2"
              role="tablist"
            >
              {MEDIA_TOOLS.map((tool) => (
                <button
                  aria-controls={`media-panel-${tool.id}`}
                  aria-selected={tool.id === activeTool}
                  className={`min-h-7 rounded-[var(--radius-xs)] border px-2.5 font-[var(--font-mono)] text-[length:var(--text-meta)] ${
                    tool.id === activeTool
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  }`}
                  id={`media-tab-${tool.id}`}
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  role="tab"
                  type="button"
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <InspectAnalyzeTab active={activeTool === "inspect-analyze"} />
            <TranscribeTab active={activeTool === "transcribe"} />
            <SpeechTab
              active={activeTool === "speech"}
              onAssetCreated={() => {
                setLibraryRevision((current) => current + 1);
                setActiveTab("library");
              }}
            />
            <ImageTab
              active={activeTool === "image"}
              onAssetCreated={() => {
                setLibraryRevision((current) => current + 1);
                setActiveTab("library");
              }}
            />
          </section>
        </>
      )}
    </div>
  );
}
