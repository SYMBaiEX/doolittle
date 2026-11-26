import {
  Button,
  type ContextAction,
  ContextActionMenu,
  Input,
} from "@doolittle/ui";
import { Film, Image, Music2, RefreshCw } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { ErrorBlock, LoadingBlock, useApiResource } from "../lib";

type AssetKind = "image" | "audio" | "video";

interface MediaLibraryAsset {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  prompt: string;
  provider: string;
  model: string;
  origin?: { botId: string; sessionId: string };
}

interface LibraryResponse {
  assets: MediaLibraryAsset[];
}

interface AssetPayload {
  asset: MediaLibraryAsset;
  encoding: "base64";
  content: string;
}

function compactBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function mediaProviderModelLabel(
  provider: string,
  model: string,
): string {
  const providerLabel = provider.trim();
  const modelLabel = model.trim();
  if (!providerLabel && !modelLabel) return "Unknown source";
  if (!providerLabel) return modelLabel;
  if (!modelLabel || providerLabel.toLowerCase() === modelLabel.toLowerCase()) {
    return providerLabel;
  }
  return `${providerLabel} · ${modelLabel}`;
}

function assetIcon(kind: AssetKind) {
  return kind === "image" ? Image : kind === "audio" ? Music2 : Film;
}

function assetUrl(payload: AssetPayload): string {
  return `data:${payload.asset.mimeType};base64,${payload.content}`;
}

function preventRadioGroupEnter(event: KeyboardEvent<HTMLInputElement>) {
  // Filter choices can be mounted inside larger workspace forms.
  if (event.key === "Enter") event.preventDefault();
}

function choiceClass(checked: boolean, className = ""): string {
  return `inline-flex h-[var(--control-height)] min-h-[var(--control-height)] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent px-3 text-[length:var(--text-control)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-within:outline focus-within:outline-1 focus-within:outline-offset-[-2px] focus-within:outline-[var(--focus-ring)] max-[760px]:h-11 max-[760px]:min-h-11 motion-reduce:transition-none ${className} ${
    checked
      ? "font-semibold text-[var(--text)]"
      : "font-medium text-[var(--muted)]"
  }`;
}

export function MediaLibraryTab({
  active,
  botId,
  onOpenConversation,
  sessionId,
}: {
  active: boolean;
  botId?: string;
  onOpenConversation?: (sessionId: string) => void;
  sessionId?: string;
}) {
  const [allAssets, setAllAssets] = useState(false);
  const chatFilter = !allAssets && sessionId;
  const library = useApiResource<LibraryResponse>(
    active
      ? chatFilter
        ? `/media/library?${new URLSearchParams({ sessionId: chatFilter })}`
        : "/media/library"
      : null,
    [],
    botId,
  );
  const assets = library.data?.assets ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | AssetKind>("all");
  const [query, setQuery] = useState("");
  const scopeGroupName = useId();
  const typeGroupName = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const visibleAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        (filter === "all" || asset.kind === filter) &&
        (!needle ||
          asset.name.toLowerCase().includes(needle) ||
          asset.prompt.toLowerCase().includes(needle) ||
          asset.provider.toLowerCase().includes(needle)),
    );
  }, [assets, filter, query]);
  const selectedAsset =
    visibleAssets.find((asset) => asset.id === selectedId) ?? visibleAssets[0];
  const showEmptyState =
    !library.loading && !library.error && visibleAssets.length === 0;
  const payload = useApiResource<AssetPayload>(
    active && selectedAsset
      ? `/media/library/${encodeURIComponent(selectedAsset.id)}`
      : null,
    [selectedAsset?.id],
    botId,
  );
  const assetActions = (asset: MediaLibraryAsset): ContextAction[] => [
    {
      id: "view",
      label: "View asset",
      disabled: !active,
      onSelect: () => setSelectedId(asset.id),
    },
    {
      id: "copy-name",
      label: "Copy asset name",
      onSelect: () => void copyContextText(asset.name),
    },
    {
      id: "copy-metadata",
      label: "Copy asset metadata",
      onSelect: () => void copyContextText(JSON.stringify(asset, null, 2)),
    },
    {
      id: "refresh",
      label: "Refresh asset library",
      disabled: !active || library.loading,
      separatorBefore: true,
      onSelect: library.reload,
    },
  ];

  useEffect(() => {
    if (!active) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") library.reload();
    };
    const interval = window.setInterval(refreshWhenVisible, 6_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [active, library.reload]);

  return (
    <section
      aria-label="Generated assets"
      className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_minmax(0,1fr)] overflow-hidden max-[760px]:flex max-[760px]:flex-col max-[760px]:overflow-auto"
      hidden={!active}
      id="media-panel-library"
    >
      <aside
        className={`flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-[760px]:max-h-[42vh] max-[760px]:border-r-0 max-[760px]:border-b ${
          showEmptyState ? "max-[760px]:min-h-0" : "max-[760px]:min-h-64"
        }`}
      >
        <div className="grid gap-2 border-b border-[var(--border)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <strong className="font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.07em] text-[var(--text-soft)] uppercase">
              {library.loading
                ? "Loading library"
                : library.error
                  ? "Library unavailable"
                  : `${assets.length} ${assets.length === 1 ? "asset" : "assets"}`}
            </strong>
            <Button
              aria-label="Refresh asset library"
              className="size-[var(--control-height)] p-0 max-[760px]:size-11"
              onClick={library.reload}
              size="icon"
              type="button"
              variant="ghost"
            >
              <UiIcon icon={RefreshCw} size="xs" />
            </Button>
          </div>
          {sessionId ? (
            <div
              aria-label="Asset scope"
              className="flex gap-1"
              role="radiogroup"
            >
              <label className={choiceClass(!allAssets)}>
                <input
                  checked={!allAssets}
                  className="sr-only"
                  name={scopeGroupName}
                  onChange={() => setAllAssets(false)}
                  onKeyDown={preventRadioGroupEnter}
                  type="radio"
                  value="chat"
                />
                This chat
              </label>
              <label className={choiceClass(allAssets)}>
                <input
                  checked={allAssets}
                  className="sr-only"
                  name={scopeGroupName}
                  onChange={() => setAllAssets(true)}
                  onKeyDown={preventRadioGroupEnter}
                  type="radio"
                  value="all"
                />
                All agent assets
              </label>
            </div>
          ) : null}
          <Input
            ref={searchInputRef}
            aria-label="Search generated assets"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            type="search"
            value={query}
          />
          <div aria-label="Asset type" className="flex gap-1" role="radiogroup">
            {(["all", "image", "audio", "video"] as const).map((kind) => {
              const checked = filter === kind;
              return (
                <label
                  className={choiceClass(checked, "capitalize")}
                  key={kind}
                >
                  <input
                    checked={checked}
                    className="sr-only"
                    name={typeGroupName}
                    onChange={() => setFilter(kind)}
                    onKeyDown={preventRadioGroupEnter}
                    type="radio"
                    value={kind}
                  />
                  {kind === "all" ? "All" : `${kind}s`}
                </label>
              );
            })}
          </div>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-auto p-1.5 ${
            showEmptyState ? "max-[760px]:hidden" : ""
          }`}
        >
          {library.loading ? (
            <LoadingBlock label="Loading assets…" />
          ) : library.error ? (
            <ErrorBlock error={library.error} retry={library.reload} />
          ) : visibleAssets.length === 0 ? null : (
            <div className="grid gap-0.5">
              {visibleAssets.map((asset) => {
                const Icon = assetIcon(asset.kind);
                return (
                  <ContextActionMenu
                    disabled={!active}
                    key={asset.id}
                    items={assetActions(asset)}
                    label={`Asset actions for ${asset.name}`}
                    scopeKey={asset.id}
                  >
                    <button
                      aria-current={
                        asset.id === selectedAsset?.id ? "true" : undefined
                      }
                      className={`grid min-h-14 w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)] ${
                        asset.id === selectedAsset?.id
                          ? "bg-transparent font-semibold [&_strong]:font-semibold text-[var(--text)]"
                          : "bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-hover)]"
                      }`}
                      onClick={() => setSelectedId(asset.id)}
                      type="button"
                    >
                      <span className="grid size-7 place-items-center rounded-[var(--radius-xs)] bg-[var(--surface-soft)] text-[var(--accent)]">
                        <UiIcon icon={Icon} size="sm" />
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <strong className="truncate text-[length:var(--text-control)] font-medium">
                          {asset.name}
                        </strong>
                        <small className="truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                          {asset.provider} · {compactBytes(asset.sizeBytes)}
                        </small>
                      </span>
                    </button>
                  </ContextActionMenu>
                );
              })}
            </div>
          )}
        </div>
      </aside>
      {showEmptyState ? (
        <div className="hidden gap-1 bg-[var(--surface)] p-3 max-[760px]:grid">
          <strong className="text-[length:var(--text-control)] text-[var(--text)]">
            {assets.length === 0
              ? chatFilter
                ? "No assets in this chat"
                : "No generated assets yet"
              : "No matches"}
          </strong>
          <span className="text-[length:var(--text-control)] leading-[1.45] text-[var(--muted)]">
            {assets.length === 0
              ? "Images, speech, and future generated media will appear here automatically."
              : "Try another search or asset type."}
          </span>
          {query.trim() || filter !== "all" ? (
            <Button
              onClick={() => {
                setQuery("");
                setFilter("all");
                searchInputRef.current?.focus();
              }}
              type="button"
              variant="secondary"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : null}
      <div
        className={`min-h-0 min-w-0 overflow-auto bg-[var(--bg)] p-4 ${
          showEmptyState ? "max-[760px]:hidden" : "max-[760px]:min-h-96"
        }`}
      >
        {library.loading || library.error ? null : !selectedAsset ? (
          <div className="grid min-h-48 max-w-lg content-center gap-1">
            <span className="eyebrow">Asset library</span>
            <h2 className="m-0 text-sm">
              {assets.length
                ? "No assets match these filters"
                : chatFilter
                  ? "No assets in this chat"
                  : "Generated work, in one place"}
            </h2>
            <p className="m-0 text-[length:var(--text-body)] leading-[1.55] text-[var(--muted)]">
              {assets.length
                ? "Clear the search or choose another asset type to inspect an output."
                : "Ask Doolittle in chat to create an image or recording. Its native actions record the prompt, model, provider, and durable output here automatically."}
            </p>
          </div>
        ) : (
          <ContextActionMenu
            disabled={!active}
            items={[
              ...assetActions(selectedAsset),
              {
                id: "refresh-preview",
                label: "Refresh asset preview",
                disabled: !active || payload.loading,
                onSelect: payload.reload,
              },
            ]}
            label={`Asset preview actions for ${selectedAsset.name}`}
            scopeKey={selectedAsset.id}
          >
            <article className="grid max-w-[980px] gap-3">
              <header className="grid gap-1 border-b border-[var(--border)] pb-3">
                <span className="eyebrow">{selectedAsset.kind} asset</span>
                <h2 className="m-0 text-base">{selectedAsset.name}</h2>
                <p className="m-0 text-[length:var(--text-control)] text-[var(--muted)]">
                  {mediaProviderModelLabel(
                    selectedAsset.provider,
                    selectedAsset.model,
                  )}{" "}
                  · {compactBytes(selectedAsset.sizeBytes)}
                </p>
                {selectedAsset.origin?.botId === botId &&
                selectedAsset.origin?.sessionId &&
                onOpenConversation ? (
                  <Button
                    className="justify-self-start"
                    onClick={() => {
                      if (selectedAsset.origin)
                        onOpenConversation(selectedAsset.origin.sessionId);
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {selectedAsset.origin.sessionId === sessionId
                      ? "Return to source chat"
                      : "Open source chat"}
                  </Button>
                ) : null}
              </header>
              {payload.loading ? (
                <LoadingBlock label="Loading preview…" />
              ) : payload.error ? (
                <ErrorBlock error={payload.error} retry={payload.reload} />
              ) : payload.data?.asset.id === selectedAsset.id ? (
                selectedAsset.kind === "image" ? (
                  <img
                    alt={selectedAsset.prompt || selectedAsset.name}
                    className="block max-h-[min(62vh,720px)] max-w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--canvas-bg)] object-contain"
                    src={assetUrl(payload.data)}
                  />
                ) : selectedAsset.kind === "audio" ? (
                  // Generated narration may not include a truthful caption track.
                  // biome-ignore lint/a11y/useMediaCaption: no caption payload exists
                  <audio
                    aria-label={`Generated audio asset ${selectedAsset.name}`}
                    className="w-full"
                    controls
                    src={assetUrl(payload.data)}
                  />
                ) : (
                  // Generated video may not include a truthful caption track.
                  // biome-ignore lint/a11y/useMediaCaption: no caption payload exists
                  <video
                    aria-label={`Generated video asset ${selectedAsset.name}`}
                    className="max-h-[62vh] max-w-full"
                    controls
                    src={assetUrl(payload.data)}
                  />
                )
              ) : null}
              {selectedAsset.prompt ? (
                <section className="grid gap-1.5 pt-1">
                  <strong className="font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.07em] text-[var(--muted)] uppercase">
                    Source prompt
                  </strong>
                  <p className="m-0 max-w-[760px] text-[length:var(--text-body)] leading-[1.55] text-[var(--text-soft)]">
                    {selectedAsset.prompt}
                  </p>
                </section>
              ) : null}
            </article>
          </ContextActionMenu>
        )}
      </div>
    </section>
  );
}
