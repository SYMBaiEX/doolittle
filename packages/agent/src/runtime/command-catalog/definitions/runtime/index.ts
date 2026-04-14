import type { CommandCatalogEntry } from "../../types";
import { RuntimeAdminCommandCatalogEntries } from "./admin";
import { RuntimeGatewayCommandCatalogEntries } from "./gateway";
import { RuntimeCoreCommandCatalogEntries } from "./runtime";
import { RuntimeToolingCommandCatalogEntries } from "./tooling";

export {
  RuntimeAdminCommandCatalogEntries,
  RuntimeCoreCommandCatalogEntries,
  RuntimeGatewayCommandCatalogEntries,
  RuntimeToolingCommandCatalogEntries,
};

export const RuntimeCommandCatalogEntries: CommandCatalogEntry[] = [
  ...RuntimeAdminCommandCatalogEntries,
  ...RuntimeCoreCommandCatalogEntries,
  ...RuntimeGatewayCommandCatalogEntries,
  ...RuntimeToolingCommandCatalogEntries,
];
