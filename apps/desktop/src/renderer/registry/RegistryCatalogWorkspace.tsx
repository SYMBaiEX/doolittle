import "../components/catalog-browser.css";
import { useCatalogBrowser } from "../components/useCatalogBrowser";
import { Badge, titleCase } from "../lib";
import "../registry.css";
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
      className="catalog-browser registry-catalog-workspace"
    >
      <aside className="catalog-browser__index">
        <header className="catalog-browser__index-header">
          <div>
            <span className="eyebrow">Registry index</span>
            <strong>Browse packages</strong>
          </div>
          <small>{items.length} results</small>
        </header>
        <div
          aria-label="Registry packages"
          aria-orientation="vertical"
          className="catalog-browser__index-list"
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
                className={`catalog-browser__index-item${active ? " is-selected" : ""}`}
                id={itemId(index)}
                onClick={() => selectAt(index, false)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                role="tab"
                tabIndex={active ? 0 : -1}
                type="button"
              >
                <span className="catalog-browser__index-title">
                  <strong>{entry.name}</strong>
                  {entry.installed ? (
                    <Badge tone="good">Installed</Badge>
                  ) : entry.installable ? (
                    <Badge tone="good">Eligible</Badge>
                  ) : null}
                </span>
                <span className="catalog-browser__index-meta">
                  <code>{entry.version}</code>
                  <span>{titleCase(entry.trust)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {window.remaining ? (
          <footer className="catalog-browser__index-footer">
            <span>
              {window.visible.length} of {items.length}
            </span>
            <button
              className="secondary-button"
              onClick={showMore}
              type="button"
            >
              Show {Math.min(REGISTRY_CATALOG_PAGE_SIZE, window.remaining)} more
            </button>
          </footer>
        ) : null}
      </aside>
      <article
        aria-labelledby={itemId(selectedIndex)}
        className="catalog-browser__detail"
        id={panelId}
        role="tabpanel"
      >
        <header className="catalog-browser__detail-header">
          <div>
            <span className="eyebrow">Package detail</span>
            <h2>{selectedEntry.name}</h2>
            <p>{selectedEntry.description}</p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </header>
        {!selectedEntry.installable && !selectedEntry.installed ? (
          <div className="catalog-browser__callout" role="note">
            <strong>Runtime policy</strong>
            <span>
              {selectedEntry.reasons.length
                ? selectedEntry.reasons.join(" ")
                : "This package is not eligible for installation under the current runtime policy."}
            </span>
          </div>
        ) : null}
        <dl className="catalog-browser__facts">
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
            className="registry-install-review"
          >
            <div>
              <span className="eyebrow">Install approval</span>
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
            <div className="registry-install-review__actions">
              {reviewing ? (
                <>
                  <button
                    className="primary-button"
                    disabled={installing}
                    onClick={() => onApproveInstall(selectedEntry)}
                    type="button"
                  >
                    {installing
                      ? "Installing…"
                      : `Approve ${selectedEntry.version}`}
                  </button>
                  <button
                    className="text-button"
                    disabled={installing}
                    onClick={onCancelInstall}
                    type="button"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  className="secondary-button"
                  disabled={installing}
                  onClick={() => onReviewInstall(selectedEntry)}
                  type="button"
                >
                  Review install
                </button>
              )}
            </div>
          </section>
        ) : null}
      </article>
    </section>
  );
}
