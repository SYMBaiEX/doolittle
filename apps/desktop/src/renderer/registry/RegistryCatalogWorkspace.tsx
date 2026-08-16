import { Button } from "@elizaos/ui/components/ui/button";
import {
  CATALOG_BROWSER_CLASS,
  CATALOG_CALLOUT_CLASS,
  CATALOG_DETAIL_CLASS,
  CATALOG_DETAIL_HEADER_CLASS,
  CATALOG_EYEBROW_CLASS,
  CATALOG_FACTS_CLASS,
  CATALOG_INDEX_CLASS,
  CATALOG_INDEX_FOOTER_CLASS,
  CATALOG_INDEX_HEADER_CLASS,
  CATALOG_INDEX_LIST_CLASS,
  CATALOG_INDEX_META_CLASS,
  CATALOG_INDEX_TITLE_CLASS,
  catalogIndexItemClass,
} from "../components/catalog-browser-layout";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase } from "../lib";
import { REGISTRY_INSTALL_CAVEAT, type RegistryEntry } from "./registry-model";

export const REGISTRY_CATALOG_PAGE_SIZE = 12;

function detailStatus(entry: RegistryEntry): {
  label: string;
  tone: "good" | "neutral";
} {
  if (entry.installed) return { label: "Installed", tone: "good" };
  if (entry.installable) return { label: "Eligible", tone: "good" };
  return { label: "Restricted", tone: "neutral" };
}

export function RegistryCatalogWorkspace({
  entries,
  installing,
  onApproveInstall,
  onCancelInstall,
  onReviewInstall,
  pendingInstall,
  resetKey,
}: {
  entries: readonly RegistryEntry[];
  installing: boolean;
  onApproveInstall: (entry: RegistryEntry) => void;
  onCancelInstall: () => void;
  onReviewInstall: (entry: RegistryEntry) => void;
  pendingInstall: string;
  resetKey: string;
}) {
  const items = entries.map((entry) => ({ id: entry.name, entry }));
  const {
    handleKeyDown,
    itemId,
    listRef,
    panelId,
    selected,
    selectedIndex,
    selectAt,
    showMore,
    window,
  } = useCatalogBrowser({
    idPrefix: "registry",
    items,
    pageSize: REGISTRY_CATALOG_PAGE_SIZE,
    resetKey,
  });

  if (!selected) return null;
  const selectedEntry = selected.entry;
  const status = detailStatus(selectedEntry);
  const reviewing = pendingInstall === selectedEntry.name;

  return (
    <section
      aria-label="Eliza plugin registry"
      className={CATALOG_BROWSER_CLASS}
    >
      <aside className={CATALOG_INDEX_CLASS}>
        <header className={CATALOG_INDEX_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Registry index</span>
            <strong>Browse packages</strong>
          </div>
          <small>{items.length} results</small>
        </header>
        <div
          aria-label="Registry packages"
          aria-orientation="vertical"
          className={CATALOG_INDEX_LIST_CLASS}
          ref={listRef}
          role="tablist"
        >
          {window.visible.map((item, index) => {
            const entry = item.entry;
            const active = entry.name === selectedEntry.name;
            return (
              <button
                key={entry.name}
                aria-controls={panelId}
                aria-selected={active}
                className={catalogIndexItemClass(active)}
                id={itemId(index)}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className={CATALOG_INDEX_TITLE_CLASS}>
                  <strong>{entry.name}</strong>
                  {entry.installed ? (
                    <Badge tone="good">Installed</Badge>
                  ) : entry.installable ? (
                    <Badge tone="good">Eligible</Badge>
                  ) : null}
                </span>
                <span className={CATALOG_INDEX_META_CLASS}>
                  <code>{entry.version}</code>
                  <span>{titleCase(entry.trust)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {window.remaining ? (
          <footer className={CATALOG_INDEX_FOOTER_CLASS}>
            <span>
              {window.visible.length} of {items.length}
            </span>
            <Button
              onClick={showMore}
              size="sm"
              type="button"
              variant="outline"
            >
              Show {Math.min(REGISTRY_CATALOG_PAGE_SIZE, window.remaining)} more
            </Button>
          </footer>
        ) : null}
      </aside>
      <article
        aria-labelledby={itemId(selectedIndex)}
        className={CATALOG_DETAIL_CLASS}
        id={panelId}
        role="tabpanel"
      >
        <header className={CATALOG_DETAIL_HEADER_CLASS}>
          <div>
            <span className={CATALOG_EYEBROW_CLASS}>Package detail</span>
            <h2>{selectedEntry.name}</h2>
            <p>{selectedEntry.description}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </header>
        {!selectedEntry.installable && !selectedEntry.installed ? (
          <div className={CATALOG_CALLOUT_CLASS} role="note">
            <strong>Runtime policy</strong>
            <span>
              {selectedEntry.reasons.length
                ? selectedEntry.reasons.join(" ")
                : "This package is not eligible for installation under the current runtime policy."}
            </span>
          </div>
        ) : null}
        <dl className={CATALOG_FACTS_CLASS}>
          <div>
            <dt>Package</dt>
            <dd>
              <code>{selectedEntry.packageName}</code>
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{selectedEntry.version}</dd>
          </div>
          <div>
            <dt>Support</dt>
            <dd>{titleCase(selectedEntry.support)}</dd>
          </div>
          <div>
            <dt>Trust</dt>
            <dd>{titleCase(selectedEntry.trust)}</dd>
          </div>
          <div>
            <dt>Integrity</dt>
            <dd>
              {selectedEntry.integrityVerified
                ? "Verified digest"
                : "Registry metadata only; no verified digest"}
            </dd>
          </div>
          {selectedEntry.repository ? (
            <div>
              <dt>Repository</dt>
              <dd>{selectedEntry.repository}</dd>
            </div>
          ) : null}
        </dl>
        {selectedEntry.installable && !selectedEntry.installed ? (
          <section
            aria-label={`Install ${selectedEntry.name}`}
            className="registry-install-review mt-4 flex items-center justify-between gap-[18px] rounded-[var(--radius-xs)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-soft)_72%,transparent)] px-3 py-[11px] max-[620px]:flex-col max-[620px]:items-stretch max-[620px]:gap-[9px] [&>div:first-child]:grid [&>div:first-child]:min-w-0 [&>div:first-child]:gap-0.5 [&_p]:m-0 [&_p]:max-w-[700px] [&_p]:text-[length:var(--text-meta)] [&_p]:leading-[1.45] [&_p]:text-[var(--muted)] [&_strong]:text-[length:var(--text-control)] [&_strong]:text-[var(--text)]"
          >
            <div>
              <span className={CATALOG_EYEBROW_CLASS}>Install approval</span>
              <strong>
                {reviewing
                  ? "Confirm exact package"
                  : "Review before installing"}
              </strong>
              <p>
                {reviewing
                  ? REGISTRY_INSTALL_CAVEAT
                  : `${selectedEntry.packageName} ${selectedEntry.version} will be passed to the Eliza installer only after explicit approval.`}
              </p>
            </div>
            <div className="registry-install-review__actions flex flex-none items-center gap-[7px] max-[620px]:justify-start [&>button]:min-h-[30px] [&>button]:px-[9px] [&>button]:py-1">
              {reviewing ? (
                <>
                  <Button
                    disabled={installing}
                    onClick={() => onApproveInstall(selectedEntry)}
                    type="button"
                  >
                    {installing
                      ? "Installing…"
                      : `Approve ${selectedEntry.version}`}
                  </Button>
                  <Button
                    disabled={installing}
                    onClick={onCancelInstall}
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  disabled={installing}
                  onClick={() => onReviewInstall(selectedEntry)}
                  type="button"
                  variant="outline"
                >
                  Review install
                </Button>
              )}
            </div>
          </section>
        ) : null}
      </article>
    </section>
  );
}
