import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./PluginsPage.tsx", import.meta.url),
  "utf8",
);
const model = readFileSync(
  new URL("./plugins/plugin-catalog-model.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("./plugins/PluginCatalogWorkspace.tsx", import.meta.url),
  "utf8",
);
const catalogBrowserLayout = readFileSync(
  new URL("./components/catalog-browser-layout.ts", import.meta.url),
  "utf8",
);

describe("PluginsPage density", () => {
  it("keeps the plugin search as the primary desktop control with a bounded category rail", () => {
    expect(source).toContain('className="page plugins-page"');
    expect(source).toContain(
      'className="plugins-catalog-controls grid grid-cols-[minmax(520px,1fr)_minmax(460px,0.78fr)]',
    );
    expect(source).toContain('label="Plugin catalog summary"');
    expect(source).toContain(
      'className="filter-bar plugins-filter-bar grid min-w-0 grid-cols-[minmax(0,1fr)_clamp(176px,22vw,240px)]',
    );
    expect(source).toContain(
      'className="plugins-filter-label font-[var(--font-mono)]',
    );
    expect(source).toContain('id="plugin-category-label"');
    expect(source).toContain(
      'className="plugins-category-trigger w-full min-w-0"',
    );
    expect(source).toContain("max-[1180px]:grid-cols-1");
    expect(source).toContain("max-[680px]:grid-cols-1");
    expect(workspace).toContain("grid-cols-2 gap-x-[22px]");
    expect(workspace).toContain("max-[1180px]:grid-cols-1");
    expect(catalogBrowserLayout).toContain("max-[820px]:grid-cols-1");
  });

  it("normalizes the catalog once and keeps purpose in a focused detail pane", () => {
    expect(source).toContain("buildPluginCatalogEntries(");
    expect(source).toContain("<PluginCatalogWorkspace");
    expect(model).toContain(
      'title: pluginDisplayTitle(id || "unnamed-plugin", category)',
    );
    expect(workspace).toContain("min-[821px]:h-[clamp(380px,42vh,500px)]");
    expect(workspace).toContain("CATALOG_EYEBROW_CLASS}>Plugin detail");
    expect(workspace).toContain("selected.description");
    expect(workspace).toContain("selected.packageName");
    expect(workspace).not.toContain("CompactCatalogList");
  });
});
