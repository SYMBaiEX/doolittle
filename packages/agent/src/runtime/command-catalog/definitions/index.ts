import type { CommandCatalogEntry } from "../types";
import { AutomationCommandCatalogEntries } from "./automation";
import { BrowserCommandCatalogEntries } from "./browser";
import { DelegationCommandCatalogEntries } from "./delegation";
import { DevelopmentCommandCatalogEntries } from "./development";
import { ExecutionCommandCatalogEntries } from "./execution";
import { GatewayCommandCatalogEntries } from "./gateway";
import { MediaCommandCatalogEntries } from "./media";
import { MemoryCommandCatalogEntries } from "./memory";
import { ResearchCommandCatalogEntries } from "./research";
import { RuntimeCommandCatalogEntries } from "./runtime";
import { SessionCommandCatalogEntries } from "./session";
import { SkillsCommandCatalogEntries } from "./skills";
import { ToolingCommandCatalogEntries } from "./tooling";
import { WorkspaceCommandCatalogEntries } from "./workspace";

export {
  AutomationCommandCatalogEntries,
  BrowserCommandCatalogEntries,
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
};

export const COMMAND_CATALOG_DEFINITION_SETS: readonly CommandCatalogEntry[][] =
  [
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
  ];

export const COMMAND_CATALOG_DEFINITIONS: CommandCatalogEntry[] =
  COMMAND_CATALOG_DEFINITION_SETS.flat();
