import { describe, expect, it } from "bun:test";
import {
  RuntimeAdminCommandCatalogEntries,
  RuntimeCommandCatalogEntries,
  RuntimeCoreCommandCatalogEntries,
  RuntimeGatewayCommandCatalogEntries,
  RuntimeToolingCommandCatalogEntries,
} from ".";

describe("runtime command catalog definitions", () => {
  it("preserves the canonical runtime command ordering across grouped slices", () => {
    expect(RuntimeCommandCatalogEntries).toEqual([
      ...RuntimeAdminCommandCatalogEntries,
      ...RuntimeCoreCommandCatalogEntries,
      ...RuntimeGatewayCommandCatalogEntries,
      ...RuntimeToolingCommandCatalogEntries,
    ]);
  });

  it("exposes entries for each runtime command group", () => {
    expect(RuntimeAdminCommandCatalogEntries).toContainEqual(
      expect.objectContaining({ command: "/accounts" }),
    );
    expect(RuntimeCoreCommandCatalogEntries).toContainEqual(
      expect.objectContaining({ command: "/theme set <name>" }),
    );
    expect(RuntimeGatewayCommandCatalogEntries).toContainEqual(
      expect.objectContaining({ command: "/transport status" }),
    );
    expect(RuntimeToolingCommandCatalogEntries).toContainEqual(
      expect.objectContaining({ command: "/runtime e2b" }),
    );
  });
});
