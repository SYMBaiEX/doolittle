import { describe, expect, it } from "vitest";
import {
  AutomationCommandCatalogEntries,
  BrowserCommandCatalogEntries,
  COMMAND_CATALOG_DEFINITION_SETS,
  COMMAND_CATALOG_DEFINITIONS,
  DelegationCommandCatalogEntries,
  DevelopmentCommandCatalogEntries,
  ExecutionCommandCatalogEntries,
  GatewayCommandCatalogEntries,
  MediaCommandCatalogEntries,
  MemoryCommandCatalogEntries,
  ResearchCommandCatalogEntries,
  RuntimeCommandCatalogEntries,
  SessionCommandCatalogEntries,
  SkillsCommandCatalogEntries,
  ToolingCommandCatalogEntries,
  WorkspaceCommandCatalogEntries,
} from "./definitions";
import { COMMAND_CATALOG } from "./registry";

describe("command catalog definitions", () => {
  it("re-exports the topical definition sets in canonical order", () => {
    expect(COMMAND_CATALOG_DEFINITION_SETS).toEqual([
      RuntimeCommandCatalogEntries,
      SessionCommandCatalogEntries,
      ExecutionCommandCatalogEntries,
      ToolingCommandCatalogEntries,
      DevelopmentCommandCatalogEntries,
      AutomationCommandCatalogEntries,
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
    expect(COMMAND_CATALOG_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        command: "/mcp marketplace search <query>",
        category: "tools",
      }),
    );
    expect(COMMAND_CATALOG_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        command:
          "/cron create <schedule> | name:<name> | skills:<slugs> | personality:<name> | provider:<provider> | model:<model> :: <prompt>",
        category: "workflow",
      }),
    );
  });

  it("preserves executable command roots as aliases after canonicalization", () => {
    const findCommand = (command: string) =>
      COMMAND_CATALOG.find((entry) => entry.command.startsWith(command));

    expect(findCommand("/cron-create")?.aliases).toContain("/cron");
    expect(findCommand("/model-list")?.aliases).toEqual(
      expect.arrayContaining(["/model", "/models"]),
    );
    expect(findCommand("/pulse")?.aliases).toContain("/now");
    expect(findCommand("/runtime-plugins")?.aliases).toEqual(
      expect.arrayContaining(["/plugins", "/runtime"]),
    );
  });
});
