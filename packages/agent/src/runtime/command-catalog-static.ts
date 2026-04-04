import { BrowserCommandCatalogEntries } from "./command-catalog/browser";
import { DelegationCommandCatalogEntries } from "./command-catalog/delegation";
import { ExecutionCommandCatalogEntries } from "./command-catalog/execution";
import { GatewayCommandCatalogEntries } from "./command-catalog/gateway";
import { MediaCommandCatalogEntries } from "./command-catalog/media";
import { MemoryCommandCatalogEntries } from "./command-catalog/memory";
import { ResearchCommandCatalogEntries } from "./command-catalog/research";
import { RuntimeCommandCatalogEntries } from "./command-catalog/runtime";
import { SkillsCommandCatalogEntries } from "./command-catalog/skills";
import { WorkspaceCommandCatalogEntries } from "./command-catalog/workspace";

export type { CommandCatalogEntry } from "./command-catalog/types";

export const STATIC_COMMAND_CATALOG = [
  ...RuntimeCommandCatalogEntries,
  ...ExecutionCommandCatalogEntries,
  ...ResearchCommandCatalogEntries,
  ...SkillsCommandCatalogEntries,
  ...MemoryCommandCatalogEntries,
  ...DelegationCommandCatalogEntries,
  ...GatewayCommandCatalogEntries,
  ...BrowserCommandCatalogEntries,
  ...MediaCommandCatalogEntries,
  ...WorkspaceCommandCatalogEntries,
];
