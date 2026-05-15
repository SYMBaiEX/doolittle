import type { CommandCatalogEntry } from "../types";
import { BrowserCommandCatalogEntries } from "./browser";
import { DelegationCommandCatalogEntries } from "./delegation";
import { ExecutionCommandCatalogEntries } from "./execution";
import { GatewayCommandCatalogEntries } from "./gateway";
import { MediaCommandCatalogEntries } from "./media";
import { MemoryCommandCatalogEntries } from "./memory";
import { ResearchCommandCatalogEntries } from "./research";
import { RuntimeCommandCatalogEntries } from "./runtime";
import { SkillsCommandCatalogEntries } from "./skills";
import { ToolingCommandCatalogEntries } from "./tooling";
import { WorkspaceCommandCatalogEntries } from "./workspace";

export {
  BrowserCommandCatalogEntries,
  DelegationCommandCatalogEntries,
  ExecutionCommandCatalogEntries,
  GatewayCommandCatalogEntries,
  MediaCommandCatalogEntries,
  MemoryCommandCatalogEntries,
  ResearchCommandCatalogEntries,
  RuntimeCommandCatalogEntries,
  SkillsCommandCatalogEntries,
  ToolingCommandCatalogEntries,
  WorkspaceCommandCatalogEntries,
};

export const COMMAND_CATALOG_DEFINITION_SETS: readonly CommandCatalogEntry[][] =
  [
    RuntimeCommandCatalogEntries,
    ExecutionCommandCatalogEntries,
    ToolingCommandCatalogEntries,
    ResearchCommandCatalogEntries,
    SkillsCommandCatalogEntries,
    MemoryCommandCatalogEntries,
    DelegationCommandCatalogEntries,
    GatewayCommandCatalogEntries,
    BrowserCommandCatalogEntries,
    MediaCommandCatalogEntries,
    WorkspaceCommandCatalogEntries,
  ];

export const COMMAND_CATALOG_DEFINITIONS: CommandCatalogEntry[] =
  COMMAND_CATALOG_DEFINITION_SETS.flat();
