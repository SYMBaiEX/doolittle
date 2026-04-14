import { describe, expect, it } from "bun:test";
import {
  BrowserCommandCatalogEntries,
  COMMAND_CATALOG_DEFINITION_SETS,
  COMMAND_CATALOG_DEFINITIONS,
  DelegationCommandCatalogEntries,
  ExecutionCommandCatalogEntries,
  GatewayCommandCatalogEntries,
  MediaCommandCatalogEntries,
  MemoryCommandCatalogEntries,
  ResearchCommandCatalogEntries,
  RuntimeCommandCatalogEntries,
  SkillsCommandCatalogEntries,
  WorkspaceCommandCatalogEntries,
} from "./definitions";

describe("command catalog definitions", () => {
  it("re-exports the topical definition sets in canonical order", () => {
    expect(COMMAND_CATALOG_DEFINITION_SETS).toEqual([
      RuntimeCommandCatalogEntries,
      ExecutionCommandCatalogEntries,
      ResearchCommandCatalogEntries,
      SkillsCommandCatalogEntries,
      MemoryCommandCatalogEntries,
      DelegationCommandCatalogEntries,
      GatewayCommandCatalogEntries,
      BrowserCommandCatalogEntries,
      MediaCommandCatalogEntries,
      WorkspaceCommandCatalogEntries,
    ]);
  });

  it("flattens all topical command entries", () => {
    const expectedLength = COMMAND_CATALOG_DEFINITION_SETS.reduce(
      (total, entries) => total + entries.length,
      0,
    );

    expect(COMMAND_CATALOG_DEFINITIONS).toHaveLength(expectedLength);
    expect(COMMAND_CATALOG_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        command: "/commands",
        category: "runtime",
      }),
    );
    expect(COMMAND_CATALOG_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        command: "/gateway transports",
        category: "gateway",
      }),
    );
    expect(COMMAND_CATALOG_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        command: "/browser capture <url>",
        category: "browser",
      }),
    );
  });
});
