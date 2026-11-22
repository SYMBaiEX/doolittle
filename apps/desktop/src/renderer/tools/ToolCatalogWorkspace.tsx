import { Wrench } from "lucide-react";
import {
  CatalogBrowser,
  CatalogDetail,
  CatalogFacts,
  CatalogPolicy,
  CatalogStatus,
} from "../components/CatalogBrowser";
import { titleCase, type UnknownRecord } from "../lib";
import { buildToolCatalogItems } from "./tool-catalog-model";

const TOOL_CATALOG_PAGE_SIZE = 12;

function displayTransport(transport: string): string {
  const normalized = transport.toLowerCase();
  return normalized === "mcp" || normalized === "acp"
    ? normalized.toUpperCase()
    : titleCase(transport);
}

export function ToolCatalogWorkspace({
  entries,
  resetKey,
}: {
  entries: readonly UnknownRecord[];
  resetKey: string;
}) {
  return (
    <CatalogBrowser
      getRow={(item) => ({
        title: item.title,
        meta: (
          <>
            <code>{item.id}</code>
            <span>{titleCase(item.category)}</span>
            {item.transport.toLowerCase() !== "native" ? (
              <span>{displayTransport(item.transport)}</span>
            ) : null}
          </>
        ),
        status: !item.enabled ? (
          <CatalogStatus tone="warn">Disabled</CatalogStatus>
        ) : undefined,
      })}
      icon={Wrench}
      idPrefix="tool"
      items={buildToolCatalogItems([...entries])}
      label="Runtime tool catalog"
      listLabel="Tools"
      pageSize={TOOL_CATALOG_PAGE_SIZE}
      resetKey={resetKey}
    >
      {(tool) => (
        <>
          <CatalogDetail
            description={tool.description}
            icon={Wrench}
            name={tool.title}
            status={
              <CatalogStatus tone={tool.enabled ? "good" : "warn"}>
                {tool.enabled ? "Available" : "Disabled"}
              </CatalogStatus>
            }
          />
          {!tool.enabled && tool.policyReason ? (
            <CatalogPolicy title="Profile policy">
              {tool.policyReason}
            </CatalogPolicy>
          ) : null}
          <CatalogFacts
            facts={[
              { label: "Tool ID", value: <code>{tool.id}</code> },
              { label: "Category", value: titleCase(tool.category) },
              { label: "Transport", value: displayTransport(tool.transport) },
              { label: "Source", value: titleCase(tool.source) },
              {
                label: "Profiles",
                value: tool.allowedProfiles.length
                  ? tool.allowedProfiles.map(titleCase).join(" · ")
                  : "Runtime default",
              },
            ]}
          />
          {tool.aliases.length ? (
            <section aria-label="Tool aliases" className="catalog-tokens">
              <span>Invoked as</span>
              <div>
                {tool.aliases.map((alias) => (
                  <code key={alias}>{alias}</code>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </CatalogBrowser>
  );
}
