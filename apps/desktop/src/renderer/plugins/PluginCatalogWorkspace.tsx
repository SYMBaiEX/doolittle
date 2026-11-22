import { Puzzle } from "lucide-react";
import {
  CatalogBrowser,
  CatalogDetail,
  CatalogFacts,
  CatalogPolicy,
  CatalogStatus,
} from "../components/CatalogBrowser";
import { titleCase } from "../lib";
import type { PluginCatalogItem } from "./plugin-catalog-model";

const PLUGIN_CATALOG_PAGE_SIZE = 8;

export function PluginCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly PluginCatalogItem[];
  resetKey: string;
}) {
  return (
    <CatalogBrowser
      getRow={(plugin) => ({
        title: plugin.title,
        meta: (
          <>
            <span>{titleCase(plugin.category)}</span>
            <span>{titleCase(plugin.maturity)}</span>
          </>
        ),
        status: !plugin.enabled ? (
          <CatalogStatus tone="warn">Inactive</CatalogStatus>
        ) : undefined,
      })}
      icon={Puzzle}
      idPrefix="plugin"
      items={entries}
      label="Runtime plugin catalog"
      listLabel="Plugins"
      pageSize={PLUGIN_CATALOG_PAGE_SIZE}
      resetKey={resetKey}
    >
      {(plugin) => (
        <>
          <CatalogDetail
            description={plugin.description}
            icon={Puzzle}
            name={plugin.title}
            status={
              <CatalogStatus tone={plugin.enabled ? "good" : "warn"}>
                {plugin.enabled ? "Enabled" : "Inactive"}
              </CatalogStatus>
            }
          />
          {!plugin.enabled ? (
            <CatalogPolicy title="Runtime configuration">
              The current local configuration leaves this plugin inactive.
            </CatalogPolicy>
          ) : null}
          <CatalogFacts
            facts={[
              { label: "Package", value: <code>{plugin.packageName}</code> },
              { label: "Plugin ID", value: <code>{plugin.id}</code> },
              { label: "Category", value: titleCase(plugin.category) },
              { label: "Source", value: titleCase(plugin.source) },
              { label: "Kind", value: titleCase(plugin.kind) },
              { label: "Maturity", value: titleCase(plugin.maturity) },
              { label: "Persistence", value: titleCase(plugin.persistence) },
            ]}
          />
        </>
      )}
    </CatalogBrowser>
  );
}
