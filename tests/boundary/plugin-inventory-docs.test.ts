import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildInventoryRows } from "../../scripts/sync-doc-truth/inventory";

vi.mock("@doolittle/agent/config/env", () => ({ loadConfig: () => ({}) }));
vi.mock("@doolittle/agent/runtime/native/plugin-catalog", () => ({
  getNativePluginCatalog: () => [
    {
      id: "providers.example",
      packageName: "@doolittle/plugin-example",
      category: "providers",
      kind: "provider",
      maturity: "alpha",
      persistence: "none",
      source: "custom",
      notes: "Example provider.",
    },
  ],
}));

it("reports a missing Doolittle provider workspace without calling it external", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-inventory-"));
  try {
    const plugins = join(root, "packages/plugins");
    mkdirSync(join(plugins, "doolittle-plugin"), { recursive: true });
    const missing = buildInventoryRows(root).find(
      (row) => row.id === "providers.example",
    );
    expect(missing).toMatchObject({
      workspacePath: "(missing workspace)",
      owner: "doolittle-runtime",
      publishIntent: "missing-workspace",
      tests: "unavailable",
    });

    const provider = join(plugins, "plugin-example");
    mkdirSync(provider);
    writeFileSync(
      join(provider, "package.json"),
      JSON.stringify({ name: "@doolittle/plugin-example" }),
    );
    const present = buildInventoryRows(root).find(
      (row) => row.id === "providers.example",
    );
    expect(present).toMatchObject({
      workspacePath: "packages/plugins/plugin-example",
      publishIntent: "public-provider-bridge",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
