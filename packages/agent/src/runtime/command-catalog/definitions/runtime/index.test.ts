import { describe, expect, it } from "vitest";
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
    expect(RuntimeToolingCommandCatalogEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "/e2b list" }),
        expect.objectContaining({ command: "/e2b create [node-js|python]" }),
        expect.objectContaining({
          command:
            "/e2b exec [--sandbox <id>] <python|javascript|typescript|bash> :: <code>",
        }),
        expect.objectContaining({ command: "/e2b kill [sandbox-id]" }),
      ]),
    );
  });
});
