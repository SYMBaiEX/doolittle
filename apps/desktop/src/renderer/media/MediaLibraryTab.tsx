import { Button } from "@elizaos/ui/components/ui/button";
import { Film, Image, Music2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UiIcon } from "../components/UiIcon";
import { errorMessage, Notice, useApiResource } from "../lib";

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

function assetIcon(kind: AssetKind) {
  return kind === "image" ? Image : kind === "audio" ? Music2 : Film;
}

function assetUrl(payload: AssetPayload): string {
  return `data:${payload.asset.mimeType};base64,${payload.content}`;
}

export function MediaLibraryTab({
  active,
  revision,
}: {
  active: boolean;
  revision: number;
}) {
  const library = useApiResource<LibraryResponse>(
    active ? "/media/library" : null,
    [revision],
  );
  const assets = library.data?.assets ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | AssetKind>("all");
  const [query, setQuery] = useState("");
  const selectedAsset = assets.find((asset) => asset.id === selectedId);
  const payload = useApiResource<AssetPayload>(
    active && selectedAsset
      ? `/media/library/${encodeURIComponent(selectedAsset.id)}`
      : null,
    [selectedAsset?.id],
  );

  useEffect(() => {
    if (assets.length === 0) setSelectedId("");
    else if (!assets.some((asset) => asset.id === selectedId)) {
      setSelectedId(assets[0]?.id ?? "");
    }
  }, [assets, selectedId]);

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

  return (
    <section
      aria-labelledby="media-tab-library"
      className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_minmax(0,1fr)] overflow-hidden max-[760px]:flex max-[760px]:flex-col max-[760px]:overflow-auto"
      hidden={!active}
      id="media-panel-library"
      role="tabpanel"
    >
      <aside className="flex min-h-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-[760px]:max-h-[42vh] max-[760px]:min-h-64 max-[760px]:border-r-0 max-[760px]:border-b">
        <div className="grid gap-2 border-b border-[var(--border)] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <strong className="font-[var(--font-mono)] text-[length:var(--text-meta)] tracking-[0.07em] text-[var(--text-soft)] uppercase">
              {assets.length} {assets.length === 1 ? "asset" : "assets"}
            </strong>
            <Button
              aria-label="Refresh asset library"
              className="size-7 min-h-7 p-0"
              onClick={library.reload}
              size="icon"
              type="button"
              variant="ghost"
            >
              <UiIcon icon={RefreshCw} size="xs" />
            </Button>
          </div>
          <input
            aria-label="Search generated assets"
            className="min-h-7 w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface-soft)] px-2 text-[11px] text-[var(--text)]"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search assets"
            type="search"
            value={query}
          />
          <fieldset className="flex gap-1 border-0 p-0" aria-label="Asset type">
            {(["all", "image", "audio", "video"] as const).map((kind) => (
              <button
                className={`min-h-6 rounded-[var(--radius-xs)] border px-2 font-[var(--font-mono)] text-[length:var(--text-meta)] capitalize ${
                  filter === kind
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-transparent text-[var(--muted)]"
                }`}
                key={kind}
                onClick={() => setFilter(kind)}
                type="button"
              >
                {kind === "all" ? "All" : `${kind}s`}
              </button>
            ))}
          </fieldset>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          {library.loading ? (
            <p className="p-3 text-[11px] text-[var(--muted)]">
              Loading assets…
            </p>
          ) : library.error ? (
            <Notice tone="bad">{library.error}</Notice>
          ) : visibleAssets.length === 0 ? (
            <div className="grid gap-1 p-3">
              <strong className="text-[11px] text-[var(--text)]">
                {assets.length === 0 ? "No generated assets yet" : "No matches"}
              </strong>
              <span className="text-[10px] leading-[1.45] text-[var(--muted)]">
                {assets.length === 0
                  ? "Images, speech, and future generated media will appear here automatically."
                  : "Try another search or asset type."}
              </span>
            </div>
          ) : (
            <div className="grid gap-0.5">
              {visibleAssets.map((asset) => {
                const Icon = assetIcon(asset.kind);
                return (
                  <button
                    aria-current={asset.id === selectedId ? "true" : undefined}
                    className={`grid min-h-12 w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-[var(--radius-xs)] border-0 px-2 py-1.5 text-left ${
                      asset.id === selectedId
                        ? "bg-[var(--surface-hover)] text-[var(--text)] shadow-[inset_2px_0_var(--accent)]"
                        : "bg-transparent text-[var(--text-soft)] hover:bg-[var(--surface-hover)]"
                    }`}
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    type="button"
                  >
                    <span className="grid size-7 place-items-center rounded-[var(--radius-xs)] bg-[var(--surface-soft)] text-[var(--accent)]">
                      <UiIcon icon={Icon} size="sm" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-[11px]">
                        {asset.name}
                      </strong>
                      <small className="truncate font-[var(--font-mono)] text-[length:var(--text-meta)] text-[var(--muted)]">
                        {asset.provider} · {compactBytes(asset.sizeBytes)}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
      <div className="min-h-0 min-w-0 overflow-auto bg-[var(--bg)] p-4 max-[760px]:min-h-96">
        {!selectedAsset ? (
          <div className="grid min-h-48 max-w-lg content-center gap-1">
            <span className="eyebrow">Asset library</span>
            <h2 className="m-0 text-sm">Generated work, in one place</h2>
            <p className="m-0 text-[11px] leading-[1.55] text-[var(--muted)]">
              Create an image or speech asset in Tools. Doolittle records its
              prompt, model, provider, and durable output automatically.
            </p>
          </div>
        ) : (
          <article className="grid max-w-[980px] gap-3">
            <header className="grid gap-1 border-b border-[var(--border)] pb-3">
              <span className="eyebrow">{selectedAsset.kind} asset</span>
              <h2 className="m-0 text-base">{selectedAsset.name}</h2>
              <p className="m-0 text-[11px] text-[var(--muted)]">
                {selectedAsset.provider} · {selectedAsset.model} ·{" "}
                {compactBytes(selectedAsset.sizeBytes)}
              </p>
            </header>
            {payload.loading ? (
              <p className="text-[11px] text-[var(--muted)]">
                Loading preview…
              </p>
            ) : payload.error ? (
              <Notice tone="bad">{errorMessage(payload.error)}</Notice>
            ) : payload.data ? (
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
                  className="w-full"
                  controls
                  src={assetUrl(payload.data)}
                />
              ) : (
                // Generated video may not include a truthful caption track.
                // biome-ignore lint/a11y/useMediaCaption: no caption payload exists
                <video
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
                <p className="m-0 max-w-[760px] text-[11px] leading-[1.55] text-[var(--text-soft)]">
                  {selectedAsset.prompt}
                </p>
              </section>
            ) : null}
          </article>
        )}
      </div>
    </section>
  );
}
